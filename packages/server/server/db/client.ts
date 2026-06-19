import { drizzle as sqliteDrizzle } from 'drizzle-orm/better-sqlite3';
import { drizzle as pgDrizzle } from 'drizzle-orm/node-postgres';
import Database from 'better-sqlite3';
import pg from 'pg';
import * as schema from './schema.js';
import { DB_FILE } from '../lib/paths.js';
import logger from '../lib/logger.js';
import { env } from '../config/env.js';

const isPg = !!env.DATABASE_URL;

let dbInstance: any;
let sqliteInstance: Database.Database | null = null;
let pgPoolInstance: pg.Pool | null = null;

if (isPg) {
  logger.info('[DB] Initializing PostgreSQL database connection...');
  pgPoolInstance = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  dbInstance = pgDrizzle(pgPoolInstance, { schema });
} else {
  logger.info('[DB] Initializing SQLite database connection...');
  sqliteInstance = new Database(DB_FILE, {
    verbose: env.NODE_ENV === 'development' ? console.log : undefined,
  });
  // Enable Write-Ahead Logging (WAL) mode for high concurrency
  sqliteInstance.pragma('journal_mode = WAL');
  sqliteInstance.pragma('synchronous = NORMAL');
  sqliteInstance.pragma('temp_store = MEMORY');
  sqliteInstance.pragma('foreign_keys = ON');
  dbInstance = sqliteDrizzle(sqliteInstance, { schema });
}

export const db = dbInstance;
export const sqlite = sqliteInstance as Database.Database; // Cast for backwards compatibility
export const pgPool = pgPoolInstance;
export { isPg };
export * as schema from './schema.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeDbQuery<T>(
  queryPromise: Promise<T>,
  isWrite: boolean = false
): Promise<T> {
  if (isPg) {
    // For pg, we don't have SQLite busy errors, but we can do a simple execution wrapper
    return queryPromise;
  }

  const timeoutMs = 30000;
  let attempts = 0;
  const maxAttempts = isWrite ? 3 : 1;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      const start = Date.now();

      const timeoutPromise = sleep(timeoutMs).then(() => {
        throw new Error('Query execution timed out after 30 seconds');
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const duration = Date.now() - start;

      if (duration > 1000) {
        logger.warn(`[DB] Slow query detected: ${duration}ms`);
      }

      return result as T;
    } catch (error: any) {
      if (isWrite && error.code === 'SQLITE_BUSY' && attempts < maxAttempts) {
        const backoffMs = Math.pow(2, attempts) * 100;
        logger.warn(
          `[DB] SQLITE_BUSY encountered. Retrying in ${backoffMs}ms (attempt ${attempts}/${maxAttempts})...`
        );
        await sleep(backoffMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Exceeded maximum retry attempts for query');
}
