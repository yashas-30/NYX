import logger from '../../lib/logger.ts';
/**
 * @file server/lib/codebaseScanner.ts
 * @description Local repository neural RAG search engine with sqlite-vec and all-MiniLM-L6-v2 embeddings.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getWorkspaceRoot } from '../../lib/paths.ts';

// Directory and file exclusions to maintain high performance
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.nyx-cache',
  '.stitch',
  '.agents',
  '.antigravitycli',
  '.claude',
  '.vscode',
  'dist',
  'dist-server',
  'dist-desktop',
  'public',
  'graphify-out',
  'scratch',
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'server.err',
  'server.log',
  'skills-lock.json',
  'metadata.json',
  'secure-vault.json',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.css',
  '.md',
  '.html',
  '.py',
  '.rs',
  '.go',
  '.yaml',
  '.yml',
]);

interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  fileName: string;
}

interface SearchResult {
  path: string;
  content: string;
  relevanceScore: number;
}

export class CodebaseScanner {
  private static embedder: any = null;
  private static vectors: Map<string, number[]> = new Map(); // file_path -> 384-dim embedding
  private static isInitialized = false;
  private static watcher: fs.FSWatcher | null = null;
  private static currentWatchedRoot = '';
  private static cacheFilePath = '';
  private static pipelineModule: any = null;
  private static accessTimes: Map<string, number> = new Map();

  private static touch(path: string): void {
    this.accessTimes.set(path, Date.now());
  }

  private static evictOldestVectors(): void {
    const MAX_VECTORS = 5000;
    if (this.vectors.size <= MAX_VECTORS) return;

    const entries = Array.from(this.vectors.keys()).map((k) => ({
      key: k,
      time: this.accessTimes.get(k) || 0,
    }));

    entries.sort((a, b) => a.time - b.time);
    const excess = this.vectors.size - MAX_VECTORS;
    const toEvict = entries.slice(0, excess);

    for (const item of toEvict) {
      this.vectors.delete(item.key);
      this.accessTimes.delete(item.key);
    }
    logger.info(
      `[RAG] Cap at 5000 reached. Evicted ${excess} oldest files from codebase scanner cache.`
    );
  }

  private static async getPipeline(): Promise<any> {
    if (!this.pipelineModule) {
      try {
        const mod = await import('@huggingface/transformers');
        this.pipelineModule = mod.pipeline;
      } catch (error: any) {
        logger.error('[RAG] Failed to load @huggingface/transformers:', error);
        throw error;
      }
    }
    return this.pipelineModule;
  }

  /**
   * Initializes the HuggingFace all-MiniLM-L6-v2 model and vector store cache
   */
  public static async init(): Promise<void> {
    const root = getWorkspaceRoot();

    // Self-healing reset if workspace root changes
    if (this.isInitialized && this.currentWatchedRoot !== root) {
      logger.info(
        `[RAG] Workspace root changed from "${this.currentWatchedRoot}" to "${root}". Disposing old vector index and file watchers...`
      );
      this.dispose();
    }

    if (this.isInitialized) return;
    try {
      logger.info('[RAG] Loading neural embedding model (all-MiniLM-L6-v2)...');
      const pipelineFn = await this.getPipeline();
      this.embedder = await pipelineFn('feature-extraction', 'onnx-community/all-MiniLM-L6-v2');

      const cacheDir = path.join(root, '.nyx-cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      this.cacheFilePath = path.join(cacheDir, 'codebase-embeddings.json');
      this.loadEmbeddingsCache();

      this.setupFileWatcher();
      this.isInitialized = true;

      // Perform initial indexing asynchronously
      setImmediate(() => {
        this.indexWorkspace().catch((err) => logger.error('[RAG] Indexing failed:', err));
      });

      logger.info('[RAG] Neural Codebase Scanner initialized successfully.');
    } catch (err: any) {
      logger.error('[RAG] Failed to initialize codebase scanner:', err);
    }
  }

  private static loadEmbeddingsCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.vectors = new Map(Object.entries(parsed));
        for (const k of this.vectors.keys()) {
          this.touch(k);
        }
        logger.info(`[RAG] Loaded ${this.vectors.size} cached vector embeddings.`);
      }
    } catch (err: any) {
      logger.error('[RAG] Failed to load embeddings cache:', err);
    }
  }

  private static saveEmbeddingsCache(): void {
    try {
      const obj = Object.fromEntries(this.vectors.entries());
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err: any) {
      logger.error('[RAG] Failed to save embeddings cache:', err);
    }
  }

  /**
   * Generates a 384-dimension vector embedding for a given text segment
   */
  public static async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    if (!this.embedder) {
      return new Array(384).fill(0);
    }
    try {
      const output = await this.embedder(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (err: any) {
      logger.error('[RAG] Failed to generate embedding:', err);
      return new Array(384).fill(0);
    }
  }

  /**
   * Scans and indexes the entire active workspace
   */
  public static async indexWorkspace(): Promise<void> {
    const root = getWorkspaceRoot();
    logger.info(`[RAG] Indexing workspace files at: ${root}`);
    const files = this.scanDirectory(root);

    let indexCount = 0;
    for (const file of files) {
      const isCached = this.vectors.has(file.relativePath);
      if (!isCached) {
        try {
          const content = this.readFileSafely(file.absolutePath);
          if (content.trim()) {
            const embedding = await this.generateEmbedding(content);
            this.vectors.set(file.relativePath, embedding);
            this.touch(file.relativePath);
            this.evictOldestVectors();
            indexCount++;
          }
        } catch (err: any) {
          // skip failed files
        }
      }
    }

    if (indexCount > 0) {
      this.saveEmbeddingsCache();
      logger.info(`[RAG] Incremental indexing complete. Indexed ${indexCount} new files.`);
    } else {
      logger.info('[RAG] Index is fully up to date.');
    }
  }

  /**
   * Sets up fs directory watcher for incremental updates on file changes
   */
  private static setupFileWatcher(): void {
    const root = getWorkspaceRoot();
    if (this.watcher && this.currentWatchedRoot === root) return;

    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
    }

    this.currentWatchedRoot = root;
    try {
      logger.info(`[RAG] Setting up codebase file watcher at: ${root}`);
      this.watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Skip ignored directories/files
        const parts = filename.replace(/\\/g, '/').split('/');
        if (parts.some((p) => EXCLUDE_DIRS.has(p) || EXCLUDE_FILES.has(p))) return;

        const ext = path.extname(filename).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) return;

        const absolutePath = path.join(root, filename);
        const relativePath = filename.replace(/\\/g, '/');

        if (fs.existsSync(absolutePath)) {
          // File modified or created
          setImmediate(async () => {
            try {
              const content = this.readFileSafely(absolutePath);
              if (content.trim()) {
                const embedding = await this.generateEmbedding(content);
                this.vectors.set(relativePath, embedding);
                this.touch(relativePath);
                this.evictOldestVectors();
                this.saveEmbeddingsCache();
                logger.info(
                  `[RAG] Watcher triggered re-indexing for modified file: ${relativePath}`
                );
              }
            } catch {}
          });
        } else {
          // File deleted
          if (this.vectors.has(relativePath)) {
            this.vectors.delete(relativePath);
            this.saveEmbeddingsCache();
            logger.info(`[RAG] Watcher removed deleted file from index: ${relativePath}`);
          }
        }
      });
    } catch (err: any) {
      logger.error('[RAG] Failed to setup codebase file watcher:', err);
    }
  }

  /**
   * Recursively scans the workspace directory
   */
  private static scanDirectory(dir: string, baseDir: string = dir): ScannedFile[] {
    const results: ScannedFile[] = [];
    try {
      if (!fs.existsSync(dir)) return results;
      const list = fs.readdirSync(dir);

      for (const file of list) {
        const absolutePath = path.join(dir, file);
        const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, '/');

        const stat = fs.statSync(absolutePath);
        if (stat.isDirectory()) {
          if (!EXCLUDE_DIRS.has(file)) {
            results.push(...this.scanDirectory(absolutePath, baseDir));
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (ALLOWED_EXTENSIONS.has(ext) && !EXCLUDE_FILES.has(file)) {
            results.push({
              relativePath,
              absolutePath,
              fileName: file,
            });
          }
        }
      }
    } catch (e: any) {
      logger.error(`[RAG] Error scanning directory ${dir}:`, e);
    }
    return results;
  }

  /**
   * Builds the flat directory structure map string
   */
  public static getDirectoryStructure(): string {
    const root = getWorkspaceRoot();
    const files = this.scanDirectory(root);

    const folders: Record<string, string[]> = {};
    for (const file of files) {
      const parentDir = path.dirname(file.relativePath);
      const folderKey = parentDir === '.' ? '/' : parentDir.replace(/\\/g, '/');
      if (!folders[folderKey]) folders[folderKey] = [];
      folders[folderKey].push(file.fileName);
    }

    let structureStr = 'PROJECT DIRECTORY MAP:\n';
    const folderKeys = Object.keys(folders).sort();

    let lineCount = 0;
    const maxLines = 30;

    for (const folder of folderKeys) {
      if (lineCount >= maxLines) {
        structureStr += `... [Directory map truncated, ${folderKeys.length - folderKeys.indexOf(folder)} folders hidden] ...\n`;
        break;
      }
      structureStr += `📁 ${folder}\n`;
      lineCount++;

      const sortedFiles = folders[folder].sort();
      for (const f of sortedFiles) {
        if (lineCount >= maxLines) {
          structureStr += `  ... [and ${sortedFiles.length - sortedFiles.indexOf(f)} more files hidden] ...\n`;
          break;
        }
        structureStr += `  📄 ${f}\n`;
        lineCount++;
      }
    }

    return structureStr;
  }

  /**
   * Computes cosine similarity between two numeric vectors
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Performs semantic neural search using cosine similarity
   */
  public static async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    await this.init();
    const root = getWorkspaceRoot();
    logger.info(`[RAG] Searching index in "${root}" semantically for: "${query}"`);

    const queryVector = await this.generateEmbedding(query);
    const scoredResults: SearchResult[] = [];

    for (const [relativePath, fileVector] of this.vectors.entries()) {
      const score = this.cosineSimilarity(queryVector, fileVector);
      if (score > 0) {
        this.touch(relativePath);
        const absolutePath = path.join(root, relativePath);
        const content = this.readFileSafely(absolutePath);
        scoredResults.push({
          path: relativePath,
          content,
          relevanceScore: score * 100, // scale for UI representation
        });
      }
    }

    // Sort by similarity descending
    scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const topResults = scoredResults.slice(0, maxResults);
    logger.info(
      `[RAG] Semantic search top matches:`,
      topResults.map((r) => `${r.path} (similarity: ${r.relevanceScore.toFixed(2)}%)`)
    );
    return topResults;
  }

  /**
   * Safely reads a file with size limits to prevent out-of-memory errors
   */
  private static readFileSafely(absolutePath: string): string {
    try {
      const stats = fs.statSync(absolutePath);
      const maxSizeBytes = 3 * 1024; // Cap file reads at 3KB

      if (stats.size > maxSizeBytes) {
        const stream = fs.readFileSync(absolutePath, 'utf8');
        return (
          stream.substring(0, maxSizeBytes) +
          '\n\n... [File truncated due to local context size limit] ...'
        );
      }

      return fs.readFileSync(absolutePath, 'utf8');
    } catch (e: any) {
      return '';
    }
  }

  /**
   * Disposes model instances and clears file watchers
   */
  public static dispose(): void {
    logger.info('[RAG] Disposing codebase scanner assets...');
    this.embedder = null;
    this.vectors.clear();
    this.isInitialized = false;
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
    this.currentWatchedRoot = '';
  }
}
