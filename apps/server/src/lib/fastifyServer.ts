import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import compression from '@fastify/compress';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { isProd } from './paths.js';
import { env } from '../config/env.js';
import { registerRoutes } from '../routes/index.js';
import { fastifyModelRoutes } from '../fastify/fastify.server.js';
import { workspaceWatcher } from '../features/workspace/workspace.watcher.js';
import { LocalModelManager } from '../features/local-models/localModelManager.js';

const appsServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function buildFastifyServer() {
  const fastifyApp = Fastify({
    logger: false, // We use our own pino logger
    bodyLimit: 50 * 1024 * 1024, // 50mb
  });

  // Security Headers
  await fastifyApp.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // Compression
  await fastifyApp.register(compression);

  // Rate Limiting
  await fastifyApp.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    errorResponseBuilder: function () {
      return { error: 'Too many requests' };
    },
  });

  // Cookies
  await fastifyApp.register(cookie);

  // Websockets
  await fastifyApp.register(fastifyWebsocket);

  // Register the standalone fastify model proxy server plugin
  await fastifyApp.register(fastifyModelRoutes);

  // Register main API routes
  await fastifyApp.register(registerRoutes);

  // Register Websocket Endpoints
  fastifyApp.register(async (app) => {
    app.get('/ws/file-watcher', { websocket: true }, (connection) => {
      workspaceWatcher.addClient(connection.socket);
      connection.socket.on('error', (err) => logger.error({ err }, '[WS] file-watcher error'));
    });

    app.get('/ws/downloads', { websocket: true }, (connection) => {
      LocalModelManager.addClient(connection.socket);
      connection.socket.on('error', (err) => logger.error({ err }, '[WS] downloads error'));
    });

    app.get('/ws/session-sync', { websocket: true }, (connection) => {
      // Stub to prevent ECONNRESET
      connection.socket.on('message', () => {});
      connection.socket.on('error', (err) => logger.error({ err }, '[WS] session-sync error'));
    });
  });

  // Serve static files in production
  if (isProd) {
    let distPath = path.join(appsServerDir, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(appsServerDir, '../dist');
    }
    logger.info(`[Fastify] Serving static assets from: ${distPath}`);
    
    await fastifyApp.register(fastifyStatic, {
      root: distPath,
      wildcard: false,
    });

    fastifyApp.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/v1')) {
        return reply.code(404).send({ error: 'Endpoint not found' });
      } else {
        return reply.sendFile('index.html');
      }
    });
  }

  return fastifyApp;
}
