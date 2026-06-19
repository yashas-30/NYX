import logger from '../../lib/logger.js';
/* eslint-disable */
import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { spawn, ChildProcess, exec, execFile } from 'child_process';
import * as si from 'systeminformation';
import { LocalModelManager } from './localModelManager.js';
import { registerProcess } from '../../lib/processRegistry.js';
import kill from 'tree-kill';
import { Mutex } from 'async-mutex';
import type { OptimizationProfile } from './modelTypes.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { gguf } from '@huggingface/gguf';
import crypto from 'crypto';
import net from 'net';

import { MODELS_DIR as BASE_DIR, findPythonPath } from '../../lib/paths.js';
const BIN_DIR = path.join(BASE_DIR, 'bin');

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';
const BIN_NAME = IS_WIN ? 'llama-server.exe' : 'llama-server';
const BINARY_PATH = path.join(BIN_DIR, BIN_NAME);

import { HardwareDetector } from './hardwareDetector.js';
import { env } from '../../config/env.js';
const { findLlamaServerPath } = HardwareDetector;

// Ensure binary directory exists
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

type ModelState = 'idle' | 'downloading' | 'starting' | 'running' | 'stopping';

function getModelFormat(modelId: string): 'gguf' | 'unknown' {
  const presets = LocalModelManager.listModels();
  const preset = presets.find((p) => p.id === modelId);
  if (preset?.fileName.endsWith('.gguf')) return 'gguf';
  return 'unknown';
}

// ── State machine (mutex-protected) ──────────────────────────────────────────
const runnerMutex = new Mutex();
let activePort = env.LLAMA_PORT || LOCAL_MODEL_PORT;

async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    // fallow-ignore-next-line code-duplication
    server.listen(startPort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

function getLlamaPort(): number {
  return activePort;
}
let modelState: ModelState = 'idle';
let activeProcess: ChildProcess | null = null;
let activeModelId: string | null = null;
let activeContextSize = 2048;
let activeTaskType: 'chat' | 'code' | 'analysis' | null = null;
let startProgress = 0;

// ── Health check / zombie detection ──────────────────────────────────────────
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveHealthFailures = 0;
const HEALTH_CHECK_INTERVAL_MS = 15000; // 15 seconds to allow for CPU-heavy prompt processing
const MAX_HEALTH_FAILURES = 4; // 4 consecutive failures (1 minute total of unresponsiveness)

function startHealthCheckLoop(): void {
  stopHealthCheckLoop();
  consecutiveHealthFailures = 0;
  healthCheckInterval = setInterval(async () => {
    if (modelState !== 'running') {
      stopHealthCheckLoop();
      return;
    }

    // Check if the process exited/died on its own
    if (activeProcess && activeProcess.exitCode !== null) {
      logger.warn(
        `[LocalModelRunner] Process has exited with code ${activeProcess.exitCode}. Resetting state to idle.`
      );
      stopHealthCheckLoop();
      activeProcess = null;
      activeModelId = null;
      modelState = 'idle';
      return;
    }

    try {
      const port = getLlamaPort();
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        consecutiveHealthFailures = 0;
        return;
      }
    } catch {
      // fetch failed
    }

    consecutiveHealthFailures++;
    logger.warn(
      `[LocalModelRunner] Health check failed (${consecutiveHealthFailures}/${MAX_HEALTH_FAILURES})`
    );
    if (consecutiveHealthFailures >= MAX_HEALTH_FAILURES) {
      if (activeProcess && activeProcess.exitCode === null) {
        logger.info(
          `[LocalModelRunner] Health check failure threshold reached, but process is still running (busy processing inference). Skipping auto-kill to avoid cutting off prompt.`
        );
        consecutiveHealthFailures = MAX_HEALTH_FAILURES - 1; // Cap to prevent infinite logs but avoid killing
      } else {
        logger.error(
          '[LocalModelRunner] Process is unresponsive and has exited or is invalid. Cleaning up...'
        );
        stopHealthCheckLoop();
        LocalModelRunner.stop().catch(() => {});
      }
    }
  }, HEALTH_CHECK_INTERVAL_MS);
  healthCheckInterval.unref?.();
}

function stopHealthCheckLoop(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  consecutiveHealthFailures = 0;
}

async function _stop(): Promise<void> {
  stopHealthCheckLoop();
  if (!activeProcess) {
    activeModelId = null;
    activeTaskType = null;
    modelState = 'idle';
    return;
  }

  logger.info('Terminating local model runner child process...');
  modelState = 'stopping';

  return new Promise<void>((resolve) => {
    if (activeProcess) {
      const pid = activeProcess.pid;
      if (pid) {
        kill(pid, 'SIGKILL', (err) => {
          if (err) {
            logger.warn({ error: err.message }, `[LocalModelRunner] Failed to tree-kill process ${pid}`);
          }
          activeProcess = null;
          activeModelId = null;
          activeTaskType = null;
          modelState = 'idle';
          resolve();
        });
      } else {
        activeProcess.kill('SIGKILL');
        activeProcess = null;
        activeModelId = null;
        activeTaskType = null;
        modelState = 'idle';
        resolve();
      }
    } else {
      activeModelId = null;
      activeTaskType = null;
      modelState = 'idle';
      resolve();
    }
  });
}

