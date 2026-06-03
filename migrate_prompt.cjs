const Database = require('better-sqlite3');

const sqlite = new Database('E:\\NYX\\.nyx-state\\nyx.db');
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
