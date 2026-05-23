import fs from 'fs';
import path from 'path';
import https from 'https';
import { IncomingMessage } from 'http';

export interface ModelPreset {
  id: string;
  name: string;
  size: string;
  url: string;
  fileName: string;
  description: string;
  ramRequired: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'qwen2.5-coder-1.5b-native',
    name: 'Qwen 2.5 Coder 1.5B (GGUF)',
    size: '1.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
    description: 'Fast, lightweight Qwen model optimized specifically for coding tasks.',
    ramRequired: '4 GB+ RAM'
  },
  {
    id: 'qwen2.5-coder-3b-native',
    name: 'Qwen 2.5 Coder 3B (GGUF)',
    size: '2.2 GB',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF/resolve/main/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    fileName: 'qwen2.5-coder-3b-instruct-q4_k_m.gguf',
    description: 'Perfect balance of high intelligence and execution speed for coding.',
    ramRequired: '8 GB+ RAM'
  },
  {
    id: 'llama-3.2-3b-native',
    name: 'Llama 3.2 3B (GGUF)',
    size: '2.0 GB',
    url: 'https://huggingface.co/Bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    fileName: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    description: 'Meta\'s highly capable general instruction model for general analysis.',
    ramRequired: '8 GB+ RAM'
  }
];

export interface DownloadProgress {
  modelId: string;
  status: 'idle' | 'downloading' | 'completed' | 'failed';
  bytesDownloaded: number;
  totalBytes: number;
  progressPercentage: number;
  speedMbps: number; // Speed in MB/s
  error?: string;
}

const BASE_DIR = path.join(process.cwd(), '.nyx-models');
const MODELS_DIR = path.join(BASE_DIR, 'models');
const STATE_FILE = path.join(BASE_DIR, 'downloads.json');

// Ensure directories exist
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
if (!fs.existsSync(MODELS_DIR)) fs.mkdirSync(MODELS_DIR, { recursive: true });

// Active downloads map
const activeDownloads = new Map<string, DownloadProgress>();
let downloadStates: Record<string, 'idle' | 'downloading' | 'completed' | 'failed'> = {};

// Load states from disk if exists
try {
  if (fs.existsSync(STATE_FILE)) {
    downloadStates = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
} catch (e) {
  console.error('Error loading model download state file:', e);
}

function saveStates() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(downloadStates, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving model download state file:', e);
  }
}

