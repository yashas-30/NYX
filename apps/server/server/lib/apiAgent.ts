import logger from './logger.js';
import { Agent, setGlobalDispatcher } from 'undici';
import dns from 'node:dns';
import PQueue from 'p-queue';

// Request Deduplication Queue
export const requestQueue = new PQueue({ concurrency: 100 });

// ── In-Memory DNS Cache for Zero-Latency Lookups ─────────────────────────────
export const DNS_CACHE = new Map<string, string>();

/**
 * Resolve hostname and cache it.
 * This pre-warms the cache to eliminate subsequent DNS latency.
 */
export async function preWarmDns(hostname: string): Promise<string> {
  if (DNS_CACHE.has(hostname)) return DNS_CACHE.get(hostname)!;
  return new Promise((resolve) => {
    dns.resolve4(hostname, (err, addresses) => {
      if (err || !addresses?.length) {
        // Fallback to resolve6 if v4 failed
        dns.resolve6(hostname, (err6, addresses6) => {
          if (err6 || !addresses6?.length) {
            resolve(hostname);
          } else {
            DNS_CACHE.set(hostname, addresses6[0]);
            resolve(addresses6[0]);
          }
        });
        return;
      }
      DNS_CACHE.set(hostname, addresses[0]);
      resolve(addresses[0]);
    });
  });
}

/**
 * 🚀 High-Performance Global Connection Pool
 * Reuses TCP/TLS connections to upstream LLM providers.
 * Combines with custom DNS caching lookup hook to hit 0ms domain resolution.
 */
export const globalAgent = new Agent({
  keepAliveTimeout: 180_000, // 180s (keep connections alive longer)
  keepAliveMaxTimeout: 240_000, // 240s
  maxCachedSessions: 1024, // More TLS session caching
  connections: 512, // Up to 512 concurrent connections
  pipelining: 1, // Standard for streaming and quick API REST calls
  connect: {
    noDelay: true, // Disable Nagle's algorithm for instant packet transmission
    keepAlive: true, // Persistent TCP
    keepAliveInitialDelay: 5000, // Initial TCP keepalive delay
    timeout: 10_000, // 10s connect timeout
    lookup: (hostname, options, callback) => {
      // Zero-latency DNS pre-lookup interception
      const cached = DNS_CACHE.get(hostname);
      if (cached) {
        if (options.all) {
          callback(null, [{ address: cached, family: 4 }] as any);
        } else {
          callback(null, cached, 4);
        }
        return;
      }
      dns.lookup(hostname, options, callback);
    },
  },
});

// Set as global dispatcher for all native 'fetch' calls in the app (Express & Fastify)
setGlobalDispatcher(globalAgent);

logger.info(
  '[ConnectionPool] Global undici dispatcher initialized with keep-alive & 0ms DNS lookup.'
);

const criticalHosts = ['generativelanguage.googleapis.com'];

criticalHosts.forEach((host) => {
  preWarmDns(host)
    .then((ip) => {
      logger.info(`[DNS Warmup] ${host} pre-cached to ${ip} for ZERO latency connection routing.`);
    })
    .catch(() => {});
});
