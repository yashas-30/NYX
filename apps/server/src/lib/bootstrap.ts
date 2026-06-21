import { fileURLToPath } from 'url';
import logger from './logger.js';
import { cleanupProcesses, registerProcess } from './processRegistry.js';
import { CodebaseScanner } from '../features/workspace/codebaseScanner.js';
import { runMigrations } from '../db/migrator.js';
import {
  migrateOldStore,
  migrateSqliteStore,
} from '../features/conversations/conversations.service.js';
import { pluginRegistry } from './pluginRegistry.js';
import http from 'node:http';

const execAsync = promisify(exec);
const appsServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runDependencyHealthChecks() {
  logger.info('[DepCheck] Running startup dependency health checks...');

  // Check Ollama daemon
  try {
    await performHealthCheck('http://127.0.0.1:11434/', 2000);
    logger.info('[DepCheck] Ollama daemon: OK');
  } catch (error: any) {
    logger.warn(
      '[DepCheck] Ollama daemon: NOT FOUND — Local models will be unavailable. Please start Ollama.'
    );
  }

  logger.info('[DepCheck] Startup dependency health checks complete.');
}

export async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

function performHealthCheck(url: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Health check returned status code: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Health check request timed out'));
    });
  });
}

export async function initializeDatabaseAndPlugins() {
  runMigrations();
  migrateSqliteStore();
  migrateOldStore();
  await pluginRegistry.loadPlugins();
}

export function spawnBackgroundServices() {
  // Python/Scrapling has been deprecated and removed.
  // Browsing is handled via JS Playwright/BrowserForge.
  return {
    clearHealthChecks: () => {}
  };
}

export function registerShutdownHandlers(app: any, expressServer?: any, clearHealthChecks?: () => void) {
  const shutdown = () => {
    logger.info('[Server] Gracefully shutting down...');
    cleanupProcesses();
    if (clearHealthChecks) {
      clearHealthChecks();
    }
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ err: error }, '[Shutdown] Failed to dispose CodebaseScanner');
    }
    
    const closeFastify = app ? app.close() : Promise.resolve();
    const closeExpress = expressServer ? new Promise<void>((resolve) => expressServer.close(() => resolve())) : Promise.resolve();

    Promise.all([closeFastify, closeExpress]).then(() => {
      process.exit(0);
    }).catch((err) => {
      logger.error({ err }, '[Shutdown] Error during shutdown');
      process.exit(1);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (e) => logger.error({ err: e }, '[UnhandledRejection]'));
  process.on('uncaughtException', (e: any) => {
    // Spawn errors from optional background services (scrapling, antigravity) should not crash the server
    if (e?.code === 'ENOENT' && e?.syscall === 'spawn') {
      logger.warn({ err: e }, '[UncaughtException] Background service spawn failed — continuing');
      return;
    }
    logger.error({ err: e }, '[UncaughtException]');
    cleanupProcesses();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ error }, '[UncaughtException] Failed to dispose CodebaseScanner');
    }
    process.exit(1);
  });
}