const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

function killProcessOnPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === 'win32'
        ? `netstat -ano | findstr :${port}`
        : `lsof -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null || lsof -t -i:${port}`;

    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve();
        return;
      }

      const lines = stdout.trim().split('\n');
      const pids = new Set<string>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (process.platform === 'win32') {
          // Verify that this is the listening socket by checking for "LISTENING"
          const isListening = line.toUpperCase().includes('LISTENING');
          if (!isListening) continue;

          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            const numPid = parseInt(pid, 10);
            if (numPid !== process.pid && numPid !== process.ppid) {
              pids.add(pid);
            }
          }
        } else {
          const pid = parts[0];
          if (pid && /^\d+$/.test(pid)) {
            const numPid = parseInt(pid, 10);
            if (numPid !== process.pid && numPid !== process.ppid) {
              pids.add(pid);
            }
          }
        }
      }

      if (pids.size === 0) {
        resolve();
        return;
      }

      const killPromises = Array.from(pids).map((pid) => {
        return new Promise<void>((res) => {
          const killCmd =
            process.platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
          logger.info(`[Local Runner] Zombie detection: Killing process ${pid} on port ${port}...`);
          exec(killCmd, () => res());
        });
      });

      Promise.all(killPromises).then(() => {
        setTimeout(resolve, 800);
      });
    });
  });
}

