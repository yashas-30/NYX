import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import cron from 'node-cron';

// Define placeholder methods to allow the script to compile.
// In a full implementation, these would import the actual load/save logic.
const loadKeys = () => ({});
const loadSettings = () => ({});
const loadDownloads = () => ([]);
const saveKeys = (keys: any) => {};
const saveSettings = (settings: any) => {};

export class BackupManager {
  private backupDir: string;
  private maxBackups: number;

  constructor(backupDir: string = '/data/backups', maxBackups: number = 7) {
    this.backupDir = backupDir;
    this.maxBackups = maxBackups;
    this.ensureDir();
  }

  private ensureDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `nyx-backup-${timestamp}.gz`);

    // Backup database
    await pipeline(
      createReadStream('/data/nyx.db'),
      createGzip(),
      createWriteStream(backupPath)
    );

    // Backup config
    const configPath = path.join(this.backupDir, `nyx-config-${timestamp}.json`);
    const config = {
      apiKeys: await loadKeys(), // Using await in case they become async
      settings: await loadSettings(),
      downloads: await loadDownloads(),
      timestamp: Date.now()
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Cleanup old backups
    await this.cleanupOldBackups();

    return backupPath;
  }

  private async cleanupOldBackups() {
    const files = await fs.promises.readdir(this.backupDir);
    const backups = files
      .filter(f => f.startsWith('nyx-backup-'))
      .map(f => ({ name: f, time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    const toDelete = backups.slice(this.maxBackups);
    for (const backup of toDelete) {
      await fs.promises.unlink(path.join(this.backupDir, backup.name));
    }
  }

  scheduleBackups(cronExpression: string = '0 2 * * *') { // Daily at 2 AM
    cron.schedule(cronExpression, () => {
      console.log('[Backup] Starting scheduled backup...');
      this.createBackup()
        .then(path => console.log(`[Backup] Completed: ${path}`))
        .catch(err => console.error('[Backup] Failed:', err));
    });
  }

  async restoreFromBackup(backupPath: string): Promise<void> {
    // Decompress and restore
    const { createGunzip } = await import('zlib');
    await pipeline(
      createReadStream(backupPath),
      createGunzip(),
      createWriteStream('/data/nyx.db')
    );

    // Restore config if present
    const configPath = backupPath.replace('nyx-backup-', 'nyx-config-').replace('.gz', '.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      await saveKeys(config.apiKeys);
      await saveSettings(config.settings);
    }
  }
}
