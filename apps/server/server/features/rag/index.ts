import { ChromaClient } from 'chromadb';
import { pipeline } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import MiniSearch from 'minisearch';

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
  private keywordIndex = new MiniSearch({
    fields: ['content', 'filePath'],
    storeFields: ['id', 'filePath', 'content', 'startLine', 'endLine', 'language'],
    idField: 'id'
  });

  async initialize(workspacePath: string) {
    this.workspaceRoot = workspacePath;

    try {
      this.collection = await chroma.getOrCreateCollection({
        name: 'nyx-codebase',
        metadata: { workspace: workspacePath }
      });
    } catch {
      // Fallback to in-memory if Chroma is not available
      this.collection = {
        items: [] as any[],
        add: async (data: any) => {
          for (let i = 0; i < data.ids.length; i++) {
             this.collection.items.push({
               id: data.ids[i],
               embedding: data.embeddings[i],
               document: data.documents[i],
               metadata: data.metadatas[i]
             });
          }
        },
        count: async () => this.collection.items.length,
        query: async (data: any) => {
           const queryEmb = data.queryEmbeddings[0];
           const results = this.collection.items.map((item: any) => {
              let dotProduct = 0, normA = 0, normB = 0;
              for (let i = 0; i < queryEmb.length; i++) {
                 dotProduct += queryEmb[i] * item.embedding[i];
                 normA += queryEmb[i] * queryEmb[i];
                 normB += item.embedding[i] * item.embedding[i];
              }
              const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
              return { ...item, similarity };
           });
           results.sort((a: any, b: any) => b.similarity - a.similarity);
           const top = results.slice(0, data.nResults);
           return {
              ids: [top.map((t: any) => t.id)],
              distances: [top.map((t: any) => 2 * (1 - t.similarity))],
              documents: [top.map((t: any) => t.document)],
              metadatas: [top.map((t: any) => t.metadata)]
           };
        }
      };
      console.warn('Chroma not available, using in-memory vector search fallback.');
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

      const id = `${filePath}:${chunk.startLine}-${chunk.endLine}`;
      if (!this.keywordIndex.has(id)) {
        this.keywordIndex.add({
          id,
          filePath,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          language: this.detectLanguage(filePath),
        });
      }
    }
  }

  async search(query: string, topK = 5): Promise<RAGResult[]> {
    const resultsMap = new Map<string, RAGResult & { vectorScore?: number; keywordScore?: number }>();

    // 1. Vector Search
    if (this.collection) {
      try {
        const embedder = await getEmbedder();
        const queryEmbedding = await embedder(query, { pooling: 'mean', normalize: true });

        const results = await this.collection.query({
          queryEmbeddings: [queryEmbedding.data],
          nResults: topK,
        });

        if (results && results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
          for (let i = 0; i < results.ids[0].length; i++) {
            const id = results.ids[0][i];
            const distance = results.distances ? results.distances[0][i] : 0;
            // Chroma returns distance (lower is better). Convert to similarity score roughly.
            const vectorScore = 1 - (distance / 2);
            resultsMap.set(id, {
              id,
              filePath: results.metadatas[0][i].filePath as string,
              content: results.documents[0][i] as string,
              startLine: results.metadatas[0][i].startLine as number,
              endLine: results.metadatas[0][i].endLine as number,
              language: results.metadatas[0][i].language as string,
              relevanceScore: 0,
              vectorScore
            });
          }
        }
      } catch (e) {
        console.warn('Vector search failed, falling back to keyword search only');
      }
    }

    // 2. Keyword Search
    const keywordResults = this.keywordIndex.search(query, { prefix: true, fuzzy: 0.2 });
    
    // Normalize keyword scores (max score to 1.0)
    const maxKeywordScore = keywordResults.length > 0 ? keywordResults[0].score : 1;

    for (const res of keywordResults.slice(0, topK * 2)) {
      const id = res.id;
      const normalizedScore = res.score / maxKeywordScore;
      
      if (resultsMap.has(id)) {
        resultsMap.get(id)!.keywordScore = normalizedScore;
      } else {
        resultsMap.set(id, {
          id,
          filePath: res.filePath,
          content: res.content,
          startLine: res.startLine,
          endLine: res.endLine,
          language: res.language,
          relevanceScore: 0,
          keywordScore: normalizedScore
        });
      }
    }

    // 3. Combined Scoring using Reciprocal Rank Fusion (RRF)
    const allResults = Array.from(resultsMap.values());
    const vectorSorted = [...allResults].filter(r => r.vectorScore !== undefined).sort((a, b) => (b.vectorScore || 0) - (a.vectorScore || 0));
    const keywordSorted = [...allResults].filter(r => r.keywordScore !== undefined).sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
    
    const vectorRanks = new Map<string, number>();
    vectorSorted.forEach((r, idx) => vectorRanks.set(r.id, idx + 1));
    
    const keywordRanks = new Map<string, number>();
    keywordSorted.forEach((r, idx) => keywordRanks.set(r.id, idx + 1));
    
    const K = 60; // Standard RRF constant
    const combinedResults = allResults.map(r => {
       const vRank = vectorRanks.get(r.id) || 1000;
       const kRank = keywordRanks.get(r.id) || 1000;
       r.relevanceScore = (1 / (K + vRank)) + (1 / (K + kRank));
       return r;
    });

    // 4. Sort and return topK
    combinedResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return combinedResults.slice(0, topK).map(r => ({
      id: r.id,
      filePath: r.filePath,
      content: r.content,
      startLine: r.startLine,
      endLine: r.endLine,
      relevanceScore: r.relevanceScore,
      language: r.language
    }));
  }

  private chunkContent(content: string, filePath: string, maxChunkSize = 1000, overlap = 200): Chunk[] {
    const lines = content.split('\n');
    const chunks: Chunk[] = [];
    let currentContent = '';
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (this.isBoundaryLine(line) && currentContent.length > maxChunkSize * 0.5) {
        chunks.push({
          content: currentContent,
          startLine,
          endLine: i - 1
        });
        
        // Character-based overlap
        let overlapContent = '';
        let overlapLineIdx = i - 1;
        while (overlapLineIdx >= startLine && overlapContent.length + lines[overlapLineIdx].length < overlap) {
          overlapContent = lines[overlapLineIdx] + '\n' + overlapContent;
          overlapLineIdx--;
        }
        currentContent = overlapContent + line + '\n';
        startLine = Math.max(0, overlapLineIdx + 1);
      } else {
        currentContent += line + '\n';
      }

      if (currentContent.length > maxChunkSize) {
        chunks.push({
          content: currentContent,
          startLine,
          endLine: i
        });
        
        let overlapContent = '';
        let overlapLineIdx = i;
        while (overlapLineIdx >= startLine && overlapContent.length + lines[overlapLineIdx].length < overlap) {
          overlapContent = lines[overlapLineIdx] + '\n' + overlapContent;
          overlapLineIdx--;
        }
        currentContent = overlapContent;
        startLine = Math.max(0, overlapLineIdx + 1);
      }
    }

    if (currentContent.trim()) {
      chunks.push({
        content: currentContent,
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

