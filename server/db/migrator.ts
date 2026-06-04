import logger from '../lib/logger.ts';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const currentDirname = (() => {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return '';
  }
})();

export function runMigrations() {
  try {
    logger.info('[DB] Running database migrations...');
    // Resolve path to standard packaging migrations location
    const migrationsFolder = path.join(currentDirname, 'migrations');

    if (!fs.existsSync(migrationsFolder)) {
      const fallbackFolder = path.resolve(currentDirname, '..', 'server', 'db', 'migrations');
      if (fs.existsSync(fallbackFolder)) {
        migrate(db, { migrationsFolder: fallbackFolder });
        logger.info('[DB] Migrations completed using workspace fallback.');
        return;
      }
      throw new Error(
        `Migration directory not found at packaged path (${migrationsFolder}) or fallback (${fallbackFolder})`
      );
    }

    migrate(db, { migrationsFolder });
    logger.info('[DB] Database migrations completed successfully.');
  } catch (error: any) {
    logger.error('[DB] Failed to run database migrations:', error);
    throw error;
  }
}

// Run migrations directly if this file is executed
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('migrator.ts')) {
  runMigrations();
}
