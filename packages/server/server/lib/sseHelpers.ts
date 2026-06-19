import { FastifyReply } from 'fastify';
import { createSessionToken } from '../features/vault/vault.service.js';

/**
 * Sends a cryptographically fresh rotated session token as SSE metadata.
 * Should be called immediately after flushing event-stream headers.
 */
export function sendSseTokenRotate(res: FastifyReply): void {
  const newToken = createSessionToken(false);
  const sseMetadata = `event: metadata\ndata: ${JSON.stringify({ tokenRotate: newToken })}\n\n`;
  res.raw.write(sseMetadata, 'utf8');
}
