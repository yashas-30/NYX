// fallow-ignore-file code-duplication
import { env } from './server/config/env.js';
import './server/lib/otel.js';
import * as Sentry from '@sentry/node';

// Initialize Sentry before anything else
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
  });
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
import { buildExpressProxy } from './server/lib/expressProxy.js';

async function startServer() {
  await initializeDatabaseAndPlugins();
  await runDependencyHealthChecks();
  const { clearHealthChecks } = spawnBackgroundServices();

  // Initialize Fastify on 3001
  const fastifyApp = await buildFastifyServer();
  await fastifyApp.listen({ port: 3001, host: '127.0.0.1' });
  logger.info('🚀 Fastify API Server running on http://localhost:3001');

  // Initialize Express Proxy on 3000
  const expressServer = buildExpressProxy();

  // Register graceful shutdown and error handlers
  registerShutdownHandlers(fastifyApp, expressServer, clearHealthChecks);
}

startServer().catch((err) => {
  logger.error({ err }, '[Bootstrap] Fatal server startup error');
  process.exit(1);
});
