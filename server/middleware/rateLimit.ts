import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger.ts';

interface RateLimitStore {
  timestamps: number[];
}

const windowMs = 60 * 1000; // 1 minute window
const stores = new Map<string, RateLimitStore>();

const PROVIDER_LIMITS: Record<string, number> = {
  gemini: 60, // 60 RPM
  openrouter: 200, // 200 RPM
  nvidia: 40, // 40 RPM
  opencode: 60, // 60 RPM
  pollinations: 120, // 120 RPM
};

/**
 * MISSING-2: Per-provider rate limiting middleware using sliding window counter.
 */
export function providerRateLimiter(provider: string) {
  const limit = PROVIDER_LIMITS[provider] || 60;

  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization || '';
    const key = `${provider}:${authHeader || req.ip || 'anonymous'}`;

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
      res.setHeader('Retry-After', String(resetTimeSec));
      logger.warn({ key, limit }, `Rate limit exceeded for provider ${provider}`);
      return res.status(429).json({
        error: `Rate limit exceeded for provider ${provider}. Maximum is ${limit} requests per minute.`,
        retryAfterSeconds: resetTimeSec,
      });
    }

    store.timestamps.push(now);
    next();
  };
}
