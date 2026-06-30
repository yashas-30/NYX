import Database from 'better-sqlite3';
import { DB_FILE } from './server/lib/paths.ts';

const sqlite = new Database(DB_FILE);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS prompt_optimizations (
    id TEXT PRIMARY KEY,
    original_prompt TEXT NOT NULL,
    optimized_prompt TEXT NOT NULL,
    domain TEXT NOT NULL,
    version TEXT NOT NULL,
    rating INTEGER,
    timestamp INTEGER NOT NULL
  );
`);
console.log("Migration successful");
