import * as lancedb from "@lancedb/lancedb";
import path from "path";
import os from "os";

export interface MemoryEntry {
  text: string;
  metadata?: Record<string, any>;
}

export class EpisodicMemory {
  private db: lancedb.Connection | null = null;
  private tableName = "episodic_memory";

  async init() {
    // Store in user home directory so it persists across runs
    const dbPath = path.join(os.homedir(), ".nyx", "lancedb");
    this.db = await lancedb.connect(dbPath);
    
    const tableNames = await this.db.tableNames();
    if (!tableNames.includes(this.tableName)) {
      // For a real app, use an embedding function. 
      // Assuming OpenAI-compatible 1536-dim vectors for this setup.
      const dummyVector = Array(1536).fill(0);
      await this.db.createTable(this.tableName, [
        { vector: dummyVector, text: "System initialized", metadata: JSON.stringify({ type: "system" }) }
      ]);
    }
  }

  async addMemory(entry: MemoryEntry, vector: number[]) {
    if (!this.db) await this.init();
    const table = await this.db!.openTable(this.tableName);
    await table.add([
      { 
        vector, 
        text: entry.text, 
        metadata: JSON.stringify(entry.metadata || {}) 
      }
    ]);
  }

  async searchMemory(queryVector: number[], limit: number = 5) {
    if (!this.db) await this.init();
    const table = await this.db!.openTable(this.tableName);
    const results = await table.search(queryVector).limit(limit).execute();
    return results.map(r => ({
      text: r.text as string,
      metadata: JSON.parse(r.metadata as string),
      score: r._distance
    }));
  }
}
