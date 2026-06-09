import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';

const chroma = new ChromaClient({
  host: 'localhost',
  port: 8000,
  ssl: false
});
let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}

export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
}

export interface RAGResult {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  relevanceScore: number;
  language: string;
}

export class CodebaseRAG {
  private collection: any = null;
  private workspaceRoot: string = '';

  async initialize(workspacePath: string) {
    this.workspaceRoot = workspacePath;

    try {
      this.collection = await chroma.getOrCreateCollection({
        name: 'nyx-codebase',
        metadata: { workspace: workspacePath }
      });
    } catch {
      // Fallback to in-memory if Chroma is not available
      // Note: In a full implementation we would implement a real InMemoryVectorStore fallback
      this.collection = null; 
      console.warn('Chroma not available, vector search may be limited.');
    }
  }

  async getIndexStats() {
    if (!this.collection) return { documentCount: 0 };
    try {
      const count = await this.collection.count();
      return { documentCount: count };
    } catch {
      return { documentCount: 0 };
    }
  }

  async indexFile(filePath: string, content: string) {
    if (!this.collection) return;
    const embedder = await getEmbedder();

    // Chunk the file
    const chunks = this.chunkContent(content, filePath);

    for (const chunk of chunks) {
      const embedding = await embedder(chunk.content, { pooling: 'mean', normalize: true });

      await this.collection.add({
        ids: [`${filePath}:${chunk.startLine}-${chunk.endLine}`],
        embeddings: [embedding.data],
        documents: [chunk.content],
        metadatas: [{
          filePath,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          language: this.detectLanguage(filePath),
        }]
      });
    }
  }

  async search(query: string, topK = 5): Promise<RAGResult[]> {
    if (!this.collection) return [];
    
    const embedder = await getEmbedder();
    const queryEmbedding = await embedder(query, { pooling: 'mean', normalize: true });

    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding.data],
      nResults: topK,
    });

    if (!results || !results.ids || results.ids.length === 0 || results.ids[0].length === 0) {
      return [];
    }

    return results.ids[0].map((id: string, i: number) => ({
      id,
      filePath: results.metadatas[0][i].filePath as string,
      content: results.documents[0][i] as string,
      startLine: results.metadatas[0][i].startLine as number,
      endLine: results.metadatas[0][i].endLine as number,
      relevanceScore: results.distances ? results.distances[0][i] : 0,
      language: results.metadatas[0][i].language as string,
    }));
  }

  private chunkContent(content: string, filePath: string, maxChunkSize = 1000, overlap = 200): Chunk[] {
    const lines = content.split('\n');
    const chunks: Chunk[] = [];
    let currentChunk = '';
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Start new chunk at function/class boundaries when possible
      if (this.isBoundaryLine(line) && currentChunk.length > maxChunkSize * 0.5) {
        chunks.push({
          content: currentChunk,
          startLine,
          endLine: i - 1
        });
        // Overlap
        const overlapLines = Math.ceil(overlap / 50); // Approximate lines
        currentChunk = lines.slice(Math.max(0, i - overlapLines), i).join('\n') + '\n' + line;
        startLine = Math.max(0, i - overlapLines);
      } else {
        currentChunk += line + '\n';
      }

      // Force chunk if too large
      if (currentChunk.length > maxChunkSize) {
        chunks.push({
          content: currentChunk,
          startLine,
          endLine: i
        });
        currentChunk = '';
        startLine = i + 1;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk,
        startLine,
        endLine: lines.length - 1
      });
    }

    return chunks;
  }

  private isBoundaryLine(line: string): boolean {
    const patterns = [
      /^\s*(function|class|interface|type|enum|const|let|var)\s+/,
      /^\s*(def|class)\s+/,
      /^\s*(public|private|protected|static)\s+/,
      /^\s*\[/,  // Decorators
      /^\s*\/\*\*/,  // JSDoc
    ];
    return patterns.some(p => p.test(line));
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'rs': 'rust',
      'go': 'go', 'java': 'java',
      'cpp': 'cpp', 'c': 'c',
      'md': 'markdown', 'json': 'json',
    };
    return map[ext || ''] || 'text';
  }
}

export async function buildIndex(rag: CodebaseRAG, rootPath: string) {
  const EXCLUDE_DIRS = new Set([
    'node_modules', '.git', '.nyx-cache', '.stitch', '.agents',
    '.antigravitycli', '.claude', '.vscode', 'dist', 'dist-server',
    'dist-desktop', 'public', 'graphify-out', 'scratch',
  ]);

  const ALLOWED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md',
    '.html', '.py', '.rs', '.go', '.yaml', '.yml',
  ]);

  function scanDir(dir: string, files: string[] = []) {
    if (!fs.existsSync(dir)) return files;
    const list = fs.readdirSync(dir);

    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!EXCLUDE_DIRS.has(file)) {
          scanDir(fullPath, files);
        }
      } else {
        const ext = path.extname(file).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
    return files;
  }

  const allFiles = scanDir(rootPath);
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.trim()) {
        await rag.indexFile(file, content);
      }
    } catch (e) {
      // ignore unreadable files
    }
  }
}

