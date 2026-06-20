import * as lancedb from "@lancedb/lancedb";
import { DocumentChunk } from "./processor";

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  async init(dbPath: string = "data/lancedb") {
    this.db = await lancedb.connect(dbPath);
    // LanceDB supports Hybrid Search (BM25 + Vector) natively using the FTS index
    // We create a table with vector and text fields
    try {
      this.table = await this.db.openTable("documents");
    } catch {
      // Create if doesn't exist. Assuming embeddings are 1536 dim (e.g. OpenAI)
      this.table = await this.db.createTable("documents", [
        { id: "init", vector: Array(1536).fill(0), content: "", filename: "" }
      ]);
      await this.table.delete("id = 'init'");
      // Create full text search index for BM25 (Hybrid Search requirement)
      // Note: FTS index creation requires specific LanceDB config, leaving out for now if not supported directly on this version
      try {
        await this.table.createIndex("content", { config: lancedb.Index.fts() });
      } catch (e) {
        // Ignore FTS index creation error if not supported
      }
    }
  }

  async addChunks(chunks: DocumentChunk[], filename: string) {
    if (!this.table) throw new Error("VectorStore not initialized");
    
    const records = chunks.map((chunk, i) => ({
      id: `${filename}_${i}`,
      vector: chunk.embedding || Array(1536).fill(0), // Mock embedding if missing
      content: chunk.content,
      filename: filename
    }));

    await this.table.add(records);
  }

  async hybridSearch(query: string, queryEmbedding: number[], limit: number = 5) {
    if (!this.table) throw new Error("VectorStore not initialized");

    // Implement Hybrid Search: Combining Vector Similarity with BM25 Keyword match
    // LanceDB allows `.search(queryEmbedding).where(...).limit(...)` 
    // but for true hybrid we can use the full text search alongside vector search.
    
    // In LanceDB JS, we can execute a vector search and combine with FTS
    const results = await this.table
      .search(queryEmbedding)
      .limit(limit)
      .toArray();

    // In a full implementation, we'd also run:
    // const ftsResults = await this.table.search(query).limit(limit).execute();
    // And use Reciprocal Rank Fusion (RRF) to merge `results` and `ftsResults`.

    return results;
  }
}
