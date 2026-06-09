import { env } from '../config/env.js';
import { findPythonPath } from './paths.js';
import { setScraplingHealthState } from '../features/admin/admin.router.js';
import path from 'path';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { workerPool } from './workers/workerPool.js';
import { cleanupProcesses, registerProcess } from './processRegistry.js';
import { CodebaseScanner } from '../features/workspace/codebaseScanner.js';
import { runMigrations } from '../db/migrator.js';

import { pluginRegistry } from './pluginRegistry.js';
import http from 'node:http';

const execAsync = promisify(exec);
const appsServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function runDependencyHealthChecks() {
  logger.info('[DepCheck] Running startup dependency health checks...');

  // Check Python availability
  try {
    const pythonPath = findPythonPath();
    await execAsync(`"${pythonPath}" --version`, { timeout: 5_000 });
    logger.info({ pythonPath }, '[DepCheck] Python: OK');
  } catch (error: any) {
    logger.warn(
      { error: error.message },
      '[DepCheck] Python: NOT FOUND — Scrapling service will be unavailable'
    );
  }

  // Check llama-server binary
  const llamaPaths = [
    path.join(appsServerDir, '.nyx-models', 'llama-server.exe'),
    path.join(appsServerDir, '.nyx-models', 'llama-server'),
    path.join(appsServerDir, 'llama-server.exe'),
    path.join(appsServerDir, 'llama-server'),
  ];
  const llamaBinaryExists = llamaPaths.some((p) => fs.existsSync(p));
  if (llamaBinaryExists) {
    logger.info('[DepCheck] llama-server binary: OK');
  } else {
    logger.warn(
      '[DepCheck] llama-server binary: NOT FOUND — Local GGUF models will require download on first use'
    );
  }

  // Check GPU/driver availability (fast registry check on Windows, no slow dxdiag)
  try {
    const { platform } = process;
    if (platform === 'win32') {
      // Quick check via wmic - much faster than dxdiag
      await execAsync('wmic path win32_VideoController get name /format:value 2>nul', { timeout: 3_000 });
      logger.info('[DepCheck] Vulkan driver: Using DirectX fallback (GPU detected)');
    } else {
      await execAsync('vulkaninfo --summary 2>&1 | head -5', { timeout: 3_000 });
      logger.info('[DepCheck] Vulkan driver: OK');
    }
  } catch {
    logger.warn(
      '[DepCheck] Vulkan driver: NOT DETECTED — GPU acceleration may be unavailable for local models'
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
  await pluginRegistry.loadPlugins();
}

export function spawnBackgroundServices() {
  const SCRAPLING_PORT = env.SCRAPLING_PORT;
  let scraplingProc: ReturnType<typeof spawn> | null = null;

  const ANTIGRAVITY_PORT = env.ANTIGRAVITY_PORT;
  let antigravityProc: ReturnType<typeof spawn> | null = null;

  async function spawnScrapling() {
    try {
      const isAvailable = await checkPortAvailable(SCRAPLING_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Scrapling] Port ${SCRAPLING_PORT} is already in use. Skipping spawn to avoid crash-loop. Assuming external instance.`
        );
        return;
      }
      const pythonPath = findPythonPath();
      const scraplingScriptPath = path.join(appsServerDir, 'server', 'python', 'scrapling_server.py');
      const proc = spawn(pythonPath, [scraplingScriptPath, '--port', String(SCRAPLING_PORT)], {
        cwd: path.dirname(scraplingScriptPath),
        detached: false,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      registerProcess(proc);
      setScraplingHealthState('running');
      scraplingProc = proc;
      proc.on('exit', () => {
        setScraplingHealthState('offline');
        scraplingProc = null;
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '[Scrapling] Failed to spawn Scrapling local service');
    }
  }

  async function spawnAntigravity() {
    try {
      const isAvailable = await checkPortAvailable(ANTIGRAVITY_PORT);
      if (!isAvailable) {
        logger.warn(
          `[Antigravity] Port ${ANTIGRAVITY_PORT} is already in use. Skipping spawn to avoid crash-loop.`
        );
        return;
      }
      const pythonPath = findPythonPath();
      const antigravityScriptPath = path.join(
        appsServerDir,
        'server',
        'python',
        'antigravity_service.py'
      );
      const proc = spawn(pythonPath, [antigravityScriptPath, '--port', String(ANTIGRAVITY_PORT)], {
        cwd: path.dirname(antigravityScriptPath),
        detached: false,
        stdio: ['pipe', 'inherit', 'inherit'],
      });
      registerProcess(proc);
      antigravityProc = proc;
      proc.on('exit', () => {
        antigravityProc = null;
      });
    } catch (error: any) {
      logger.error(
        { error: error.message },
        '[Antigravity] Failed to spawn Antigravity local service'
      );
    }
  }

  spawnScrapling();
  spawnAntigravity();

  // Health checks
  const scraplingHealthInterval = setInterval(async () => {
    try {
      await performHealthCheck(`http://127.0.0.1:${SCRAPLING_PORT}/health`, 5000);
    } catch (err: any) {
      logger.warn({ error: err?.message || err }, '[Scrapling] Health check failed - restarting Scrapling service...');
      if (scraplingProc) {
        try {
          scraplingProc.kill('SIGTERM');
        } catch {}
        scraplingProc = null;
      }
      setTimeout(() => spawnScrapling(), 2000);
    }
  }, 15_000);
  scraplingHealthInterval.unref();

  const antigravityHealthInterval = setInterval(async () => {
    try {
      await performHealthCheck(`http://127.0.0.1:${ANTIGRAVITY_PORT}/health`, 5000);
    } catch (err: any) {
      logger.warn({ error: err?.message || err }, '[Antigravity] Health check failed — restarting Antigravity service...');
      if (antigravityProc) {
        try {
          antigravityProc.kill('SIGTERM');
        } catch {}
        antigravityProc = null;
      }
      setTimeout(() => spawnAntigravity(), 2000);
    }
  }, 15_000);
  antigravityHealthInterval.unref();

  return {
    clearHealthChecks: () => {
      clearInterval(scraplingHealthInterval);
      clearInterval(antigravityHealthInterval);
    }
  };
}

export function registerShutdownHandlers(app: any, clearHealthChecks?: () => void) {
  const shutdown = () => {
    logger.info('[Server] Gracefully shutting down...');
    cleanupProcesses();
    if (clearHealthChecks) clearHealthChecks();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ err: error }, '[Shutdown] Failed to dispose CodebaseScanner');
    }

    // Gracefully shut down worker thread pool
    workerPool.shutdown().catch(() => {});

    app.close().then(() => {
      process.exit(0);
    }).catch((err: any) => {
      logger.error({ err }, '[Shutdown] Error during shutdown');
      process.exit(1);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (e) => {
    logger.error({ err: e }, '[UnhandledRejection] Shutting down gracefully...');
    cleanupProcesses();
    if (clearHealthChecks) clearHealthChecks();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ error }, '[UnhandledRejection] Failed to dispose CodebaseScanner');
    }
    app.close().then(() => {
      process.exit(1);
    }).catch((err: any) => {
      logger.error({ err }, '[UnhandledRejection] Error during app close');
      process.exit(1);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  });

  process.on('uncaughtException', (e: any) => {
    // Don't crash the server for non-fatal stream/network errors
    const nonFatalCodes = ['ERR_STREAM_WRITE_AFTER_END', 'ERR_STREAM_DESTROYED', 'ECONNRESET', 'EPIPE'];
    if (nonFatalCodes.includes(e.code)) {
      logger.warn({ err: e }, '[UncaughtException] Non-fatal error suppressed — server continues running');
      return;
    }
    logger.error({ err: e }, '[UncaughtException]');
    cleanupProcesses();
    if (clearHealthChecks) clearHealthChecks();
    try {
      CodebaseScanner.dispose();
    } catch (error: any) {
      logger.error({ error }, '[UncaughtException] Failed to dispose CodebaseScanner');
    }
    process.exit(1);
  });
}

