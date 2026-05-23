import fs from 'fs';
import path from 'path';
import https from 'https';
import { spawn, ChildProcess, exec } from 'child_process';
import { LocalModelManager } from './localModelManager.ts';

const BASE_DIR = path.join(process.cwd(), '.nyx-models');
const BIN_DIR = path.join(BASE_DIR, 'bin');
const BINARY_PATH = path.join(BIN_DIR, 'llama-server.exe');

// Ensure binary directory exists
if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

let activeProcess: ChildProcess | null = null;
let activeModelId: string | null = null;
let isStarting = false;
let startProgress = 0;

export const LocalModelRunner = {
  getActiveModel() {
    return activeModelId;
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

  async ensureBinaryInstalled(): Promise<void> {
    const vulkanDllPath = path.join(BIN_DIR, 'ggml-vulkan.dll');
    
    // If the server executable and the Vulkan dynamic library both exist, we are good.
    // If ggml-vulkan.dll is missing, it means we have an old CPU-only binary (or a missing installation),
    // in which case we delete the old files and perform a clean Vulkan-enabled installation.
    if (fs.existsSync(BINARY_PATH) && fs.existsSync(vulkanDllPath)) {
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
    console.log('Portable llama-server.exe (Vulkan GPU/VRAM) not found. Preparing direct Vulkan binary download...');

    const zipUrl = 'https://github.com/ggerganov/llama.cpp/releases/download/b4618/llama-b4618-bin-win-vulkan-x64.zip';
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
      // Step 3: Clean up zip file
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath); } catch {}
      }

      startProgress = 100;
      isStarting = false;
      console.log('Binary extraction complete. Native llama-server.exe (Vulkan GPU/VRAM) is ready.');
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

  async start(modelId: string): Promise<void> {
    if (activeModelId === modelId && activeProcess) {
      return; // Already running
    }

    if (activeProcess) {
      console.log('Stopping active local model runner to load new model...');
      await this.stop();
    }

    isStarting = true;
    startProgress = 5;

    try {
      await this.ensureBinaryInstalled();
      startProgress = 40;

      const models = LocalModelManager.listModels();
      const model = models.find(m => m.id === modelId);
      if (!model || model.status !== 'completed' || !model.filePath) {
        throw new Error(`Model '${modelId}' is not fully downloaded or available.`);
      }

      console.log(`Spawning native llama-server.exe for GGUF: ${model.name}`);
      startProgress = 60;

      // Spawn process on port 12345
      // -c 4096 context size, --threads 4 (safe default for multi-core Windows systems)
      // -ngl 99 offloads all layers of the model to GPU (VRAM), automatically falling back to system RAM for remaining layers if they don't fit.
      const args = [
        '-m', model.filePath,
        '--port', '12345',
        '-c', '4096',
        '--threads', '4',
        '--parallel', '1',
        '-ngl', '99'
      ];

      activeProcess = spawn(BINARY_PATH, args, {
        cwd: BIN_DIR,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      activeModelId = modelId;

      // Log errors if any
      activeProcess.stderr?.on('data', (data) => {
        const str = data.toString();
        if (str.includes('error') || str.includes('fail')) {
          console.error(`[llama-server-err]: ${str.trim()}`);
        }
      });

      // Poll port health endpoint
      startProgress = 80;
      let healthy = false;
      for (let i = 0; i < 30; i++) {
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
        throw new Error('Local llama-server did not become healthy in time.');
      }

      startProgress = 100;
      isStarting = false;
      console.log(`Native llama-server running successfully on http://localhost:12345 with model ${model.name}`);
    } catch (e: any) {
      isStarting = false;
      startProgress = 0;
      await this.stop();
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
