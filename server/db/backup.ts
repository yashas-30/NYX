import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { DB_FILE } from '../lib/paths.ts';
import logger from '../lib/logger.ts';
import { sqlite } from './client.ts';

const BACKUP_DIR = path.join(process.cwd(), '.nyx-cache', 'backups');
const MAX_BACKUPS = 20;

export function startBackupScheduler() {
  logger.info('[DB] Starting automated backup scheduler...');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('[DB] Running scheduled database backup...');
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `nyx-db-backup-${timestamp}.sqlite`);

      // SQLite online backup approach
      await sqlite.backup(backupPath);
      logger.info(`[DB] Backup successfully created at: ${backupPath}`);

      pruneOldBackups();
    } catch (error: any) {
      logger.error('[DB] Failed to create scheduled backup:', error);
    }
  });
}

function pruneOldBackups() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.startsWith('nyx-db-backup-') && file.endsWith('.sqlite'))
      .map((file) => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time); // Newest first

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(MAX_BACKUPS);
      for (const file of toDelete) {
        fs.unlinkSync(file.path);
        logger.info(`[DB] Pruned old backup: ${file.name}`);
      }
    }
  } catch (error: any) {
    logger.error('[DB] Failed to prune old backups:', error);
  }
}
