import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../lib/logger.js';

interface RateLimitStore {
  timestamps: number[];
}

const windowMs = 60 * 1000; // 1 minute window
const stores = new Map<string, RateLimitStore>();

const PROVIDER_LIMITS: Record<string, number> = {
  gemini: 60, // 60 RPM
};

/**
 * MISSING-2: Per-provider rate limiting middleware using sliding window counter.
 */
export function providerRateLimiter(provider: string) {
  const limit = PROVIDER_LIMITS[provider] || 60;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization || '';
    const key = `${provider}:${authHeader || request.ip || 'anonymous'}`;

    const now = Date.now();
    let store = stores.get(key);
    if (!store) {
      store = { timestamps: [] };
      stores.set(key, store);
    }

    // Filter out timestamps outside the sliding window
    store.timestamps = store.timestamps.filter((ts) => now - ts < windowMs);

    if (store.timestamps.length >= limit) {
      const oldestTs = store.timestamps[0];
      const resetTimeSec = Math.ceil((windowMs - (now - oldestTs)) / 1000);
      reply.header('Retry-After', String(resetTimeSec));
      logger.warn({ key, limit }, `Rate limit exceeded for provider ${provider}`);
      reply.code(429).send({
        error: `Rate limit exceeded for provider ${provider}. Maximum is ${limit} requests per minute.`,
        retryAfterSeconds: resetTimeSec,
      });
      return reply; // stop further execution in hook
    }

    store.timestamps.push(now);
  };
}

import { RateLimiterMemory } from 'rate-limiter-flexible';

const searchLimiter = new RateLimiterMemory({
  points: 10, // 10 searches
  duration: 60, // per 60 seconds
});

export const searchRateLimiter = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const ip = request.ip || 'anonymous';
    await searchLimiter.consume(ip);
  } catch (rateLimiterRes: any) {
    logger.warn(`Rate limit exceeded for search by IP ${request.ip}`);
    reply.header('Retry-After', String(Math.ceil(rateLimiterRes.msBeforeNext / 1000)));
    reply.code(429).send({ error: 'Rate limit exceeded. Maximum 10 searches per minute.' });
    return reply;
  }
};
