import { Response } from 'express';
import { createSessionToken } from './keyVault.ts';

/**
 * Sends a cryptographically fresh rotated session token as SSE metadata.
 * Should be called immediately after flushing event-stream headers.
 */
export function sendSseTokenRotate(res: Response): void {
  const newToken = createSessionToken(false);
  const sseMetadata = `event: metadata\ndata: ${JSON.stringify({ tokenRotate: newToken })}\n\n`;
  res.write(sseMetadata, 'utf8');
}
