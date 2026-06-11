// fallow-ignore-file code-duplication
console.log('[DEBUG] 1. Importing env.ts');
import { env } from './server/config/env.js';
console.log('[DEBUG] 2. Importing otel.js');
import './server/lib/otel.js';
console.log('[DEBUG] 3. Importing Sentry');
import * as Sentry from '@sentry/node';

// Initialize Sentry before anything else
if (env.SENTRY_DSN) {
  console.log('[DEBUG] 4. Initializing Sentry');
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

console.log('[DEBUG] 5. Importing apiAgent.js');
import './server/lib/apiAgent.js'; // Init global connection pooling
console.log('[DEBUG] 6. Importing logger.js');
import logger from './server/lib/logger.js';
console.log('[DEBUG] 7. Importing bootstrap.js');
import {
  initializeDatabaseAndPlugins,
  runDependencyHealthChecks,
  spawnBackgroundServices,
  registerShutdownHandlers,
} from './server/lib/bootstrap.js';
console.log('[DEBUG] 8. Importing fastifyConfig.js');
import { buildFastifyServer } from './server/lib/fastifyConfig.js';
console.log('[DEBUG] 9. Importing websocket/index.js');
import { initializeWebSocket } from './server/websocket/index.js';
console.log('[DEBUG] 10. Imports complete');

const PORT = process.env.NYX_MANAGED_PORT ? parseInt(process.env.NYX_MANAGED_PORT, 10) : (env.PORT || 3001);
console.log('DEBUG_PORTS', { NYX_MANAGED_PORT: process.env.NYX_MANAGED_PORT, envPORT: env.PORT, PORT });
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

  console.log('[DEBUG] 11. Running initializeDatabaseAndPlugins');
  await initializeDatabaseAndPlugins();
  console.log('[DEBUG] 12. Running spawnBackgroundServices');
  const { clearHealthChecks } = spawnBackgroundServices();

  // Build Fastify (registers all plugins, routes — but does NOT listen yet)
  console.log('[DEBUG] 13. Running buildFastifyServer');
  const app = await buildFastifyServer();

  // Attach Socket.IO BEFORE listen() — addHook must be in setup phase
  console.log('[DEBUG] 14. Running initializeWebSocket');
  initializeWebSocket(app);

  // Single server, single port — Vite proxies /api and /ws directly here
  console.log('[DEBUG] 15. Listening on port', PORT);
  await app.listen({ port: PORT, host: '127.0.0.1' });
  logger.info(`🚀 NYX Server running on http://localhost:${PORT}`);

  // Run dependency health checks AFTER we're listening — they're informational only
  // and should not block the server from accepting connections
  setImmediate(() => {
    runDependencyHealthChecks().catch((err) =>
      logger.warn({ err }, '[DepCheck] Background dependency check failed (non-fatal)')
    );
  });

  registerShutdownHandlers(app, clearHealthChecks);
}

startServer().catch((err) => {
  logger.error({ err }, '[Bootstrap] Fatal server startup error');
  process.exit(1);
});
