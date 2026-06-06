import { FastifyReply } from 'fastify';
import { createSessionToken } from '../features/vault/vault.service.js';

/**
 * Sends a cryptographically fresh rotated session token as SSE metadata.
 * Should be called immediately after flushing event-stream headers.
 */
export function sendSseTokenRotate(res: any): void {
  const newToken = createSessionToken(false);
  const sseMetadata = `event: metadata\ndata: ${JSON.stringify({ tokenRotate: newToken })}\n\n`;
  sseWrite(res, sseMetadata);
}

/**
 * Initializes a Fastify reply for Server-Sent Events bypassing Fastify's buffer.
 */
export function initFastifySse(reply: FastifyReply): void {
  reply.header('Content-Type', 'text/event-stream');
  reply.header('Cache-Control', 'no-cache');
  reply.header('Connection', 'keep-alive');
  reply.header('X-Accel-Buffering', 'no');
  reply.raw.flushHeaders();
}

/**
 * Formats a regular string chunk into standard SSE format.
 */
export function formatSseChunk(chunk: any): string {
  if (typeof chunk === 'string') {
    return `data: ${JSON.stringify({ chunk })}\n\n`;
  }
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Formats an error message into standard SSE format.
 */
export function formatSseError(error: string): string {
  return `data: ${JSON.stringify({ error })}\n\n`;
}

/**
 * Formats the standard [DONE] SSE message.
 */
export function formatSseDone(): string {
  return 'data: [DONE]\n\n';
}

/**
 * Writes data to the response and attempts to flush if possible.
 * Works with both Express response and Fastify reply.raw.
 */
export function sseWrite(res: any, data: string): void {
  res.write(data);
  if (typeof res.flush === 'function') {
    res.flush();
  }
}
