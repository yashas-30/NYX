import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../lib/logger.js';
import { getRequestSignerSecrets } from '../features/vault/vault.service.js';
import { env } from '../config/env.js';

export const requestSignerMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip signing check for public/health routes
  const fullPath = request.url.split('?')[0].replace(/\/$/, '');
  const isPublic = new Set([
    '/api/v1/health',
    '/api/v1/vault/status',
    '/api/v1/vault/token',
    '/api/v1/auth/session',
    '/api/v1/admin/logs',
    '/api/v1/metrics',
  ]).has(fullPath);

  if (isPublic) return;

  // Only verify mutations (POST, PUT, DELETE, PATCH)
  if (['GET', 'OPTIONS', 'HEAD'].includes(request.method)) {
    return;
  }

  const signature = request.headers['x-nyx-signature'] as string;
  const timestampStr = request.headers['x-nyx-timestamp'] as string;

  if (!signature || !timestampStr) {
    if (env.ENFORCE_REQUEST_SIGNATURE) {
      logger.warn('[RequestSigner] Missing signature or timestamp');
      reply.code(401).send({ error: 'Missing request signature' });
      return reply;
    }
    return;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    reply.code(400).send({ error: 'Invalid timestamp' });
    return reply;
  }

  // Prevent replay attacks (5 minute window)
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    logger.warn('[RequestSigner] Request expired or clock skewed');
    reply.code(401).send({ error: 'Request expired' });
    return reply;
  }

  const secrets = await getRequestSignerSecrets();

  // Hash the body + timestamp + path
  const payload = `${request.method}:${fullPath}:${timestamp}:${
    request.body && Object.keys(request.body as any).length > 0 ? JSON.stringify(request.body) : ''
  }`;

  const expectedSignatureCurrent = crypto
    .createHmac('sha256', secrets.current)
    .update(payload)
    .digest('hex');
  const expectedSignaturePrevious = secrets.previous
    ? crypto.createHmac('sha256', secrets.previous).update(payload).digest('hex')
    : null;

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedCurrentBuffer = Buffer.from(expectedSignatureCurrent, 'hex');
    let isValid = false;

    if (
      sigBuffer.length === expectedCurrentBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedCurrentBuffer)
    ) {
      isValid = true;
    } else if (expectedSignaturePrevious) {
      const expectedPreviousBuffer = Buffer.from(expectedSignaturePrevious, 'hex');
      if (
        sigBuffer.length === expectedPreviousBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedPreviousBuffer)
      ) {
        isValid = true;
      }
    }

    if (!isValid) {
      logger.warn('[RequestSigner] Invalid signature mismatch');
      reply.code(401).send({ error: 'Invalid request signature' });
      return reply;
    }
  } catch (e) {
    reply.code(401).send({ error: 'Invalid request signature format' });
    return reply;
  }
};
