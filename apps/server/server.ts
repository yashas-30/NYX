// fallow-ignore-file code-duplication
import { env } from './server/config/env.js';
import './server/lib/otel.js';
import * as Sentry from '@sentry/node';

// Initialize Sentry before anything else
if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

import './server/lib/apiAgent.js'; // Init global connection pooling
import logger from './server/lib/logger.js';
import {
  initializeDatabaseAndPlugins,
  runDependencyHealthChecks,
  spawnBackgroundServices,
  registerShutdownHandlers,
} from './server/lib/bootstrap.js';
import { buildFastifyServer } from './server/lib/fastifyConfig.js';
import { initializeWebSocket } from './server/websocket/index.js';

const PORT = process.env.NYX_MANAGED_PORT ? parseInt(process.env.NYX_MANAGED_PORT, 10) : (env.PORT || 3001);

async function startServer() {
  if (process.env.NYX_PARENT_PID) {
    const parentPid = parseInt(process.env.NYX_PARENT_PID, 10);
    setInterval(() => {
      try {
        process.kill(parentPid, 0);
      } catch (e) {
        logger.error(`[Watchdog] Parent process ${parentPid} died. Initiating graceful shutdown.`);
        process.exit(0);
      }
    }, 2000).unref();
  }

  await initializeDatabaseAndPlugins();
  await runDependencyHealthChecks();
  const { clearHealthChecks } = spawnBackgroundServices();

  // Build Fastify (registers all plugins, routes — but does NOT listen yet)
  const app = await buildFastifyServer();

  // Attach Socket.IO BEFORE listen() — addHook must be in setup phase
  initializeWebSocket(app);

  // Single server, single port — Vite proxies /api and /ws directly here
  await app.listen({ port: PORT, host: '127.0.0.1' });
  logger.info(`🚀 NYX Server running on http://localhost:${PORT}`);

  registerShutdownHandlers(app, clearHealthChecks);
}

startServer().catch((err) => {
  logger.error({ err }, '[Bootstrap] Fatal server startup error');
  process.exit(1);
});