export const LocalModelManager = {
  getModelsDir() {
    return MODELS_DIR;
  },

  getPresets() {
    return MODEL_PRESETS;
  },

  listModels() {
    return MODEL_PRESETS.map(preset => {
      const filePath = path.join(MODELS_DIR, preset.fileName);
      const exists = fs.existsSync(filePath);
      
      // Sync local status
      let status: 'idle' | 'downloading' | 'completed' | 'failed' = 'idle';
      if (exists) {
        status = 'completed';
        downloadStates[preset.id] = 'completed';
      } else if (activeDownloads.has(preset.id)) {
        status = activeDownloads.get(preset.id)!.status;
      } else if (downloadStates[preset.id] === 'completed') {
        // GGUF was deleted manually
        downloadStates[preset.id] = 'idle';
      } else if (downloadStates[preset.id]) {
        status = downloadStates[preset.id] === 'downloading' ? 'idle' : (downloadStates[preset.id] as any);
      }

      const activeProgress = activeDownloads.get(preset.id);

      return {
        ...preset,
        status,
        filePath: exists ? filePath : null,
        progress: activeProgress || {
          modelId: preset.id,
          status,
          bytesDownloaded: exists ? 100 : 0,
          totalBytes: exists ? 100 : 0,
          progressPercentage: exists ? 100 : 0,
          speedMbps: 0
        }
      };
    });
  },

  getProgress(modelId: string): DownloadProgress {
    const active = activeDownloads.get(modelId);
    if (active) return active;

    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (!preset) {
      return { modelId, status: 'failed', bytesDownloaded: 0, totalBytes: 0, progressPercentage: 0, speedMbps: 0, error: 'Model preset not found' };
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    const exists = fs.existsSync(filePath);

    return {
      modelId,
      status: exists ? 'completed' : 'idle',
      bytesDownloaded: exists ? 100 : 0,
      totalBytes: exists ? 100 : 0,
      progressPercentage: exists ? 100 : 0,
      speedMbps: 0
    };
  },

  startDownload(modelId: string) {
    const preset = MODEL_PRESETS.find(p => p.id === modelId);
    if (!preset) {
      throw new Error(`Model preset '${modelId}' not found.`);
    }

    const filePath = path.join(MODELS_DIR, preset.fileName);
    if (fs.existsSync(filePath)) {
      return { status: 'completed', message: 'Model already downloaded.' };
    }

    if (activeDownloads.has(modelId) && activeDownloads.get(modelId)!.status === 'downloading') {
      return { status: 'downloading', message: 'Download is already in progress.' };
    }

    // Set initial progress
    const progress: DownloadProgress = {
      modelId,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: 0,
      progressPercentage: 0,
      speedMbps: 0
    };

    activeDownloads.set(modelId, progress);
    downloadStates[modelId] = 'downloading';
    saveStates();

    // Start download process asynchronously
    this.downloadFile(preset.url, filePath, progress).then(() => {
      progress.status = 'completed';
      progress.progressPercentage = 100;
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'completed';
      saveStates();
      console.log(`Successfully downloaded model ${preset.name} to ${filePath}`);
    }).catch((err) => {
      progress.status = 'failed';
      progress.error = err.message || 'Download failed';
      activeDownloads.delete(modelId);
      downloadStates[modelId] = 'failed';
      saveStates();
      console.error(`Failed to download model ${preset.name}:`, err);
      // Clean up incomplete file if it exists
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    });

    return { status: 'downloading', message: 'Download started.' };
  },

  downloadFile(url: string, destPath: string, progress: DownloadProgress): Promise<void> {
    return new Promise((resolve, reject) => {
      const tempPath = destPath + '.tmp';
      let fileStream = fs.createWriteStream(tempPath);
      let receivedBytes = 0;
      let totalBytes = 0;
      let startTime = Date.now();
      let lastTime = Date.now();
      let lastBytes = 0;

      const makeRequest = (currentUrl: string) => {
        const urlObj = new URL(currentUrl);
        const options = {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Connection': 'keep-alive'
          }
        };

        const req = https.get(urlObj, options, (res: IncomingMessage) => {
          // Handle Redirects (Hugging Face URLs redirect to AWS S3 / Cloudflare CDN)
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            let redirectUrl = res.headers.location;
            if (redirectUrl) {
              if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
                redirectUrl = new URL(redirectUrl, currentUrl).href;
              }
              fileStream.close();
              // Re-create write stream because of redirect redirecting
              const newFileStream = fs.createWriteStream(tempPath);
              newFileStream.on('open', () => {
                fileStream.destroy();
                // Replace fileStream pointer and follow
                (fileStream as any) = newFileStream;
                makeRequest(redirectUrl!);
              });
              newFileStream.on('error', (err) => {
                reject(err);
              });
              return;
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Server responded with status code: ${res.statusCode}`));
            return;
          }

          totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          progress.totalBytes = totalBytes;

          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            progress.bytesDownloaded = receivedBytes;
            
            if (totalBytes > 0) {
              progress.progressPercentage = Math.round((receivedBytes / totalBytes) * 100);
            }

            // Calculate speed every 500ms
            const now = Date.now();
            const elapsed = now - lastTime;
            if (elapsed >= 500) {
              const bytesDiff = receivedBytes - lastBytes;
              const speedBytesPerSec = (bytesDiff / elapsed) * 1000;
              progress.speedMbps = parseFloat((speedBytesPerSec / (1024 * 1024)).toFixed(2));
              lastTime = now;
              lastBytes = receivedBytes;
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              // Rename tmp file to final destination
              try {
                fs.renameSync(tempPath, destPath);
                resolve();
              } catch (e: any) {
                reject(e);
              }
            });
          });
        });

        req.on('error', (err) => {
          fileStream.close(() => {
            try { fs.unlinkSync(tempPath); } catch {}
            reject(err);
          });
        });

        // Set a timeout of 30 seconds for download connection
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Download timeout reached. Connection lost.'));
        });
      };

      makeRequest(url);
    });
  }
};
