import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { spawn, ChildProcess, exec, execFile } from 'child_process';
import * as si from 'systeminformation';
import { LocalModelManager } from './localModelManager.ts';
import { registerProcess } from './processRegistry.ts';
import kill from 'tree-kill';
import { MODEL_LAYERS } from '../config/constants.ts';
import { Mutex } from 'async-mutex';

import { MODELS_DIR as BASE_DIR } from './paths.ts';
const BIN_DIR = path.join(BASE_DIR, 'bin');
const BINARY_PATH = path.join(BIN_DIR, 'llama-server.exe');

// Ensure binary directory exists
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

type ModelState = 'idle' | 'downloading' | 'starting' | 'running' | 'stopping';

// ── State machine (mutex-protected) ──────────────────────────────────────────
const runnerMutex = new Mutex();
let modelState: ModelState = 'idle';
let activeProcess: ChildProcess | null = null;
let activeModelId: string | null = null;
let activeContextSize = 2048;
let startProgress = 0;

// ── Health check / zombie detection ──────────────────────────────────────────
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let consecutiveHealthFailures = 0;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const MAX_HEALTH_FAILURES = 3;

function startHealthCheckLoop(): void {
  stopHealthCheckLoop();
  consecutiveHealthFailures = 0;
  healthCheckInterval = setInterval(async () => {
    if (modelState !== 'running') { stopHealthCheckLoop(); return; }
    try {
      const res = await fetch('http://127.0.0.1:12345/health', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        consecutiveHealthFailures = 0;
        return;
      }
    } catch {
      // fetch failed
    }
    consecutiveHealthFailures++;
    console.warn(`[LocalModelRunner] Health check failed (${consecutiveHealthFailures}/${MAX_HEALTH_FAILURES})`);
    if (consecutiveHealthFailures >= MAX_HEALTH_FAILURES) {
      console.error('[LocalModelRunner] llama-server is unresponsive (zombie). Auto-killing...');
      stopHealthCheckLoop();
      LocalModelRunner.stop().catch(() => {});
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
    modelState = 'idle';
    return;
  }

  console.log('Terminating local model runner child process...');
  modelState = 'stopping';
  
  return new Promise<void>((resolve) => {
    if (activeProcess) {
      const pid = activeProcess.pid;
      if (pid) {
        kill(pid, 'SIGKILL', (err) => {
          if (err) {
            console.warn(`[LocalModelRunner] Failed to tree-kill process ${pid}:`, err.message);
          }
          activeProcess = null;
          activeModelId = null;
          modelState = 'idle';
          resolve();
        });
      } else {
        activeProcess.kill('SIGKILL');
        activeProcess = null;
        activeModelId = null;
        modelState = 'idle';
        resolve();
      }
    } else {
      activeModelId = null;
      modelState = 'idle';
      resolve();
    }
  });
}

const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

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

  isRunning() {
    return modelState === 'running';
  },

  getStartStatus() {
    return {
      isStarting: modelState === 'starting',
      progress: startProgress,
      activeModelId
    };
  },

  getFreeVram(): Promise<number> {
    return new Promise((resolve) => {
      const commands = [
        'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
        '"C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits'
      ];

      const tryExec = (idx: number) => {
        if (idx >= commands.length) {
          resolve(0);
          return;
        }
        exec(commands[idx], (error: any, stdout: string) => {
          if (error) {
            tryExec(idx + 1);
          } else {
            const mem = parseInt(stdout.trim(), 10);
            resolve(isNaN(mem) ? 0 : mem * 1024 * 1024); // Convert MiB to bytes
          }
        });
      };

      tryExec(0);
    });
  },

  getOptimalVulkanDevice(): Promise<{ name: string; index: number; type: string } | null> {
    return new Promise((resolve) => {
      exec(`"${BINARY_PATH}" --list-devices`, { cwd: BIN_DIR }, (error: any, stdout: string, stderr: string) => {
        const output = (stdout || '') + '\n' + (stderr || '');
        if (!output.trim()) {
          resolve(null);
          return;
        }
        const lines = output.split('\n');
        
        // Priority list of discrete GPU keywords
        const discreteKeywords = ['nvidia', 'geforce', 'rtx', 'gtx', 'radeon', 'intel(r) arc'];
        
        for (const line of lines) {
          const match = line.match(/^\s*(Device|Vulkan|CUDA)\s*(\d+)\s*:?/i);
          if (match) {
            const type = match[1].toLowerCase();
            const idxStr = match[2];
            const idx = parseInt(idxStr, 10);
            const lowerLine = line.toLowerCase();
            
            if (discreteKeywords.some(kw => lowerLine.includes(kw))) {
              let name = `Vulkan${idx}`;
              if (type === 'cuda') {
                name = `CUDA${idx}`;
              }
              resolve({ name, index: idx, type });
              return;
            }
          }
        }
        
        // Fallback to first listed Vulkan device if no discrete match found
        for (const line of lines) {
          const match = line.match(/^\s*(Device|Vulkan|CUDA)\s*(\d+)\s*:?/i);
          if (match) {
            const type = match[1].toLowerCase();
            const idxStr = match[2];
            const idx = parseInt(idxStr, 10);
            let name = `Vulkan${idx}`;
            if (type === 'cuda') {
              name = `CUDA${idx}`;
            }
            resolve({ name, index: idx, type });
            return;
          }
        }
        
        resolve(null);
      });
    });
  },

  async detectGPUs(): Promise<{ vendor: string; model: string; vramBytes: number; index: number }[]> {
    try {
      const graphics = await si.graphics();
      let list = (graphics && graphics.controllers) ? graphics.controllers : [];
      
      const parsedList = list
        .filter(g => {
          const v = (g.vendor || '').toLowerCase();
          const m = (g.model || '').toLowerCase();
          return v.includes('nvidia') || v.includes('amd') || v.includes('intel') || 
                 m.includes('nvidia') || m.includes('radeon') || m.includes('geforce') || m.includes('rtx');
        })
        .map((g, i) => {
          let vramMB = g.vram || g.memoryTotal || 0;
          if (typeof vramMB !== 'number' || isNaN(vramMB) || vramMB < 0) {
            vramMB = 0;
          }
          
          // Fallback for discrete cards reporting 0 VRAM
          const lowerModel = (g.model || '').toLowerCase();
          const lowerVendor = (g.vendor || '').toLowerCase();
          const isDiscrete = lowerModel.includes('geforce') || lowerModel.includes('rtx') || lowerModel.includes('gtx') || lowerModel.includes('radeon') || lowerVendor.includes('nvidia') || lowerVendor.includes('amd');
          if (vramMB === 0 && isDiscrete) {
            vramMB = 4096; // Fallback to 4GB
          }
          
          return {
            vendor: g.vendor || 'Unknown',
            model: g.model || 'Unknown',
            vramBytes: vramMB * 1024 * 1024,
            index: i
          };
        });

      // If no GPUs detected but nvidia-smi is available, synthesize NVIDIA GPU!
      if (parsedList.length === 0) {
        try {
          const freeVram = await this.getFreeVram();
          if (freeVram > 0) {
            console.log('[GPU Detection] Synthesizing primary NVIDIA GPU from nvidia-smi query');
            parsedList.push({
              vendor: 'NVIDIA',
              model: 'GeForce Dedicated GPU',
              vramBytes: freeVram + (750 * 1024 * 1024), // Add baseline overhead back for raw VRAM estimation
              index: 0
            });
          }
        } catch {}
      }

      // Sort discrete/high-performance GPUs first
      const sortedList = parsedList.sort((a, b) => {
        const aModel = a.model.toLowerCase();
        const bModel = b.model.toLowerCase();
        const aVendor = a.vendor.toLowerCase();
        const bVendor = b.vendor.toLowerCase();
        
        const aIsDiscrete = aModel.includes('geforce') || aModel.includes('rtx') || aModel.includes('gtx') || aModel.includes('radeon') || aVendor.includes('nvidia');
        const bIsDiscrete = bModel.includes('geforce') || bModel.includes('rtx') || bModel.includes('gtx') || bModel.includes('radeon') || bVendor.includes('nvidia');
        
        if (aIsDiscrete && !bIsDiscrete) return -1;
        if (!aIsDiscrete && bIsDiscrete) return 1;
        
        // Otherwise sort by VRAM size descending
        return b.vramBytes - a.vramBytes;
      });

      return sortedList.filter(g => g.vramBytes > 0);
    } catch (err) {
      console.warn('[GPU Detection] Failed to query systeminformation graphics:', err);
      try {
        const freeVram = await this.getFreeVram();
        if (freeVram > 0) {
          return [{
            vendor: 'NVIDIA',
            model: 'GeForce Dedicated GPU',
            vramBytes: freeVram + (750 * 1024 * 1024),
            index: 0
          }];
        }
      } catch {}
      return [];
    }
  },

  async calculateOptimalLayers(modelId: string, contextSize = 2048): Promise<{
    gpuLayers: number;
    totalLayers: number;
    batchSize: number;
    microBatchSize: number;
    fileSize: number;
    message: string;
    hasGPU: boolean;
    gpuInfo: { vendor: string; model: string; vramBytes: number; index: number }[];
  }> {
    let totalLayers = 32;
    const models = LocalModelManager.listModels();
    const model = models.find(m => m.id === modelId);

    if (model) {
      if (MODEL_LAYERS[model.id]) {
        totalLayers = MODEL_LAYERS[model.id];
      } else {
        const filenameLower = model.fileName.toLowerCase();
        if (filenameLower.includes('70b') || filenameLower.includes('80l')) {
          totalLayers = 80;
        } else if (filenameLower.includes('32b') || filenameLower.includes('35b') || filenameLower.includes('64l')) {
          totalLayers = 64;
        } else if (filenameLower.includes('22b') || filenameLower.includes('27b') || filenameLower.includes('56l')) {
          totalLayers = 56;
        } else if (filenameLower.includes('14b') || filenameLower.includes('13b') || filenameLower.includes('12b') || filenameLower.includes('40l')) {
          totalLayers = 40;
        } else if (filenameLower.includes('8b') || filenameLower.includes('9b') || filenameLower.includes('7b') || filenameLower.includes('32l')) {
          totalLayers = 32;
        } else if (filenameLower.includes('3b') || filenameLower.includes('4b') || filenameLower.includes('28l')) {
          totalLayers = 28;
        } else if (filenameLower.includes('1.5b') || filenameLower.includes('2b') || filenameLower.includes('24l')) {
          totalLayers = 24;
        } else if (filenameLower.includes('1b') || filenameLower.includes('16l')) {
          totalLayers = 16;
        }
      }
    }

    let fileSize = 2 * 1024 * 1024 * 1024;
    if (model && model.status === 'completed' && model.filePath) {
      try {
        fileSize = fs.statSync(model.filePath).size;
      } catch {}
    } else if (model) {
      const parsed = parseFloat(model.size);
      if (!isNaN(parsed)) {
        fileSize = parsed * 1024 * 1024 * 1024;
      }
    }

    const gpus = await this.detectGPUs();
    const hasGPU = gpus.length > 0;
    
    // Estimate KV cache size (q8_0 quantized)
    const kvCachePerTokenPerLayer = 220 * 1024 / 32;
    const kvCacheSize = totalLayers * contextSize * kvCachePerTokenPerLayer;

    let batchSize = Math.min(2048, contextSize);
    let microBatchSize = Math.min(512, batchSize);

    if (!hasGPU) {
      return {
        gpuLayers: 0,
        totalLayers,
        batchSize,
        microBatchSize,
        fileSize,
        message: `No active GPU detected. Running all ${totalLayers} layers entirely on CPU/RAM.`,
        hasGPU: false,
        gpuInfo: []
      };
    }

    const primaryGPU = gpus[0];
    let availableVram = primaryGPU.vramBytes;
    
    if (primaryGPU.vendor.toLowerCase().includes('nvidia') || primaryGPU.model.toLowerCase().includes('nvidia')) {
      try {
        const freeNvidiaVram = await this.getFreeVram();
        if (freeNvidiaVram > 0) {
          availableVram = freeNvidiaVram;
        }
      } catch {}
    }

    const baselineOverhead = 750 * 1024 * 1024;
    const usableVram = Math.max(0, availableVram - baselineOverhead);

    const computeBuffer = batchSize * 512 * 4;
    const totalNeeded = fileSize + kvCacheSize + computeBuffer;

    if (totalNeeded > usableVram) {
      const safeCompute = usableVram - fileSize - kvCacheSize;
      if (safeCompute > 0) {
        batchSize = Math.max(128, Math.floor(safeCompute / (512 * 4)));
        batchSize = Math.min(2048, batchSize);
        microBatchSize = Math.min(512, batchSize);
      } else {
        batchSize = 512;
        microBatchSize = 128;
      }
    }

    const dynamicOverhead = kvCacheSize + (batchSize * 512 * 4);
    const layerSize = (fileSize + dynamicOverhead) / totalLayers;
    const maxLayersByVram = Math.floor(usableVram / layerSize);
    const safeLayers = Math.max(0, Math.min(totalLayers, maxLayersByVram));
    const pct = Math.round((safeLayers / totalLayers) * 100);

    let message = '';
    if (safeLayers >= totalLayers) {
      message = `GPU has abundant VRAM! Loaded all ${totalLayers}/${totalLayers} layers (100%) to GPU VRAM for maximum speed.`;
    } else {
      message = `GPU VRAM limit reached. Offloaded exactly ${safeLayers}/${totalLayers} layers (${pct}%) to VRAM. CPU/RAM handles the remaining ${totalLayers - safeLayers} layers.`;
    }

    return {
      gpuLayers: safeLayers,
      totalLayers,
      batchSize,
      microBatchSize,
      fileSize,
      message,
      hasGPU: true,
      gpuInfo: gpus
    };
  },

  async detectBackend(): Promise<'cuda' | 'vulkan'> {
    try {
      const gpus = await this.detectGPUs();
      const hasNvidia = gpus.some(g => {
        const vendor = (g.vendor || '').toLowerCase();
        const model = (g.model || '').toLowerCase();
        return vendor.includes('nvidia') || model.includes('nvidia') || model.includes('geforce') || model.includes('rtx') || model.includes('gtx');
      });
      return hasNvidia ? 'cuda' : 'vulkan';
    } catch {
      return 'vulkan';
    }
  },

  async ensureBinaryInstalled(forceBackend?: 'cuda' | 'vulkan'): Promise<'cuda' | 'vulkan'> {
    let backend = forceBackend || (await this.detectBackend());
    const vulkanDllPath = path.join(BIN_DIR, 'ggml-vulkan.dll');
    const cudaDllPath = path.join(BIN_DIR, 'cudart64_12.dll');
    const versionFilePath = path.join(BIN_DIR, '.version');
    const CURRENT_VERSION = 'b9294';
    let expectedVersion = `${CURRENT_VERSION}-${backend}`;

    let installedVersion = '';
    if (fs.existsSync(versionFilePath)) {
      try {
        installedVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
      } catch {}
    }
    
    // Check if the server executable, correct backend DLLs, and version exist.
    let binaryReady = fs.existsSync(BINARY_PATH) && (installedVersion === expectedVersion || (backend === 'vulkan' && installedVersion === CURRENT_VERSION));
    if (binaryReady) {
      if (backend === 'vulkan' && !fs.existsSync(vulkanDllPath)) {
        binaryReady = false;
      } else if (backend === 'cuda' && !fs.existsSync(cudaDllPath)) {
        binaryReady = false;
      }
    }

    // Smart Fallback: If CUDA is preferred but not ready, check if Vulkan is already installed and ready.
    if (!binaryReady && backend === 'cuda' && !forceBackend) {
      const vulkanReady = fs.existsSync(BINARY_PATH) && fs.existsSync(vulkanDllPath) && 
                          (installedVersion === `${CURRENT_VERSION}-vulkan` || installedVersion === CURRENT_VERSION);
      if (vulkanReady) {
        console.log('[GPU Optimizer] CUDA backend is preferred but not downloaded. Vulkan is already installed and ready. Using Vulkan to avoid slow download.');
        backend = 'vulkan';
        expectedVersion = `${CURRENT_VERSION}-vulkan`;
        binaryReady = true;
      }
    }

    if (binaryReady) {
      if (backend === 'vulkan' && installedVersion === CURRENT_VERSION) {
        try {
          fs.writeFileSync(versionFilePath, expectedVersion, 'utf-8');
        } catch {}
      }
      return backend;
    }

    // Clean up old files to avoid mismatched DLL issues
    const filesToClean = [
      BINARY_PATH,
      vulkanDllPath,
      cudaDllPath,
      path.join(BIN_DIR, 'ggml-cuda.dll'),
      path.join(BIN_DIR, 'cublas64_12.dll'),
      path.join(BIN_DIR, 'cublasLt64_12.dll'),
    ];
    for (const f of filesToClean) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    }

    modelState = 'downloading';
    startProgress = 10;
    console.log(`Portable llama-server.exe version ${CURRENT_VERSION} (${backend.toUpperCase()} backend) not found. Preparing direct download...`);

    const zipPath = path.join(BIN_DIR, 'llama-bin.zip');
    const cudartZipPath = path.join(BIN_DIR, 'cudart-bin.zip');

    try {
      if (backend === 'cuda') {
        const zipUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-win-cuda-12.4-x64.zip`;
        const cudartUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/cudart-llama-bin-win-cuda-12.4-x64.zip`;

        // Download main CUDA zip
        startProgress = 20;
        await this.downloadBinaryZip(zipUrl, zipPath);
        startProgress = 40;

        // Download CUDA runtime DLLs
        console.log('Downloading CUDA runtime libraries...');
        await this.downloadBinaryZip(cudartUrl, cudartZipPath);
        startProgress = 60;

        console.log('Extracting main CUDA archive natively via PowerShell...');
        await new Promise<void>((resolve, reject) => {
          const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`;
          exec(cmd, (err, stdout, stderr) => {
            if (err) {
              console.error('PowerShell extraction of CUDA binary failed:', stderr);
              reject(err);
            } else {
              resolve();
            }
          });
        });

        console.log('Extracting CUDA runtime libraries natively via PowerShell...');
        await new Promise<void>((resolve, reject) => {
          const cmd = `powershell -Command "Expand-Archive -Path '${cudartZipPath}' -DestinationPath '${BIN_DIR}' -Force"`;
          exec(cmd, (err, stdout, stderr) => {
            if (err) {
              console.error('PowerShell extraction of CUDA runtime failed:', stderr);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      } else {
        // Vulkan download
        const zipUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-win-vulkan-x64.zip`;
        startProgress = 20;
        await this.downloadBinaryZip(zipUrl, zipPath);
        startProgress = 60;
        console.log('Vulkan GPU binary downloaded successfully. Extracting archive natively via PowerShell...');

        await new Promise<void>((resolve, reject) => {
          const cmd = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`;
          exec(cmd, (err, stdout, stderr) => {
            if (err) {
              console.error('PowerShell extraction failed:', stderr);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      startProgress = 90;
      // Write the installed version
      try {
        fs.writeFileSync(versionFilePath, expectedVersion, 'utf-8');
      } catch (err: any) {
        console.error('Failed to write .version file:', err.message);
      }

      // Clean up zip files
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch {}
      }
      if (fs.existsSync(cudartZipPath)) {
        try { fs.unlinkSync(cudartZipPath); } catch {}
      }

      startProgress = 100;
      modelState = 'idle';
      console.log(`Binary extraction complete. Native llama-server.exe version ${CURRENT_VERSION} (${backend.toUpperCase()} backend) is ready.`);
      return backend;
    } catch (e: any) {
      modelState = 'idle';
      startProgress = 0;
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch {}
      }
      if (fs.existsSync(cudartZipPath)) {
        try { fs.unlinkSync(cudartZipPath); } catch {}
      }
      throw new Error(`Failed to initialize built-in llama-server executable: ${e.message}`);
    }
  },

  downloadBinaryZip(url: string, destPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Prefer native curl on Windows for speed and system-proxy compatibility
      if (process.platform === 'win32') {
        console.log(`[Binary Downloader] Attempting download via curl.exe from: ${url}`);
        const cmd = `curl.exe -L "${url}" -o "${destPath}"`;
        exec(cmd, (err, stdout, stderr) => {
          if (!err && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
            console.log(`[Binary Downloader] Successfully downloaded via curl: ${path.basename(destPath)}`);
            resolve();
          } else {
            console.warn(`[Binary Downloader] curl download failed or not available, falling back to Node https:`, err || stderr);
            this.downloadBinaryZipNode(url, destPath).then(resolve).catch(reject);
          }
        });
        return;
      }
      this.downloadBinaryZipNode(url, destPath).then(resolve).catch(reject);
    });
  },

  downloadBinaryZipNode(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      
      const makeRequest = (currentUrl: string) => {
        const urlObj = new URL(currentUrl);
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
          }
        };

        const req = https.get(urlObj, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            let redirectUrl = res.headers.location;
            res.resume(); // Free the socket
            if (redirectUrl) {
              if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                redirectUrl = new URL(redirectUrl, currentUrl).href;
              }
              makeRequest(redirectUrl);
              return;
            }
          }

          if (res.statusCode !== 200) {
            res.resume(); // Free the socket
            reject(new Error(`Server responded with status code ${res.statusCode}`));
            return;
          }

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => resolve());
          });
        });

        req.setTimeout(60000, () => {
          req.destroy(new Error('Download request timed out after 60 seconds'));
        });

        req.on('error', (err) => {
          fileStream.close(() => {
            try { fs.unlinkSync(destPath); } catch {}
            reject(err);
          });
        });
      };

      makeRequest(url);
    });
  },

  async start(modelId: string, settings?: any, fallbackStage: 'none' | 'vulkan' | 'cpu' = 'none'): Promise<void> {
    return runnerMutex.runExclusive(async () => {
      await this._startInternal(modelId, settings, fallbackStage);
    });
  },

  async _startInternal(modelId: string, settings?: any, fallbackStage: 'none' | 'vulkan' | 'cpu' = 'none'): Promise<void> {
    if (activeModelId === modelId && activeProcess && activeContextSize >= (settings?.contextSize || 2048)) {
      return; // Already running with equal or larger context window
    }

    if (modelState !== 'idle' && modelState !== 'downloading' && modelState !== 'running') {
      throw new Error(`Cannot start model: currently ${modelState}`);
    }

    if (activeProcess) {
      console.log('Stopping active local model runner to load new model...');
      await _stop();
    }

    modelState = 'starting';
    startProgress = 5;

    let gpuLayers = 99;
    let localSettings = settings;
    let usedBackend: 'cuda' | 'vulkan' = 'vulkan';

    try {
      // Choose backend based on fallback stage
      const forcedBackend = fallbackStage === 'vulkan' ? 'vulkan' : (fallbackStage === 'cpu' ? 'vulkan' : undefined);
      usedBackend = await this.ensureBinaryInstalled(forcedBackend);
      startProgress = 40;

      // Save/retrieve settings
      let existingSettings: any = {};
      if (fs.existsSync(CONFIG_PATH)) {
        try {
          existingSettings = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (err: any) {
          console.error('Failed to read local models config.json:', err.message);
        }
      }

      if (localSettings) {
        localSettings = { ...existingSettings, ...localSettings };
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(localSettings, null, 2));
        } catch (err: any) {
          console.error('Failed to write local models config.json:', err.message);
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
        gpuLayers = typeof localSettings?.gpuLayers === 'number' ? localSettings.gpuLayers : 99;
      }
      const threads = typeof localSettings?.threads === 'number' ? localSettings.threads : defaultThreads;
      const contextSize = typeof localSettings?.contextSize === 'number' ? localSettings.contextSize : 2048;

      // Quantization tier enforcement
      const QUANT_TIERS = ['Q2_K', 'Q3_K_M', 'Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0'];
      const MIN_CODE_QUANT = 'Q4_K_M';
      const DEFAULT_CODE_QUANT = 'Q5_K_M';
      let selectedQuant: string = localSettings?.quantization || DEFAULT_CODE_QUANT;
      const quantIdx = QUANT_TIERS.indexOf(selectedQuant);
      const minQuantIdx = QUANT_TIERS.indexOf(MIN_CODE_QUANT);
      if (quantIdx >= 0 && quantIdx < minQuantIdx) {
        console.warn(`[Quantization Guard] Blocked low-quality quant '${selectedQuant}' — upgrading to minimum safe '${MIN_CODE_QUANT}' for code generation.`);
        selectedQuant = MIN_CODE_QUANT;
      }
      console.log(`[Quantization] Using quant tier: ${selectedQuant} (Speed/Quality balance for coding)`);

      // Sampling defaults tuned for code generation
      const codingTemperature = typeof localSettings?.temperature === 'number' ? localSettings.temperature : 0.1;
      const topP = typeof localSettings?.topP === 'number' ? localSettings.topP : 0.9;
      const topK = typeof localSettings?.topK === 'number' ? localSettings.topK : 20;
      const minP = typeof localSettings?.minP === 'number' ? localSettings.minP : 0.05;

      const models = LocalModelManager.listModels();
      const model = models.find(m => m.id === modelId);
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
        console.log(`[GPU Optimizer] VRAM analysis for ${modelId}: max safe layers = ${maxGpuLayers}/${optimal.totalLayers}. (${optimal.message})`);
      } catch (err: any) {
        console.error('[GPU Optimizer] Failed to dynamically calculate offload capacity:', err.message);
      }

      // Force gpuLayers to 0 if fallbackStage is cpu
      if (fallbackStage === 'cpu') {
        gpuLayers = 0;
      } else {
        if (gpuLayers === 99) {
          gpuLayers = maxGpuLayers;
          console.log(`[GPU Optimizer] Maximum offload mode active. Offloading exactly ${gpuLayers} layers to GPU VRAM. Remaining layers run on CPU/RAM.`);
        } else if (gpuLayers > maxGpuLayers) {
          console.log(`[GPU Optimizer] Requested GPU layers (${gpuLayers}) exceeds calculated safe limit (${maxGpuLayers}). Capping to ${maxGpuLayers} to prevent GPU OOM crash. Remaining layers run on CPU/RAM.`);
          gpuLayers = maxGpuLayers;
        } else {
          console.log(`[GPU Optimizer] Using requested GPU layers: ${gpuLayers}. Remaining layers run on CPU/RAM.`);
        }
      }

      console.log(`Spawning native llama-server.exe for GGUF: ${model.name} (ngl: ${gpuLayers}, threads: ${threads}, ctx: ${contextSize}, batch: ${batchSize}, backend: ${usedBackend})`);
      startProgress = 60;

      // Base llama-server arguments
      const args: string[] = [
        '-m', model.filePath,
        '--port', '12345',
        '--host', '127.0.0.1',          // Bind strictly to localhost
        '-c', String(contextSize),
        '--threads', String(threads),
        '-b', String(batchSize),
        '-ub', String(microBatchSize),
        '--parallel', '1',              // Single user local execution to maximize slot context & VRAM offload
        '-ngl', String(gpuLayers),
        '--temp', String(codingTemperature), // Near-greedy for code accuracy (0.1 default)
        '--top-p', String(topP),        // Nucleus sampling
        '--top-k', String(topK),        // Top-k filter
        '--min-p', String(minP),        // MinP: filters wildly unlikely tokens — reduces hallucinations
      ];

      // Enable optimizations if GPU offloading is active
      if (gpuLayers > 0) {
        if (usedBackend === 'cuda') {
          args.push('--flash-attn', 'on'); // Only enable flash attention on CUDA to avoid Vulkan CPU-fallback slowdown
        }
        args.push('--cont-batching');   // Continuous batching for parallel slot execution
        args.push('--cache-type-k', 'q8_0'); // Quantize Key cache to 8-bit — halves KV memory overhead
        args.push('--cache-type-v', 'q8_0'); // Quantize Value cache to 8-bit

        // Multi-GPU Splitting
        if (gpuInfoList.length > 1) {
          args.push('--main-gpu', '0');
          args.push('--split-mode', 'layer');
          const totalGPUVram = gpuInfoList.reduce((sum: number, g: any) => sum + g.vramBytes, 0);
          const splits = gpuInfoList.map((g: any) => (g.vramBytes / totalGPUVram).toFixed(2));
          args.push('--tensor-split', splits.join(','));
        }
      }

      // Speculative Decoding (2-3x speedup)
      const MODELS_DIR_PATH = path.dirname(model.filePath);
      const draftModelPath = path.join(MODELS_DIR_PATH, `${modelId}-draft.gguf`);
      if (fs.existsSync(draftModelPath)) {
        args.push('--draft-model', draftModelPath);
        args.push('--draft', '5'); // Speculate 5 tokens per draft step
        console.log(`[Speculative Decoding] Draft model found: ${draftModelPath}. Speculating 5 tokens per step.`);
      } else {
        const genericDraftPaths = [
          path.join(MODELS_DIR_PATH, 'llama-3.2-1b-native.gguf'),
          path.join(MODELS_DIR_PATH, 'gemma-2-2b-it.gguf'),
        ];
        const foundDraft = genericDraftPaths.find(p => fs.existsSync(p));
        if (foundDraft && foundDraft !== model.filePath) {
          args.push('--draft-model', foundDraft);
          args.push('--draft', '5');
          console.log(`[Speculative Decoding] Generic draft model found at: ${foundDraft}. Speculating 5 tokens per step.`);
        }
      }

      const optimalDevice = await this.getOptimalVulkanDevice();
      
      const spawnEnv: Record<string, string> = {
        ...process.env as Record<string, string>,
        VK_LOG_LEVEL: 'none'
      };

      if (optimalDevice) {
        args.push('--device', optimalDevice.name);
        console.log(`[GPU Optimizer] Forcing llama-server to run on optimal device: ${optimalDevice.name} (Index ${optimalDevice.index})`);
        
        if (optimalDevice.type === 'device' || optimalDevice.type === 'vulkan') {
          spawnEnv['GGML_VK_VISIBLE_DEVICES'] = String(optimalDevice.index);
          spawnEnv['GGML_VULKAN_DEVICE'] = String(optimalDevice.index);
          console.log(`[GPU Optimizer] Setting environment variables: GGML_VK_VISIBLE_DEVICES = ${optimalDevice.index}, GGML_VULKAN_DEVICE = ${optimalDevice.index}`);
        } else if (optimalDevice.type === 'cuda') {
          spawnEnv['CUDA_VISIBLE_DEVICES'] = String(optimalDevice.index);
          console.log(`[GPU Optimizer] Setting environment variable: CUDA_VISIBLE_DEVICES = ${optimalDevice.index}`);
        }
      } else if (gpuInfoList && gpuInfoList.length > 0) {
        const discreteGPU = gpuInfoList.find(g => {
          const m = g.model.toLowerCase();
          const v = g.vendor.toLowerCase();
          return m.includes('geforce') || m.includes('rtx') || m.includes('gtx') || m.includes('radeon') || v.includes('nvidia') || v.includes('amd');
        });
        if (discreteGPU) {
          console.log(`[GPU Optimizer] Fallback: Forcing discrete GPU visible devices at index: ${discreteGPU.index}`);
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

      activeProcess = spawn(BINARY_PATH, args, {
        cwd: BIN_DIR,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: spawnEnv
      });
      registerProcess(activeProcess);

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
          console.log(`[llama-server]: ${str}`);
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
            console.error(`[llama-server-err]: ${str}`);
          } else {
            console.log(`[llama-server-log]: ${str}`);
          }
          try {
            fs.appendFileSync(logFilePath, `[STDERR] ${str}\n`, 'utf-8');
          } catch {}

          // Active OOM / CUDA device loss crash protection
          if (str.includes('CUDA out of memory') || str.toLowerCase().includes('oom') || str.includes('failed to allocate')) {
            console.error('[llama-server] Critical GPU VRAM OOM crash detected! Auto-evicting model runner...');
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
          throw new Error(`llama-server process exited prematurely during model load. Stderr:\n${exitMsg}`);
        }

        await new Promise(r => setTimeout(r, 1000));
        try {
          const res = await fetch('http://127.0.0.1:12345/health');
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
        throw new Error('Local llama-server did not become healthy in time (timeout after 300 seconds).');
      }

      startProgress = 100;
      modelState = 'running';
      activeContextSize = contextSize;
      startHealthCheckLoop();
      console.log(`Native llama-server running successfully on http://localhost:12345 with model ${model.name}`);
    } catch (e: any) {
      modelState = 'idle';
      startProgress = 0;
      await _stop();

      if (fallbackStage === 'none' && gpuLayers > 0) {
        if (usedBackend === 'cuda') {
          console.warn(`[Local Runner] Spawn failed with CUDA offload (ngl: ${gpuLayers}). Error: ${e.message}. Retrying with Vulkan backend...`);
          return this._startInternal(modelId, localSettings, 'vulkan');
        } else {
          console.warn(`[Local Runner] Spawn failed with Vulkan offload (ngl: ${gpuLayers}). Error: ${e.message}. Retrying with CPU-only mode (-ngl 0)...`);
          const fallbackSettings = { ...localSettings, gpuLayers: 0 };
          return this._startInternal(modelId, fallbackSettings, 'cpu');
        }
      } else if (fallbackStage === 'vulkan' && gpuLayers > 0) {
        console.warn(`[Local Runner] Spawn failed with Vulkan fallback (ngl: ${gpuLayers}). Error: ${e.message}. Retrying with CPU-only mode (-ngl 0)...`);
        const fallbackSettings = { ...localSettings, gpuLayers: 0 };
        return this._startInternal(modelId, fallbackSettings, 'cpu');
      }

      throw e;
    }
  },

  async stop(): Promise<void> {
    return runnerMutex.runExclusive(async () => {
      await _stop();
    });
  }
};
