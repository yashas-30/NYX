import * as lancedb from 'vectordb';
import path from 'path';
import fs from 'fs';
import { EmbeddingService } from './embeddingService.js';

export interface DocumentChunk {
  id: string;
  text: string;
  source: string;
  vector: number[];
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private tableName = 'rag_documents';

  private async getDb() {
    if (!this.db) {
      const dbPath = path.resolve(process.cwd(), 'server', 'db', 'lancedb');
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }
      this.db = await lancedb.connect(dbPath);
    }
    return this.db;
  }

  /**
   * Initializes or returns the existing table.
   * Required to define the schema before inserting if it doesn't exist.
   */
  private async getTable(dimension: number) {
    const db = await this.getDb();
    const tableNames = await db.tableNames();
    
    if (!tableNames.includes(this.tableName)) {
      // Create empty table with initial schema derived from a dummy record
      const dummyVector = new Array(dimension).fill(0);
      return await db.createTable(this.tableName, [{
        id: 'init',
        text: '',
        source: '',
        vector: dummyVector
      }]);
    }
    return await db.openTable(this.tableName);
  }

  /**
   * Upserts document chunks into LanceDB
   */
  async upsertDocuments(chunks: DocumentChunk[]) {
    if (chunks.length === 0) return;
    const table = await this.getTable(chunks[0].vector.length);
    // Overwrite behavior or append? For now, we append.
    // In production, we'd want to handle duplicates by ID.
    await table.add(chunks as unknown as Record<string, unknown>[]);
  }

  /**
   * Performs similarity search for a given query text.
   */
  async similaritySearch(query: string, provider: 'gemini' | 'ollama', limit = 5) {
    const queryVector = await EmbeddingService.embedText(query, { provider });
    const table = await this.getTable(queryVector.length);
    
    const results = await table
      .search(queryVector)
      .limit(limit)
      .execute();
      
    return results.filter(r => r.id !== 'init').map(r => ({
      id: r.id as string,
      text: r.text as string,
      source: r.source as string,
      score: r._distance as number
    }));
  }
}

export const vectorStore = new VectorStore();