export const LocalModelRunner = {
  getState(): ModelState {
    return modelState;
  },

  getActiveModel() {
    return activeModelId;
  },

  getActiveContextSize() {
    return activeContextSize;
  },

  getActiveTaskType() {
    return activeTaskType;
  },

  isRunning() {
    return modelState === 'running';
  },

  getStartStatus() {
    return {
      isStarting: modelState === 'starting',
      progress: startProgress,
      activeModelId,
    };
  },

  getFreeVram() {
    return HardwareDetector.getFreeVram();
  },
  getOptimalVulkanDevice() {
    return HardwareDetector.getOptimalVulkanDevice();
  },
  detectGPUs() {
    return HardwareDetector.detectGPUs();
  },
  calculateOptimalLayers(modelId: string, contextSize?: number) {
    return HardwareDetector.calculateOptimalLayers(modelId, contextSize);
  },
  detectBackend() {
    return HardwareDetector.detectBackend();
  },

  async ensureBinaryInstalled(
    forceBackend?: 'cuda' | 'vulkan' | 'metal'
  ): Promise<'cuda' | 'vulkan' | 'metal'> {
    let backend = forceBackend || (await this.detectBackend());
    const versionFilePath = path.join(BIN_DIR, '.version');

    // Fetch latest release from GitHub API
    let CURRENT_VERSION = 'b9479'; // default fallback
    try {
      const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tag_name) {
          CURRENT_VERSION = data.tag_name;
        }
      }
    } catch (err) {
      logger.warn('[Binary Updater] Failed to check GitHub for updates. Using fallback version.');
    }

    let expectedVersion = `${CURRENT_VERSION}-${backend}-${process.platform}`;
    let installedVersion = '';
    if (fs.existsSync(versionFilePath)) {
      try {
        installedVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
      } catch {}
    }

    const resolvedBinaryPath = findLlamaServerPath();
    let binaryReady = fs.existsSync(resolvedBinaryPath) && installedVersion === expectedVersion;

    if (binaryReady) return backend;

    logger.info(
      `Portable llama-server version ${CURRENT_VERSION} (${backend.toUpperCase()}) not found or outdated. Downloading...`
    );
    modelState = 'downloading';
    startProgress = 10;

    let assetUrl = '';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';
    const isWin = process.platform === 'win32';

    if (isMac) {
      assetUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-macos-${os.arch() === 'arm64' ? 'arm64' : 'x64'}.tar.gz`;
    } else if (isLinux) {
      assetUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-ubuntu-${backend === 'vulkan' ? 'vulkan-' : ''}x64.tar.gz`;
    } else {
      assetUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-win-${backend === 'cuda' ? 'cuda-12.4' : 'vulkan'}-x64.zip`;
    }

    const archivePath = path.join(BIN_DIR, isWin ? 'llama-bin.zip' : 'llama-bin.tar.gz');

    try {
      startProgress = 20;
      await this.downloadBinaryZipNode(assetUrl, archivePath);
      startProgress = 60;
      logger.info('Archive downloaded successfully. Extracting natively...');

      if (isWin) {
        const zip = new AdmZip(archivePath);
        // fallow-ignore-next-line code-duplication
        zip.extractAllTo(BIN_DIR, true);

        // Ensure llama-server.exe is in the root of BIN_DIR
        const findBinRecursive = (dir: string): string | null => {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) {
              const res = findBinRecursive(p);
              if (res) return res;
            } else if (f === 'llama-server.exe') {
              return p;
            }
          }
          return null;
        };
        const actualBinPath = findBinRecursive(BIN_DIR);
        if (actualBinPath && actualBinPath !== path.join(BIN_DIR, 'llama-server.exe')) {
          fs.renameSync(actualBinPath, path.join(BIN_DIR, 'llama-server.exe'));
        }
      } else {
        // fallow-ignore-next-line code-duplication
        await tar.x({ file: archivePath, cwd: BIN_DIR });

        // Find llama-server recursively
        const findBinRecursive = (dir: string): string | null => {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            const p = path.join(dir, f);
            if (fs.statSync(p).isDirectory()) {
              const res = findBinRecursive(p);
              if (res) return res;
            } else if (f === 'llama-server') {
              return p;
            }
          }
          return null;
        };
        const actualBinPath = findBinRecursive(BIN_DIR);
        if (actualBinPath && actualBinPath !== path.join(BIN_DIR, 'llama-server')) {
          fs.renameSync(actualBinPath, path.join(BIN_DIR, 'llama-server'));
        }
        fs.chmodSync(path.join(BIN_DIR, 'llama-server'), 0o755);
      }

      startProgress = 90;
      fs.writeFileSync(versionFilePath, expectedVersion, 'utf-8');

      try {
        fs.unlinkSync(archivePath);
      } catch {}

      startProgress = 100;
      modelState = 'idle';
      logger.info(`Binary extraction complete. Native llama-server ${CURRENT_VERSION} ready.`);
      return backend;
    } catch (error: any) {
      modelState = 'idle';
      startProgress = 0;
      try {
        fs.unlinkSync(archivePath);
      } catch {}
      throw new Error(`Failed to initialize built-in llama-server executable: ${error.message}`);
    }
  },

  downloadBinaryZipNode(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);

      const makeRequest = (currentUrl: string) => {
        const urlObj = new URL(currentUrl);
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: '*/*',
          },
        };

        const req = https.get(urlObj, options, (res) => {
          if (
            res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308
          ) {
            let redirectUrl = res.headers.location;
            res.resume();
            if (redirectUrl) {
              if (!redirectUrl.startsWith('http')) {
                redirectUrl = new URL(redirectUrl, currentUrl).href;
              }
              makeRequest(redirectUrl);
              return;
            }
          }

          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`Server responded with status ${res.statusCode}`));
            return;
          }

          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close(() => resolve());
          });
        });

        req.setTimeout(120000, () => req.destroy(new Error('Timeout')));
        req.on('error', (err) => {
          fileStream.close(() => {
            try {
              fs.unlinkSync(destPath);
            } catch {}
            reject(err);
          });
        });
      };

      makeRequest(url);
    });
  },

  async start(
    modelId: string,
    settings?: any,
    optimizationProfile?: OptimizationProfile,
    fallbackStage: 'none' | 'vulkan' | 'cpu' = 'none'
  ): Promise<void> {
    const { traceActiveSpan } = await import('../../lib/otel.js');
    return await traceActiveSpan('LocalModelRunner.start', async (span) => {
      span.setAttributes({
        'model.id': modelId,
        'model.fallback_stage': fallbackStage,
      });
      return runnerMutex.runExclusive(async () => {
        await this._startInternal(modelId, settings, optimizationProfile, fallbackStage);
      });
    });
  },

  async _startInternal(
    modelId: string,
    settings?: any,
    optimizationProfile?: OptimizationProfile,
    fallbackStage: 'none' | 'vulkan' | 'cpu' = 'none'
  ): Promise<void> {
    if (
      activeModelId === modelId &&
      activeProcess &&
      activeContextSize >= (settings?.contextSize || 8192)
    ) {
      return;
    }

    const defaultPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;
    // Use dynamic port finding starting from default port
    const port = await findAvailablePort(activePort || defaultPort);
    activePort = port;

    // Check if the port is already alive and running the correct model
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const healthData = await res.json().catch(() => ({}));
        if (healthData.status === 'ok' || healthData.status === 'success') {
          // Port is alive! Check if it's the model we want
          let isSameModel = false;
          try {
            const propsRes = await fetch(`http://127.0.0.1:${port}/props`, {
              signal: AbortSignal.timeout(1500),
            });
            if (propsRes.ok) {
              const propsData = await propsRes.json();
              const loadedPath = (propsData.model_path || '').toLowerCase();
              const targetPreset = LocalModelManager.listModels().find((m) => m.id === modelId);
              const targetFileName = (targetPreset?.fileName || '').toLowerCase();

              if (targetFileName && loadedPath.includes(targetFileName)) {
                isSameModel = true;
              }
            }
          } catch {}

          if (isSameModel) {
            // Before adopting, verify the running server's actual context size.
            // If the running server has LESS context than requested, we must kill and restart it
            // with the larger context — simply adopting it would leave the model under-provisioned,
            // causing EXCEED_CONTEXT_SIZE_ERROR on the next large request.
            let runningCtxSize = 0;
            try {
              const slotsRes = await fetch(`http://127.0.0.1:${port}/slots`, {
                signal: AbortSignal.timeout(1500),
              });
              if (slotsRes.ok) {
                const slotsData = await slotsRes.json();
                if (Array.isArray(slotsData) && slotsData[0]?.n_ctx) {
                  runningCtxSize = slotsData[0].n_ctx;
                }
              }
            } catch {}

            const requestedCtx = settings?.contextSize || 8192;
            if (runningCtxSize > 0 && runningCtxSize < requestedCtx) {
              logger.info(
                `[Local Runner] Port ${port} has model ${modelId} but ctx=${runningCtxSize} < needed=${requestedCtx}. Restarting with larger context...`
              );
              await killProcessOnPort(port);
              // Fall through to spawn a new process below
            } else {
              logger.info(
                `[Local Runner] Port ${port} is already running the correct model: ${modelId} (ctx=${runningCtxSize || 'unknown'}). Adopting running server...`
              );
              modelState = 'running';
              activeModelId = modelId;
              activeContextSize = runningCtxSize || requestedCtx;
              activeTaskType = settings?.taskType || 'code';
              startHealthCheckLoop();
              return;
            }
          } else {
            logger.info(
              `[Local Runner] Port ${port} is active but running a different model or unresponsive. Freeing port...`
            );
            await killProcessOnPort(port);
          }
        }
      }
    } catch {
      // Port is not listening or timed out, which is normal
    }

    const format = getModelFormat(modelId);
    if (format === 'unknown') {
      throw new Error(`Unsupported model format or preset for modelId: '${modelId}'`);
    }

    if (modelState !== 'idle' && modelState !== 'downloading' && modelState !== 'running') {
      throw new Error(`Cannot start model: currently ${modelState}`);
    }

    if (activeProcess) {
      logger.info('Stopping active local model runner to load new model...');
      await _stop();
      // Wait for Windows to fully release GPU VRAM after killing the old process.
      // Without this delay, nvidia-smi still reports the old VRAM as used for ~1-2s,
      // causing the VRAM optimizer to calculate 0 GPU layers and fall back to CPU.
      await new Promise((r) => setTimeout(r, 1500));
    }

    modelState = 'starting';
    startProgress = 5;

    if (!optimizationProfile) {
      try {
        const { ModelOptimizer } = await import('./modelOptimizer.js');
        const optimizer = new ModelOptimizer();
        optimizationProfile = await optimizer.generateProfile(
          modelId,
          settings?.taskType || 'code',
          settings?.priority || 'balanced'
        );
        logger.info(
          { profile: optimizationProfile },
          '[GPU Optimizer] Generated optimization profile'
        );
      } catch (error: any) {
        logger.error(
          error,
          '[GPU Optimizer] Failed to auto-generate optimization profile'
        );
      }
    }

    let gpuLayers = 99;
    let localSettings = settings;
    let usedBackend: 'cuda' | 'vulkan' | 'metal' = 'vulkan';

    try {
      // Choose backend based on fallback stage
      const forcedBackend =
        fallbackStage === 'vulkan' ? 'vulkan' : fallbackStage === 'cpu' ? 'vulkan' : undefined;
      usedBackend = await this.ensureBinaryInstalled(forcedBackend);
      startProgress = 40;

      // Save/retrieve settings
      let existingSettings: any = {};
      if (fs.existsSync(CONFIG_PATH)) {
        try {
          existingSettings = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (error: any) {
          logger.error('Failed to read local models config.json:', error.message);
        }
      }

      if (localSettings) {
        localSettings = { ...existingSettings, ...localSettings };
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(localSettings, null, 2));
        } catch (error: any) {
          logger.error('Failed to write local models config.json:', error.message);
        }
      } else {
        localSettings = existingSettings;
      }

      // Safe defaults
      const cpus = os.cpus().length;
      const defaultThreads = Math.max(1, Math.floor(cpus * 0.75));

      // Force gpuLayers to 0 if fallbackStage is cpu
      if (fallbackStage === 'cpu') {
        gpuLayers = 0;
      } else {
        gpuLayers = optimizationProfile
          ? optimizationProfile.gpuLayers
          : typeof localSettings?.gpuLayers === 'number'
            ? localSettings.gpuLayers
            : 99;
      }
      const threads = optimizationProfile
        ? optimizationProfile.threads
        : typeof localSettings?.threads === 'number'
          ? localSettings.threads
          : defaultThreads;
      // Always honour the explicitly requested contextSize from settings (e.g., auto-upscale request for 8192/16384/etc.).
      // The optimizer profile's contextSize is a *suggestion* based on task type, but the caller knows the actual
      // required context for the current conversation. We take whichever is larger.
      const profileCtx = optimizationProfile?.contextSize ?? 4096;
      const requestedCtx =
        typeof localSettings?.contextSize === 'number' ? localSettings.contextSize : 8192;
      const contextSize = Math.max(profileCtx, requestedCtx);

      // Task type detection
      const currentTaskType = optimizationProfile
        ? optimizationProfile.taskType
        : localSettings?.taskType || 'code';

      // Quantization tier enforcement
      const QUANT_TIERS = ['Q2_K', 'Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
      const MIN_CODE_QUANT = 'Q4_K_M';
      const DEFAULT_CODE_QUANT = 'Q5_K_M';
      let selectedQuant: string = optimizationProfile
        ? optimizationProfile.quantization
        : localSettings?.quantization || DEFAULT_CODE_QUANT;
      const quantIdx = QUANT_TIERS.indexOf(selectedQuant);
      const minQuantIdx = QUANT_TIERS.indexOf(MIN_CODE_QUANT);
      if (currentTaskType === 'code' && quantIdx >= 0 && quantIdx < minQuantIdx) {
        logger.warn(
          `[Quantization Guard] Blocked low-quality quant '${selectedQuant}' — upgrading to minimum safe '${MIN_CODE_QUANT}' for code generation.`
        );
        selectedQuant = MIN_CODE_QUANT;
      }
      logger.info(
        `[Quantization] Using quant tier: ${selectedQuant} (Optimized for task type: ${currentTaskType})`
      );

      // Sampling defaults tuned for task type
      const defaultTemp = currentTaskType === 'chat' ? 0.7 : 0.1;
      const codingTemperature =
        typeof localSettings?.temperature === 'number' ? localSettings.temperature : defaultTemp;
      const topP = typeof localSettings?.topP === 'number' ? localSettings.topP : 0.9;
      const topK = typeof localSettings?.topK === 'number' ? localSettings.topK : 20;
      const minP = typeof localSettings?.minP === 'number' ? localSettings.minP : 0.05;

      const models = LocalModelManager.listModels();
      const model = models.find((m) => m.id === modelId);
      if (!model || model.status !== 'completed' || !model.filePath) {
        throw new Error(`Model '${modelId}' is not fully downloaded or available.`);
      }

      // Calculate how many layers can actually fit in free VRAM
      let maxGpuLayers = 32;
      let batchSize = 512;
      let microBatchSize = 512;
      let fileSizeBytes = 2 * 1024 * 1024 * 1024;
      let hasGPU = false;
      let gpuInfoList: any[] = [];

      try {
        const optimal = await this.calculateOptimalLayers(modelId, contextSize);
        maxGpuLayers = optimal.gpuLayers;
        batchSize = optimal.batchSize;
        microBatchSize = optimal.microBatchSize;
        fileSizeBytes = optimal.fileSize;
        hasGPU = optimal.hasGPU;
        gpuInfoList = optimal.gpuInfo;
        logger.info(
          `[GPU Optimizer] VRAM analysis for ${modelId}: max safe layers = ${maxGpuLayers}/${optimal.totalLayers}. (${optimal.message})`
        );
      } catch (error: any) {
        logger.error(
          '[GPU Optimizer] Failed to dynamically calculate offload capacity:',
          error.message
        );
      }

      // Force gpuLayers to 0 if fallbackStage is cpu
      if (fallbackStage === 'cpu') {
        gpuLayers = 0;
      } else {
        if (gpuLayers === 99) {
          gpuLayers = maxGpuLayers;
          logger.info(
            `[GPU Optimizer] Maximum offload mode active. Offloading exactly ${gpuLayers} layers to GPU VRAM. Remaining layers run on CPU/RAM.`
          );
        } else if (gpuLayers > maxGpuLayers) {
          logger.info(
            `[GPU Optimizer] Requested GPU layers (${gpuLayers}) exceeds calculated safe limit (${maxGpuLayers}). Capping to ${maxGpuLayers} to prevent GPU OOM crash. Remaining layers run on CPU/RAM.`
          );
          gpuLayers = maxGpuLayers;
        } else {
          logger.info(
            `[GPU Optimizer] Using requested GPU layers: ${gpuLayers}. Remaining layers run on CPU/RAM.`
          );
        }
      }

      logger.info(
        `Spawning native llama-server.exe for GGUF: ${model.name} (ngl: ${gpuLayers}, threads: ${threads}, ctx: ${contextSize}, batch: ${batchSize}, backend: ${usedBackend})`
      );
      startProgress = 60;

      // Base llama-server arguments
      const args: string[] = [
        '-m',
        model.filePath,
        '--port',
        String(getLlamaPort()),
        '--host',
        '127.0.0.1', // Bind strictly to localhost
        '-c',
        String(contextSize),
        '--threads',
        String(threads),
        '-b',
        String(batchSize),
        '-ub',
        String(microBatchSize),
        '--parallel',
        '1', // Single user local execution to maximize slot context & VRAM offload
        '-ngl',
        String(gpuLayers),
        '--temp',
        String(codingTemperature), // Near-greedy for code accuracy (0.1 default)
        '--top-p',
        String(topP), // Nucleus sampling
        '--top-k',
        String(topK), // Top-k filter
        '--min-p',
        String(minP), // MinP: filters wildly unlikely tokens — reduces hallucinations
        '--mlock', // --mlock prevents swapping (locks RAM on Windows/Unix)
      ];

      if (localSettings?.loraPath && fs.existsSync(localSettings.loraPath)) {
        logger.info(`[LoRA] Attaching LoRA adapter: ${localSettings.loraPath}`);
        args.push('--lora', localSettings.loraPath);
      }

      // Enable optimizations if GPU offloading is active
      if (gpuLayers > 0) {
        // Flash attention: only supported on CUDA backend, not Vulkan. Never pass --flash-attn on Vulkan.
        // The optimizer may have set useFlashAttn=true for any NVIDIA GPU (including Vulkan), so we
        // override it here to only use flash attn if the actual installed backend is CUDA.
        const useFlash =
          usedBackend === 'cuda' && (optimizationProfile ? optimizationProfile.useFlashAttn : true);
        if (useFlash) {
          args.push('--flash-attn', 'on');
        }
        args.push('--cont-batching');

        let cacheQuant = optimizationProfile ? optimizationProfile.kvCacheQuant : 'q8_0';
        // Vulkan backend has scheduling split input crashes when using quantized KV cache in llama.cpp. Force f16 on Vulkan.
        if (usedBackend === 'vulkan') {
          cacheQuant = 'f16';
        }
        if (cacheQuant !== 'f16') {
          args.push('--cache-type-k', cacheQuant);
          args.push('--cache-type-v', cacheQuant);
        }

        // Multi-GPU Splitting
        if (optimizationProfile?.tensorSplit && gpuInfoList.length > 1) {
          args.push('--main-gpu', '0');
          args.push('--split-mode', 'layer');
          args.push(
            '--tensor-split',
            optimizationProfile.tensorSplit.map((n) => n.toFixed(2)).join(',')
          );
        } else if (gpuInfoList.length > 1) {
          args.push('--main-gpu', '0');
          args.push('--split-mode', 'layer');
          const totalGPUVram = gpuInfoList.reduce((sum: number, g: any) => sum + g.vramBytes, 0);
          const splits = gpuInfoList.map((g: any) => (g.vramBytes / totalGPUVram).toFixed(2));
          args.push('--tensor-split', splits.join(','));
        }
      }

      // Speculative Decoding (2-3x speedup)
      const enableSpeculative = optimizationProfile
        ? optimizationProfile.speculativeDecoding
        : true;
      if (enableSpeculative) {
        const MODELS_DIR_PATH = path.dirname(model.filePath);
        const draftModelPath = path.join(MODELS_DIR_PATH, `${modelId}-draft.gguf`);
        if (fs.existsSync(draftModelPath)) {
          args.push('--draft-model', draftModelPath);
          args.push('--draft', '5');
          logger.info(
            `[Speculative Decoding] Draft model found: ${draftModelPath}. Speculating 5 tokens per step.`
          );
        } else {
          const genericDraftPaths = [
            path.join(MODELS_DIR_PATH, 'llama-3.2-1b-native.gguf'),
            path.join(MODELS_DIR_PATH, 'gemma-2-2b-it.gguf'),
          ];
          const foundDraft = genericDraftPaths.find((p) => fs.existsSync(p));
          if (foundDraft && foundDraft !== model.filePath) {
            args.push('--draft-model', foundDraft);
            args.push('--draft', '5');
            logger.info(
              `[Speculative Decoding] Generic draft model found at: ${foundDraft}. Speculating 5 tokens per step.`
            );
          }
        }
      }

      const optimalDevice = await this.getOptimalVulkanDevice();

      const spawnEnv: Record<string, string> = {
        ...(process.env as Record<string, string>),
        VK_LOG_LEVEL: 'none',
      };

      if (usedBackend === 'metal') {
        logger.info(`[GPU Optimizer] Running on Metal Backend natively`);
      } else if (optimalDevice) {
        args.push('--device', optimalDevice.name);
        logger.info(
          `[GPU Optimizer] Forcing llama-server to run on optimal device: ${optimalDevice.name} (Index ${optimalDevice.index})`
        );

        if (optimalDevice.type === 'device' || optimalDevice.type === 'vulkan') {
          spawnEnv['GGML_VK_VISIBLE_DEVICES'] = String(optimalDevice.index);
          spawnEnv['GGML_VULKAN_DEVICE'] = String(optimalDevice.index);
          logger.info(
            `[GPU Optimizer] Setting environment variables: GGML_VK_VISIBLE_DEVICES = ${optimalDevice.index}, GGML_VULKAN_DEVICE = ${optimalDevice.index}`
          );
        } else if (optimalDevice.type === 'cuda') {
          spawnEnv['CUDA_VISIBLE_DEVICES'] = String(optimalDevice.index);
          logger.info(
            `[GPU Optimizer] Setting environment variable: CUDA_VISIBLE_DEVICES = ${optimalDevice.index}`
          );
        }
      } else if (gpuInfoList && gpuInfoList.length > 0) {
        const discreteGPU = gpuInfoList.find((g) => {
          const m = g.model.toLowerCase();
          const v = g.vendor.toLowerCase();
          return (
            m.includes('geforce') ||
            m.includes('rtx') ||
            m.includes('gtx') ||
            m.includes('radeon') ||
            v.includes('nvidia') ||
            v.includes('amd')
          );
        });
        if (discreteGPU) {
          logger.info(
            `[GPU Optimizer] Fallback: Forcing discrete GPU visible devices at index: ${discreteGPU.index}`
          );
          spawnEnv['GGML_VK_VISIBLE_DEVICES'] = String(discreteGPU.index);
          spawnEnv['GGML_VULKAN_DEVICE'] = String(discreteGPU.index);
          spawnEnv['CUDA_VISIBLE_DEVICES'] = String(discreteGPU.index);
          if (usedBackend === 'cuda') {
            args.push('--device', `CUDA${discreteGPU.index}`);
          } else {
            args.push('--device', `Vulkan${discreteGPU.index}`);
          }
        }
      }

      const resolvedBinaryPath = findLlamaServerPath();
      activeProcess = spawn(resolvedBinaryPath, args, {
        cwd: path.dirname(resolvedBinaryPath),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: spawnEnv,
      });
      registerProcess(activeProcess);

      const currentProc = activeProcess;
      currentProc.on('exit', (code, signal) => {
        logger.info(
          `[LocalModelRunner] llama-server process exited with code ${code} and signal ${signal}`
        );
        if (modelState !== 'stopping' && activeProcess === currentProc) {
          stopHealthCheckLoop();
          activeProcess = null;
          activeModelId = null;
          modelState = 'idle';
        }
      });

      activeModelId = modelId;

      const logFilePath = path.join(BASE_DIR, '..', '.nyx-logs', 'llama-server.log');
      try {
        const logsDir = path.dirname(logFilePath);
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        fs.writeFileSync(logFilePath, '', 'utf-8');
      } catch {}

      const stderrLogs: string[] = [];

      // Drain stdout and stderr to prevent OS buffer deadlocks (critical for Windows/llama.cpp)
      activeProcess.stdout?.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
          logger.info(`[llama-server]: ${str}`);
          try {
            fs.appendFileSync(logFilePath, `[STDOUT] ${str}\n`, 'utf-8');
          } catch {}
        }
      });

      activeProcess.stderr?.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
          stderrLogs.push(str);
          if (stderrLogs.length > 20) stderrLogs.shift();

          if (str.toLowerCase().includes('error') || str.toLowerCase().includes('fail')) {
            logger.error(`[llama-server-err]: ${str}`);
          } else {
            logger.info(`[llama-server-log]: ${str}`);
          }
          try {
            fs.appendFileSync(logFilePath, `[STDERR] ${str}\n`, 'utf-8');
          } catch {}

          // Active OOM / CUDA device loss crash protection
          if (
            str.includes('CUDA out of memory') ||
            str.toLowerCase().includes('oom') ||
            str.includes('failed to allocate')
          ) {
            logger.error(
              '[llama-server] Critical GPU VRAM OOM crash detected! Auto-evicting model runner...'
            );
            this.stop().catch(() => {});
          }
        }
      });

      // Poll port health endpoint
      startProgress = 80;
      let healthy = false;
      const maxAttempts = 300; // 300 seconds maximum timeout (5 minutes) for loading models
      for (let i = 0; i < maxAttempts; i++) {
        // Check if the process has exited early
        if (activeProcess.exitCode !== null) {
          const exitMsg = stderrLogs.join('\n') || `Exit code: ${activeProcess.exitCode}`;
          throw new Error(
            `llama-server process exited prematurely during model load. Stderr:\n${exitMsg}`
          );
        }

        await new Promise((r) => setTimeout(r, 1000));
        try {
          const port = getLlamaPort();
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok' || data.status === 'success') {
              healthy = true;
              break;
            }
          }
        } catch {
          // Keep waiting
        }
      }

      if (!healthy) {
        throw new Error(
          'Local llama-server did not become healthy in time (timeout after 300 seconds).'
        );
      }

      startProgress = 100;
      modelState = 'running';
      activeContextSize = contextSize;
      activeTaskType = currentTaskType;
      startHealthCheckLoop();
      logger.info(
        `Native llama-server running successfully on http://localhost:${getLlamaPort()} with model ${model.name}`
      );
    } catch (error: any) {
      modelState = 'idle';
      startProgress = 0;
      await _stop();

      if (fallbackStage === 'none' && gpuLayers > 0) {
        if (usedBackend === 'cuda') {
          logger.warn(
            `[Local Runner] Spawn failed with CUDA offload (ngl: ${gpuLayers}). Error: ${error.message}. Retrying with Vulkan backend...`
          );
          return this._startInternal(modelId, localSettings, undefined, 'vulkan');
        } else {
          logger.warn(
            `[Local Runner] Spawn failed with Vulkan offload (ngl: ${gpuLayers}). Error: ${error.message}. Retrying with CPU-only mode (-ngl 0)...`
          );
          const fallbackSettings = { ...localSettings, gpuLayers: 0 };
          return this._startInternal(modelId, fallbackSettings, undefined, 'cpu');
        }
      } else if (fallbackStage === 'vulkan' && gpuLayers > 0) {
        logger.warn(
          `[Local Runner] Spawn failed with Vulkan fallback (ngl: ${gpuLayers}). Error: ${error.message}. Retrying with CPU-only mode (-ngl 0)...`
        );
        const fallbackSettings = { ...localSettings, gpuLayers: 0 };
        return this._startInternal(modelId, fallbackSettings, undefined, 'cpu');
      }

      throw error;
    }
  },

  async stop(): Promise<void> {
    const { traceActiveSpan } = await import('../../lib/otel.js');
    return await traceActiveSpan('LocalModelRunner.stop', async (span) => {
      if (activeModelId) {
        span.setAttribute('model.id', activeModelId);
      }
      return runnerMutex.runExclusive(async () => {
        await _stop();
      });
    });
  },

  getModelPort(modelId: string | null): number {
    return getLlamaPort();
  },

  async monitorAndAdjust(modelId: string): Promise<void> {
    if (!this.isRunning() || modelState !== 'running') return;

    const gpus = await this.detectGPUs();
    if (gpus.length === 0) return;

    const primaryGPU = gpus[0];
    const freeVram = await this.getFreeVram();

    // Default config values
    const config = {
      enableDynamicUnload: true,
      ramHeadroomMB: 2048,
    };

    // Check VRAM pressure
    const vramUsed = primaryGPU.vramBytes - freeVram;
    const vramPressure = vramUsed / primaryGPU.vramBytes;

    if (vramPressure > 0.9 && config.enableDynamicUnload) {
      logger.warn(
        '[LocalModelRunner] VRAM pressure detected (>90%). Consider reducing context or layers.'
      );
    }

    // Monitor system RAM
    const freeRam = os.freemem();
    if (freeRam < config.ramHeadroomMB * 1024 * 1024) {
      logger.warn('[LocalModelRunner] System RAM critically low.');
    }
  },

  async getOptimalContextSize(
    modelId: string,
    requestedTokens: number,
    config = {
      vramHeadroomMB: 1024,
      ramHeadroomMB: 2048,
      minContextTokens: 1024,
      maxContextTokens: 32768,
    }
  ): Promise<number> {
    const gpus = await this.detectGPUs();
    const freeRam = os.freemem();

    // Calculate KV cache size for requested tokens
    const optimal = await this.calculateOptimalLayers(modelId, requestedTokens);
    const kvCacheSize = (optimal.totalLayers * requestedTokens * 220 * 1024) / 32; // ~220KB per layer per token

    // Check if it fits in available memory
    const availableMemory = gpus.length > 0 ? gpus[0].vramBytes + freeRam : freeRam;

    const modelSize = optimal.fileSize;
    const totalNeeded = modelSize + kvCacheSize + config.vramHeadroomMB * 1024 * 1024;

    if (totalNeeded > availableMemory) {
      // Scale down context to fit
      const scaleFactor = availableMemory / totalNeeded;
      const adjustedTokens = Math.floor(requestedTokens * scaleFactor * 0.9); // 10% safety margin
      return Math.max(config.minContextTokens, adjustedTokens);
    }

    return Math.min(requestedTokens, config.maxContextTokens);
  },
};
