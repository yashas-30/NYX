import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface ProviderLimit {
  /** Max requests per window per IP for this provider. */
  maxRequests: number;
  /** Window in milliseconds. */
  windowMs: number;
}

const DEFAULT_PROVIDER_LIMITS: Record<string, ProviderLimit> = {
  gemini: { maxRequests: 30, windowMs: 60_000 },
  openai: { maxRequests: 30, windowMs: 60_000 },
  anthropic: { maxRequests: 30, windowMs: 60_000 },
  openrouter: { maxRequests: 20, windowMs: 60_000 },
  deepseek: { maxRequests: 20, windowMs: 60_000 },
  ollama: { maxRequests: 60, windowMs: 60_000 }, // local, more permissive
};

/** Per-IP, per-provider request window tracker. */
const windows = new Map<string, Map<string, number[]>>();

function prune(now: number) {
  for (const [ip, providers] of windows) {
    for (const [provider, timestamps] of providers) {
      const limit = DEFAULT_PROVIDER_LIMITS[provider] ?? DEFAULT_PROVIDER_LIMITS.gemini;
      const cutoff = now - limit.windowMs;
      providers.set(provider, timestamps.filter((t) => t > cutoff));
    }
    if (providers.size === 0) windows.delete(ip);
  }
}

/**
 * Fastify preHandler that rate-limits per {IP + provider}.
 *
 * Usage:
 * ```ts
 * app.post('/api/v1/proxy/gemini', { preHandler: [providerRateLimit('gemini')] }, handler);
 * ```
 */
export function providerRateLimit(provider: string) {
  const limit =
    DEFAULT_PROVIDER_LIMITS[provider] ?? { maxRequests: 20, windowMs: 60_000 };

  return (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const now = Date.now();
    prune(now);
    const ip = request.ip;
    if (!windows.has(ip)) windows.set(ip, new Map());
    const ipProviders = windows.get(ip)!;
    if (!ipProviders.has(provider)) ipProviders.set(provider, []);
    const timestamps = ipProviders.get(provider)!;

    // Remove entries outside the window
    const cutoff = now - limit.windowMs;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= limit.maxRequests) {
      reply.status(429).send({
        error: `Rate limit exceeded for provider "${provider}". Max ${limit.maxRequests} requests per ${limit.windowMs / 1000}s.`,
      });
      return;
    }

    timestamps.push(now);
    done();
  };
}
