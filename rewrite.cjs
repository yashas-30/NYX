const fs = require('fs');
const path = require('path');

let code = fs.readFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', 'utf8');

// Replace calculateOptimalLayers
const calculateRegex = /async calculateOptimalLayers\([\s\S]*?async detectBackend\(/;

const newCalculate = `async calculateOptimalLayers(
    modelId: string,
    contextSize = 2048
  ): Promise<{
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
    const model = models.find((m) => m.id === modelId);
    let fileSize = 2 * 1024 * 1024 * 1024;
    
    if (model && model.status === 'completed' && model.filePath) {
      try {
        fileSize = fs.statSync(model.filePath).size;
        // Parse GGUF metadata
        const metadata = await gguf(model.filePath, { allowLocalFile: true });
        if (metadata?.metadata) {
          const blockCount = metadata.metadata['llama.block_count'] || metadata.metadata['qwen2.block_count'] || metadata.metadata['gemma2.block_count'] || metadata.metadata['phi3.block_count'];
          if (blockCount) {
             totalLayers = Number(blockCount);
             logger.info(\`[GGUF Parser] Extracted \${totalLayers} layers from \${modelId}\`);
          }
        }
      } catch (err) {
        logger.warn('Failed to parse GGUF metadata, falling back to heuristics:', err);
      }
    } else if (model) {
      const parsed = parseFloat(model.size);
      if (!isNaN(parsed)) fileSize = parsed * 1024 * 1024 * 1024;
    }

    const gpus = await this.detectGPUs();
    const hasGPU = gpus.length > 0;
    let batchSize = Math.min(2048, contextSize);
    let microBatchSize = Math.min(512, batchSize);

    if (!hasGPU) {
      return {
        gpuLayers: 0,
        totalLayers,
        batchSize,
        microBatchSize,
        fileSize,
        message: \`No active GPU detected. Running all \${totalLayers} layers entirely on CPU/RAM.\`,
        hasGPU: false,
        gpuInfo: [],
      };
    }

    const primaryGPU = gpus[0];
    let availableVram = primaryGPU.vramBytes;
    let freeNvidiaVram = 0;
    try {
      freeNvidiaVram = await this.getFreeVram();
    } catch {}

    let usableVram = 0;
    if (freeNvidiaVram > 0) {
      usableVram = Math.max(0, freeNvidiaVram - 250 * 1024 * 1024);
    } else {
      usableVram = Math.max(0, availableVram - (750 * 1024 * 1024));
    }

    let usedBackend: 'cuda' | 'vulkan' = 'vulkan';
    try {
      const installedVersion = fs.readFileSync(path.join(BIN_DIR, '.version'), 'utf-8').trim();
      usedBackend = installedVersion.endsWith('-cuda') ? 'cuda' : 'vulkan';
    } catch {}

    const kvCachePerTokenPerLayer = usedBackend === 'vulkan' ? 4096 : 2048;
    const kvCachePerLayer = contextSize * kvCachePerTokenPerLayer;

    const computeBuffer = batchSize * 512 * 4;
    if (fileSize + computeBuffer > usableVram) {
      batchSize = 512;
      microBatchSize = 128;
    }

    const availableForLayers = Math.max(0, usableVram - (batchSize * 512 * 4));
    const layerWeightSize = fileSize / totalLayers;
    const layerSize = layerWeightSize + kvCachePerLayer;
    const maxLayersByVram = Math.floor(availableForLayers / layerSize);
    const safeLayers = Math.max(0, Math.min(totalLayers, maxLayersByVram));
    
    let message = safeLayers >= totalLayers
      ? \`GPU has abundant VRAM! Loaded all \${totalLayers}/\${totalLayers} layers to GPU.\`
      : \`GPU VRAM limit reached. Offloaded \${safeLayers}/\${totalLayers} layers to VRAM.\`;

    return {
      gpuLayers: safeLayers,
      totalLayers,
      batchSize,
      microBatchSize,
      fileSize,
      message,
      hasGPU: true,
      gpuInfo: gpus,
    };
  }

  async detectBackend(`;

code = code.replace(calculateRegex, newCalculate);

// Replace ensureBinaryInstalled
const ensureRegex = /async ensureBinaryInstalled[\s\S]*?async start\(/;

const newEnsure = `async ensureBinaryInstalled(forceBackend?: 'cuda' | 'vulkan'): Promise<'cuda' | 'vulkan'> {
    let backend = forceBackend || (await this.detectBackend());
    const versionFilePath = path.join(BIN_DIR, '.version');
    
    // Fetch latest release from GitHub API
    let CURRENT_VERSION = 'b9479'; // default fallback
    try {
      const res = await fetch('https://api.github.com/repos/ggml-org/llama.cpp/releases/latest');
      if (res.ok) {
        const data = await res.json();
        if (data.tag_name) {
          CURRENT_VERSION = data.tag_name;
        }
      }
    } catch (err) {
      logger.warn('[Binary Updater] Failed to check GitHub for updates. Using fallback version.');
    }

    let expectedVersion = \`\${CURRENT_VERSION}-\${backend}-\${process.platform}\`;
    let installedVersion = '';
    if (fs.existsSync(versionFilePath)) {
      try { installedVersion = fs.readFileSync(versionFilePath, 'utf-8').trim(); } catch {}
    }

    const resolvedBinaryPath = findLlamaServerPath();
    let binaryReady = fs.existsSync(resolvedBinaryPath) && installedVersion === expectedVersion;

    if (binaryReady) return backend;

    logger.info(\`Portable llama-server version \${CURRENT_VERSION} (\${backend.toUpperCase()}) not found or outdated. Downloading...\`);
    modelState = 'downloading';
    startProgress = 10;

    let assetUrl = '';
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';
    const isWin = process.platform === 'win32';
    
    if (isMac) {
      assetUrl = \`https://github.com/ggml-org/llama.cpp/releases/download/\${CURRENT_VERSION}/llama-\${CURRENT_VERSION}-bin-macos-\${os.arch() === 'arm64' ? 'arm64' : 'x64'}.tar.gz\`;
    } else if (isLinux) {
      assetUrl = \`https://github.com/ggml-org/llama.cpp/releases/download/\${CURRENT_VERSION}/llama-\${CURRENT_VERSION}-bin-ubuntu-\${backend === 'vulkan' ? 'vulkan-' : ''}x64.tar.gz\`;
    } else {
      assetUrl = \`https://github.com/ggml-org/llama.cpp/releases/download/\${CURRENT_VERSION}/llama-\${CURRENT_VERSION}-bin-win-\${backend === 'cuda' ? 'cuda-12.4' : 'vulkan'}-x64.zip\`;
    }

    const archivePath = path.join(BIN_DIR, isWin ? 'llama-bin.zip' : 'llama-bin.tar.gz');

    try {
      startProgress = 20;
      await this.downloadBinaryZipNode(assetUrl, archivePath);
      startProgress = 60;
      logger.info('Archive downloaded successfully. Extracting natively...');

      if (isWin) {
        const zip = new AdmZip(archivePath);
        zip.extractAllTo(BIN_DIR, true);
      } else {
        await tar.x({ file: archivePath, cwd: BIN_DIR });
        fs.chmodSync(path.join(BIN_DIR, 'llama-server'), 0o755);
      }

      startProgress = 90;
      fs.writeFileSync(versionFilePath, expectedVersion, 'utf-8');
      
      try { fs.unlinkSync(archivePath); } catch {}
      
      startProgress = 100;
      modelState = 'idle';
      logger.info(\`Binary extraction complete. Native llama-server \${CURRENT_VERSION} ready.\`);
      return backend;
    } catch (error: any) {
      modelState = 'idle';
      startProgress = 0;
      try { fs.unlinkSync(archivePath); } catch {}
      throw new Error(\`Failed to initialize built-in llama-server executable: \${error.message}\`);
    }
  }

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
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
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
            reject(new Error(\`Server responded with status \${res.statusCode}\`));
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
            try { fs.unlinkSync(destPath); } catch {}
            reject(err);
          });
        });
      };

      makeRequest(url);
    });
  }

  async start(`;

code = code.replace(ensureRegex, newEnsure);

fs.writeFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', code);
console.log('Successfully rewrote functions');
