import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.ts';
import { DB_FILE } from '../lib/paths.ts';
import logger from '../lib/logger.ts';

const sqlite = new Database(DB_FILE, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Enable Write-Ahead Logging (WAL) mode for high concurrency
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('temp_store = MEMORY');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };
export * as schema from './schema.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeDbQuery<T>(
  queryPromise: Promise<T>,
  isWrite: boolean = false
): Promise<T> {
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
