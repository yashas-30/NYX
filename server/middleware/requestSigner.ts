import crypto from 'crypto';
import express from 'express';
import logger from '../lib/logger.ts';

let internalSecret: string | null = null;

export function getInternalSecret(): string {
  if (!internalSecret) {
    internalSecret = crypto.randomBytes(32).toString('hex');
  }
  return internalSecret;
}

export const requestSignerMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Skip signing check for public/health routes
  const fullPath = req.originalUrl.split('?')[0].replace(/\/$/, '');
  const isPublic = new Set([
    '/api/v1/health',
    '/api/v1/vault/status',
    '/api/v1/vault/token',
    '/api/v1/auth/session',
    '/api/v1/auth/handshake',
    '/api/v1/admin/logs',
    '/api/v1/metrics',
  ]).has(fullPath);

  if (isPublic) return next();

  // Only verify mutations (POST, PUT, DELETE, PATCH)
  if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
    return next();
  }

  const signature = req.headers['x-nyx-signature'] as string;
  const timestampStr = req.headers['x-nyx-timestamp'] as string;

  if (!signature || !timestampStr) {
    logger.warn('[RequestSigner] Missing signature or timestamp');
    return res.status(401).json({ error: 'Missing request signature' });
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  // Prevent replay attacks (5 minute window)
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    logger.warn('[RequestSigner] Request expired or clock skewed');
    return res.status(401).json({ error: 'Request expired' });
  }

  const secret = getInternalSecret();
  
  // Hash the body + timestamp + path
  const payload = `${req.method}:${fullPath}:${timestamp}:${
    req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : ''
  }`;
  
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Use timingSafeEqual to prevent timing attacks
  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      logger.warn('[RequestSigner] Invalid signature mismatch');
      return res.status(401).json({ error: 'Invalid request signature' });
    }
  } catch (e) {
    return res.status(401).json({ error: 'Invalid request signature format' });
  }

  next();
};
