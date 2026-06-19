import { sqlite } from './client.js';
import logger from '../lib/logger.js';
import fs from 'fs';
import { DB_FILE } from '../lib/paths.js';

let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const MAX_DB_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

export function startDbHealthCheck() {
  logger.info('[DB] Starting database health monitoring...');

  setInterval(() => {
    checkConnection();
    checkDatabaseSize();
  }, 30000); // Every 30 seconds
}

function checkConnection() {
  try {
    const result = sqlite.pragma('quick_check', { simple: true });
    // Or just a simple SELECT 1:
    // const result = sqlite.prepare('SELECT 1').get();

    if (result) {
      if (consecutiveFailures > 0) {
        logger.info('[DB] Database connection restored.');
      }
      consecutiveFailures = 0;
    }
  } catch (error: any) {
    consecutiveFailures++;
    logger.error(
      `[DB] Database connection check failed (Attempt ${consecutiveFailures}/${MAX_FAILURES}):`,
      error
    );

    if (consecutiveFailures >= MAX_FAILURES) {
      logger.fatal('[DB] CRITICAL ERROR: Database is unreachable after multiple attempts.');
      // In a production environment, this might trigger a process.exit() or PM2 restart.
      // process.exit(1);
    }
  }
}

function checkDatabaseSize() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      if (stats.size > MAX_DB_SIZE_BYTES) {
        logger.warn(
          `[DB] ALERT: Database size (${(stats.size / 1024 / 1024).toFixed(2)}MB) has exceeded the 500MB threshold.`
        );
      }
    }
  } catch (error: any) {
    logger.error('[DB] Failed to check database size:', error);
  }
}
