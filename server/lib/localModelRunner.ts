import fs from 'fs';
import path from 'path';
import https from 'https';
import os from 'os';
import { spawn, ChildProcess, exec } from 'child_process';
import * as si from 'systeminformation';
import { LocalModelManager } from './localModelManager.ts';
import { registerProcess } from './processRegistry.ts';

import { MODELS_DIR as BASE_DIR } from './paths.ts';
const BIN_DIR = path.join(BASE_DIR, 'bin');
const BINARY_PATH = path.join(BIN_DIR, 'llama-server.exe');

// Ensure binary directory exists
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

let activeProcess: ChildProcess | null = null;
let activeModelId: string | null = null;
let activeContextSize = 2048;
let isStarting = false;
let startProgress = 0;

const CONFIG_PATH = path.join(BASE_DIR, 'config.json');

export const LocalModelRunner = {
  getActiveModel() {
    return activeModelId;
  },

  getActiveContextSize() {
    return activeContextSize;
  },

  isRunning() {
    return activeProcess !== null;
  },

  getStartStatus() {
    return {
      isStarting,
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

  getOptimalVulkanDevice(): Promise<string | null> {
    return new Promise((resolve) => {
      exec(`"${BINARY_PATH}" --list-devices`, (error: any, stdout: string) => {
        if (error || !stdout) {
          resolve(null);
          return;
        }
        const lines = stdout.split('\n');
        let selectedDevice: string | null = null;
        
        // Priority list of discrete GPU keywords
        const discreteKeywords = ['nvidia', 'geforce', 'rtx', 'gtx', 'radeon', 'intel(r) arc'];
        
        for (const line of lines) {
          const match = line.match(/^\s*(Vulkan\d+|CUDA\d+):/i);
          if (match) {
            const devName = match[1];
            const lowerLine = line.toLowerCase();
            
            // If it contains any discrete GPU keyword, select it immediately!
            if (discreteKeywords.some(kw => lowerLine.includes(kw))) {
              selectedDevice = devName;
              break;
            }
          }
        }
        
        // Fallback to first listed Vulkan device if no discrete match found
        if (!selectedDevice) {
          for (const line of lines) {
            const match = line.match(/^\s*(Vulkan\d+|CUDA\d+):/i);
            if (match) {
              selectedDevice = match[1];
              break;
            }
          }
        }
        
        resolve(selectedDevice);
      });
    });
  },

  async detectGPUs(): Promise<{ vendor: string; model: string; vramBytes: number; index: number }[]> {
    try {
      const graphics = await si.graphics();
      if (!graphics || !graphics.controllers) return [];
      
      const list = graphics.controllers
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
          return {
            vendor: g.vendor || 'Unknown',
            model: g.model || 'Unknown',
            vramBytes: vramMB * 1024 * 1024,
            index: i
          };
        });

      return list.filter(g => g.vramBytes > 0);
    } catch (err) {
      console.warn('[GPU Detection] Failed to query systeminformation graphics:', err);
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
    const MODEL_LAYERS: Record<string, number> = {
      'nyx-gemma-4-e2b-it': 35,
      'gemma-2-2b-it': 26,
      'gemma-2-9b-it': 42,
      'gemma-3-4b-it': 40,
      'gemma-3-12b-it': 40,
      'gemma-3-27b-it': 46,
      'llama-3.2-1b-native': 16,
      'llama-3.2-3b-native': 28,
      'llama-3-8b-instruct': 32,
      'llama-3.1-8b-native': 32,
      'llama-3.3-70b-native': 80,
      'codellama-7b-instruct': 32,
      'codellama-13b-instruct': 40,
      'phi-3-mini-instruct': 32,
      'phi-4-mini-instruct': 32,
      'phi-4-instruct': 40,
      'qwen2.5-1.5b-instruct': 28,
      'qwen2.5-coder-1.5b-native': 28,
      'qwen2.5-coder-3b-native': 36,
      'qwen2.5-coder-7b-native': 28,
      'qwen2.5-coder-14b-native': 48,
      'qwen2.5-coder-32b-instruct': 64,
      'qwen2.5-7b-native': 28,
      'qwen3-8b-native': 32,
      'deepseek-r1-distill-qwen-1.5b': 28,
      'deepseek-r1-distill-qwen-7b': 28,
      'deepseek-r1-distill-qwen-14b': 48,
      'deepseek-r1-distill-llama-8b': 32,
      'deepseek-r1-distill-qwen-32b': 64,
      'deepseek-r1-distill-llama-70b': 80,
      'mistral-7b-v0.3': 32,
      'mixtral-8x7b-instruct': 32,
      'codestral-22b': 56,
      'mixtral-8x22b-instruct': 56,
      'command-r-35b': 40,
      'command-r-plus-104b': 64,
      'openchat-3.5-7b': 32,
      'nemotron-mini-4b': 32,
      'nemotron-70b-instruct': 80
    };

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

  async ensureBinaryInstalled(): Promise<void> {
    const vulkanDllPath = path.join(BIN_DIR, 'ggml-vulkan.dll');
    const versionFilePath = path.join(BIN_DIR, '.version');
    const CURRENT_VERSION = 'b9294';

    let installedVersion = '';
    if (fs.existsSync(versionFilePath)) {
      try {
        installedVersion = fs.readFileSync(versionFilePath, 'utf-8').trim();
      } catch {}
    }
    
    // If the server executable, Vulkan DLL, and correct version exist, we are good.
    if (fs.existsSync(BINARY_PATH) && fs.existsSync(vulkanDllPath) && installedVersion === CURRENT_VERSION) {
      return;
    }

    // Clean up to ensure a clean zip extraction of Vulkan binaries
    if (fs.existsSync(BINARY_PATH)) {
      try { fs.unlinkSync(BINARY_PATH); } catch {}
    }
    if (fs.existsSync(vulkanDllPath)) {
      try { fs.unlinkSync(vulkanDllPath); } catch {}
    }

    isStarting = true;
    startProgress = 10;
    console.log(`Portable llama-server.exe version ${CURRENT_VERSION} (Vulkan GPU/VRAM) not found. Preparing direct Vulkan binary download...`);

    const zipUrl = `https://github.com/ggml-org/llama.cpp/releases/download/${CURRENT_VERSION}/llama-${CURRENT_VERSION}-bin-win-vulkan-x64.zip`;
    const zipPath = path.join(BIN_DIR, 'llama-bin.zip');

    try {
      // Step 1: Download zip
      startProgress = 20;
      await this.downloadBinaryZip(zipUrl, zipPath);
      startProgress = 60;
      console.log('Vulkan GPU binary downloaded successfully. Extracting archive natively via PowerShell...');

      // Step 2: Unzip via PowerShell
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

      startProgress = 90;
      // Write the installed version
      try {
        fs.writeFileSync(versionFilePath, CURRENT_VERSION, 'utf-8');
      } catch (err: any) {
        console.error('Failed to write .version file:', err.message);
      }

      // Step 3: Clean up zip file
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch {}
      }

      startProgress = 100;
      isStarting = false;
      console.log(`Binary extraction complete. Native llama-server.exe version ${CURRENT_VERSION} (Vulkan GPU/VRAM) is ready.`);
    } catch (e: any) {
      isStarting = false;
      startProgress = 0;
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch {}
      }
      throw new Error(`Failed to initialize built-in llama-server executable: ${e.message}`);
    }
  },

  downloadBinaryZip(url: string, destPath: string): Promise<void> {
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

  async start(modelId: string, settings?: any, isRetry = false): Promise<void> {
    if (activeModelId === modelId && activeProcess && activeContextSize >= (settings?.contextSize || 2048)) {
      return; // Already running with equal or larger context window
    }

    if (activeProcess) {
      console.log('Stopping active local model runner to load new model...');
      await this.stop();
    }

    isStarting = true;
    startProgress = 5;

    let gpuLayers = 99;
    let localSettings = settings;

    try {
      await this.ensureBinaryInstalled();
      startProgress = 40;

      // Save/retrieve settings
      if (localSettings) {
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(localSettings, null, 2));
        } catch (err: any) {
          console.error('Failed to write local models config.json:', err.message);
        }
      } else {
        if (fs.existsSync(CONFIG_PATH)) {
          try {
            localSettings = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
          } catch (err: any) {
            console.error('Failed to read local models config.json:', err.message);
          }
        }
      }

      // Safe defaults
      const cpus = os.cpus().length;
      const defaultThreads = Math.max(1, Math.floor(cpus * 0.75));

      gpuLayers = typeof localSettings?.gpuLayers === 'number' ? localSettings.gpuLayers : 99;
      const threads = typeof localSettings?.threads === 'number' ? localSettings.threads : defaultThreads;
      const contextSize = typeof localSettings?.contextSize === 'number' ? localSettings.contextSize : 2048;

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

      // Enforce dynamic offloading caps:
      if (gpuLayers === 99) {
        gpuLayers = maxGpuLayers;
        console.log(`[GPU Optimizer] Maximum offload mode active. Offloading exactly ${gpuLayers} layers to GPU VRAM. Remaining layers run on CPU/RAM.`);
      } else if (gpuLayers > maxGpuLayers) {
        console.log(`[GPU Optimizer] Requested GPU layers (${gpuLayers}) exceeds calculated safe limit (${maxGpuLayers}). Capping to ${maxGpuLayers} to prevent GPU OOM crash. Remaining layers run on CPU/RAM.`);
        gpuLayers = maxGpuLayers;
      } else {
        console.log(`[GPU Optimizer] Using requested GPU layers: ${gpuLayers}. Remaining layers run on CPU/RAM.`);
      }

      console.log(`Spawning native llama-server.exe for GGUF: ${model.name} (ngl: ${gpuLayers}, threads: ${threads}, ctx: ${contextSize}, batch: ${batchSize})`);
      startProgress = 60;

      // Helper function to look up model preset layers inside start
      const lookupPresetLayers = (mid: string): number => {
        const MODEL_LAYERS_LOOKUP: Record<string, number> = {
          'nyx-gemma-4-e2b-it': 35, 'gemma-2-2b-it': 26, 'gemma-2-9b-it': 42,
          'gemma-3-4b-it': 40, 'gemma-3-12b-it': 40, 'gemma-3-27b-it': 46,
          'llama-3.2-1b-native': 16, 'llama-3.2-3b-native': 28, 'llama-3-8b-instruct': 32,
          'llama-3.1-8b-native': 32, 'llama-3.3-70b-native': 80, 'codellama-7b-instruct': 32,
          'codellama-13b-instruct': 40, 'phi-3-mini-instruct': 32, 'phi-4-mini-instruct': 32,
          'phi-4-instruct': 40, 'qwen2.5-1.5b-instruct': 28, 'qwen2.5-coder-1.5b-native': 28,
          'qwen2.5-coder-3b-native': 36, 'qwen2.5-coder-7b-native': 28, 'qwen2.5-coder-14b-native': 48,
          'qwen2.5-coder-32b-instruct': 64, 'qwen2.5-7b-native': 28, 'qwen3-8b-native': 32,
          'deepseek-r1-distill-qwen-1.5b': 28, 'deepseek-r1-distill-qwen-7b': 28, 'deepseek-r1-distill-qwen-14b': 48,
          'deepseek-r1-distill-llama-8b': 32, 'deepseek-r1-distill-qwen-32b': 64, 'deepseek-r1-distill-llama-70b': 80,
          'mistral-7b-v0.3': 32, 'mixtral-8x7b-instruct': 32, 'codestral-22b': 56, 'mixtral-8x22b-instruct': 56,
          'command-r-35b': 40, 'command-r-plus-104b': 64, 'openchat-3.5-7b': 32, 'nemotron-mini-4b': 32,
          'nemotron-70b-instruct': 80
        };
        return MODEL_LAYERS_LOOKUP[mid] || 32;
      };

      const totalLayers = lookupPresetLayers(modelId);

      // Base llama-server arguments
      const args: string[] = [
        '-m', model.filePath,
        '--port', '12345',
        '--host', '127.0.0.1', // Bind strictly to localhost
        '-c', String(contextSize),
        '--threads', String(threads),
        '-b', String(batchSize),
        '-ub', String(microBatchSize),
        '--parallel', '2', // Parallel execution slots for codebase scanning
        '--slots', '2',
        '-ngl', String(gpuLayers)
      ];

      // Enable optimizations if GPU offloading is active
      if (gpuLayers > 0) {
        args.push('-fa', 'on'); // Enable Flash Attention
        args.push('--cont-batching'); // Enable continuous batching for slot parallelism
        args.push('--cache-type-k', 'q8_0'); // Quantize Key cache to 8-bit
        args.push('--cache-type-v', 'q8_0'); // Quantize Value cache to 8-bit
        args.push('--fit', 'off'); // Disable auto-fit to respect manual VRAM layer calculation

        // Windows-specific memory map fix
        if (process.platform === 'win32') {
          args.push('--no-mmap');
        }

        // Cache RAM for CPU offload if doing hybrid split
        if (gpuLayers < totalLayers) {
          const cacheRamMb = Math.floor((os.totalmem() * 0.3) / 1024 / 1024); // 30% of system RAM
          args.push('--cache-ram', String(cacheRamMb));
        }

        // Skip warmup for very large models (> 20GB) to prevent start OOMs
        if (fileSizeBytes > 20 * 1024 * 1024 * 1024) {
          args.push('--no-warmup');
        }

        // Multi-GPU Splitting
        if (gpuInfoList.length > 1) {
          args.push('--main-gpu', '0');
          args.push('--split-mode', 'layer');
          const totalGPUVram = gpuInfoList.reduce((sum: number, g: any) => sum + g.vramBytes, 0);
          const splits = gpuInfoList.map((g: any) => (g.vramBytes / totalGPUVram).toFixed(2));
          args.push('--tensor-split', splits.join(','));
        }
      } else {
        // CPU-only defaults
        args.push('--mlock'); // Lock in RAM
      }

      const optimalDevice = await this.getOptimalVulkanDevice();
      if (optimalDevice) {
        args.push('-dev', optimalDevice);
        console.log(`[GPU Optimizer] Forcing llama-server to run on optimal device: ${optimalDevice}`);
      }

      activeProcess = spawn(BINARY_PATH, args, {
        cwd: BIN_DIR,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          VK_LOG_LEVEL: 'none'
        }
      });
      registerProcess(activeProcess);

      activeModelId = modelId;

      const stderrLogs: string[] = [];

      // Drain stdout and stderr to prevent OS buffer deadlocks (critical for Windows/llama.cpp)
      activeProcess.stdout?.on('data', (data) => {
        const str = data.toString().trim();
        if (str) {
          console.log(`[llama-server]: ${str}`);
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
      isStarting = false;
      activeContextSize = contextSize;
      console.log(`Native llama-server running successfully on http://localhost:12345 with model ${model.name}`);
    } catch (e: any) {
      isStarting = false;
      startProgress = 0;
      await this.stop();

      if (!isRetry && gpuLayers > 0) {
        console.warn(`[Local Runner] Spawn failed with GPU offload (ngl: ${gpuLayers}). Error: ${e.message}. Retrying with CPU-only mode (-ngl 0)...`);
        const fallbackSettings = { ...localSettings, gpuLayers: 0 };
        return this.start(modelId, fallbackSettings, true);
      }

      throw e;
    }
  },

  async stop(): Promise<void> {
    if (!activeProcess) {
      activeModelId = null;
      return;
    }

    console.log('Terminating local model runner child process...');
    
    return new Promise<void>((resolve) => {
      if (activeProcess) {
        // Kill the process tree if Windows
        const pid = activeProcess.pid;
        if (pid) {
          exec(`taskkill /pid ${pid} /f /t`, () => {
            activeProcess = null;
            activeModelId = null;
            resolve();
          });
        } else {
          activeProcess.kill('SIGKILL');
          activeProcess = null;
          activeModelId = null;
          resolve();
        }
      } else {
        activeModelId = null;
        resolve();
      }
    });
  }
};
