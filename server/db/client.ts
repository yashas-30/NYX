import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.ts';
import { DB_FILE } from '../lib/paths.ts';

const sqlite = new Database(DB_FILE);

// Enable Write-Ahead Logging (WAL) mode for high concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };
export * as schema from './schema.ts';
