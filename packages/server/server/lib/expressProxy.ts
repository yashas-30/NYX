import express from 'express';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { isProd } from './paths.js';
import { env } from '../config/env.js';

const appsServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function buildExpressProxy() {
  const expressApp = express();

  // Helmet.js for Express security headers
  expressApp.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          frameAncestors: ["'none'"],
          connectSrc: [
            "'self'",
            'http://127.0.0.1:*',
            'http://localhost:*',
            'https://generativelanguage.googleapis.com',
            'ws://localhost:*',
            'wss://localhost:*',
            'tauri://localhost',
            'nyx://localhost',
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // Proxy configurations
  const apiProxy = createProxyMiddleware({
    target: 'http://127.0.0.1:3001',
    changeOrigin: true,
    ws: true,
    logger: logger as any,
  });

  expressApp.use('/api', apiProxy);
  expressApp.use('/ws', apiProxy);

  // Serve static files in production
  if (isProd) {
    let distPath = path.join(appsServerDir, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      distPath = path.join(appsServerDir, '../dist');
    }
    logger.info(`[Express] Serving static assets from: ${distPath}`);
    expressApp.use(express.static(distPath));
    expressApp.get('*', (req, res) => {
      if (req.url.startsWith('/api/v1')) {
        res.status(404).json({ error: 'Endpoint not found' });
      } else {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  const expressServer = expressApp.listen(env.PORT || 3010, '127.0.0.1', () => {
    logger.info(`🚀 Express Proxy Server running on http://localhost:${env.PORT || 3010}`);
  });

  expressServer.on('upgrade', (req, socket, head) => {
    apiProxy.upgrade(req, socket as any, head);
  });

  return expressServer;
}
