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
    return path.dirname(fileURLToPath(new Function('return import.meta.url')()));
  } catch {
    return '';
  }
})();

export function runMigrations() {
  try {
    console.log('[DB] Running database migrations...');
    // Resolve path to standard packaging migrations location
    const migrationsFolder = path.join(currentDirname, 'migrations');
    
    if (!fs.existsSync(migrationsFolder)) {
      const fallbackFolder = path.resolve(process.cwd(), 'server/db/migrations');
      if (fs.existsSync(fallbackFolder)) {
        migrate(db, { migrationsFolder: fallbackFolder });
        console.log('[DB] Migrations completed using workspace fallback.');
        return;
      }
      throw new Error(`Migration directory not found at packaged path (${migrationsFolder}) or fallback (${fallbackFolder})`);
    }

    migrate(db, { migrationsFolder });
    console.log('[DB] Database migrations completed successfully.');
  } catch (err: any) {
    console.error('[DB] Failed to run database migrations:', err);
  }
}
