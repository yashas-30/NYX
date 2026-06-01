/**
 * @file src/infrastructure/api/usageClient.ts
 * @description Production-grade quota/usage client with caching,
 *   rate limit parsing, batch fetching, and Claude/Kimi-parity features.
 */

import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuotaResult {
  status: 'ok' | 'error' | 'unlimited' | 'unknown';
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;

  // Provider-specific
  totalUSD?: number;
  usedUSD?: number;
  remainingUSD?: number;

  // Rate limiting
  rateLimit?: {
    limit: number;
    remaining: number;
    resetAt: Date;
    retryAfter?: number; // seconds
  };

  // Metadata
  provider: string;
  fetchedAt: number;
  expiresAt: number; // Cache expiry
  error?: string;
}

export interface QuotaCacheEntry {
  data?: QuotaResult;
  promise?: Promise<QuotaResult>;
}

export interface AllQuotasResult {
  quotas: Record<string, QuotaResult>;
  totalProviders: number;
  healthyProviders: number;
  totalUsedUSD: number;
  totalRemainingUSD: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60000; // 1 minute
const REQUEST_TIMEOUT_MS = 10000;

const PROVIDER_DEFAULTS: Record<string, Partial<QuotaResult>> = {
  'nyx-native': { status: 'unlimited' as const, total: Infinity, used: 0, remaining: Infinity },
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const quotaCache = new Map<string, QuotaCacheEntry>();

function getCached(provider: string): QuotaResult | undefined {
  const entry = quotaCache.get(provider);
  if (!entry || !entry.data) return undefined;

  if (Date.now() > entry.data.expiresAt) {
    quotaCache.delete(provider);
    return undefined;
  }

  return entry.data;
}

function setCached(provider: string, data: QuotaResult): void {
  quotaCache.set(provider, {
    data: {
      ...data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    },
  });
}

// ---------------------------------------------------------------------------
// Rate limit parser
// ---------------------------------------------------------------------------

function parseRateLimitHeaders(headers: Headers): QuotaResult['rateLimit'] | undefined {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const retryAfter = headers.get('retry-after');

  if (!limit && !remaining) return undefined;

  return {
    limit: limit ? parseInt(limit, 10) : 0,
    remaining: remaining ? parseInt(remaining, 10) : 0,
    resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : new Date(Date.now() + 60000),
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Provider-specific parsers
// ---------------------------------------------------------------------------

interface ProviderParser {
  parse: (data: any, headers: Headers) => QuotaResult;
}

const PROVIDER_PARSERS: Record<string, ProviderParser> = {
  gemini: {
    parse: (data, headers) => {
      // Gemini has generous free tier, but we can check if key is valid
      const isValid = data.status === 'ok' || data.valid === true;

      if (!isValid) {
        return {
          status: 'error',
          total: 0,
          used: 0,
          remaining: 0,
          percentUsed: 0,
          provider: 'gemini',
          fetchedAt: Date.now(),
          expiresAt: Date.now() + CACHE_TTL_MS,
          error: 'Invalid or expired API key',
        };
      }

      // Free tier: 60 RPM, 1M TPM
      return {
        status: 'ok',
        total: 5000000,
        used: 0,
        remaining: 5000000,
        percentUsed: 0,
        rateLimit: parseRateLimitHeaders(headers),
        provider: 'gemini',
        fetchedAt: Date.now(),
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Core fetch with timeout
// ---------------------------------------------------------------------------

async function fetchQuotaRaw(
  provider: string,
  apiKey?: string,
  signal?: AbortSignal
): Promise<QuotaResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Merge with user signal
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetchWithAuth('/api/models/quota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey: apiKey ? apiKey.trim() : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    const parser = PROVIDER_PARSERS[provider] || PROVIDER_PARSERS.gemini;

    return parser.parse(data, response.headers);
  } catch (error: any) {
    // Return structured error instead of fake quota
    return {
      status: 'error',
      total: 0,
      used: 0,
      remaining: 0,
      percentUsed: 0,
      provider,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 10000, // Short cache for errors
      error: error.message || 'Failed to fetch quota',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch quota for a single provider with caching.
 */
export async function fetchQuota(
  provider: string,
  apiKey?: string,
  options?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<QuotaResult> {
  // Check unlimited providers first
  const defaults = PROVIDER_DEFAULTS[provider];
  if (defaults) {
    return {
      ...defaults,
      remaining:
        defaults.total === Infinity ? Infinity : (defaults.total || 0) - (defaults.used || 0),
      percentUsed: 0,
      provider,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    } as QuotaResult;
  }

  // Check cache
  if (!options?.forceRefresh) {
    const cached = getCached(provider);
    if (cached) return cached;
  }

  // Check for in-flight request (deduplication)
  const existing = quotaCache.get(provider);
  if (existing?.promise) {
    return existing.promise;
  }

  // Fetch fresh
  const promise = fetchQuotaRaw(provider, apiKey, options?.signal).then((result) => {
    setCached(provider, result);
    return result;
  });

  // Store promise for deduplication
  quotaCache.set(provider, { data: getCached(provider), promise });

  // Clean up promise when done
  promise.finally(() => {
    const entry = quotaCache.get(provider);
    if (entry) {
      delete entry.promise;
    }
  });

  return promise;
}

/**
 * Fetch quotas for all providers in parallel.
 */
export async function fetchAllQuotas(
  providers: Array<{ provider: string; apiKey?: string }>,
  options?: { signal?: AbortSignal }
): Promise<AllQuotasResult> {
  const results = await Promise.allSettled(
    providers.map((p) => fetchQuota(p.provider, p.apiKey, { signal: options?.signal }))
  );

  const quotas: Record<string, QuotaResult> = {};
  let totalUsedUSD = 0;
  let totalRemainingUSD = 0;
  let healthyCount = 0;

  results.forEach((result, index) => {
    const provider = providers[index].provider;

    if (result.status === 'fulfilled') {
      quotas[provider] = result.value;
      if (result.value.status === 'ok') {
        healthyCount++;
        if (result.value.usedUSD !== undefined) {
          totalUsedUSD += result.value.usedUSD;
        }
        if (result.value.remainingUSD !== undefined) {
          totalRemainingUSD += result.value.remainingUSD;
        }
      }
    } else {
      quotas[provider] = {
        status: 'error',
        total: 0,
        used: 0,
        remaining: 0,
        percentUsed: 0,
        provider,
        fetchedAt: Date.now(),
        expiresAt: Date.now() + 5000,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });

  return {
    quotas,
    totalProviders: providers.length,
    healthyProviders: healthyCount,
    totalUsedUSD,
    totalRemainingUSD,
  };
}

/**
 * Invalidate cache for a provider.
 */
export function invalidateQuotaCache(provider?: string): void {
  if (provider) {
    quotaCache.delete(provider);
  } else {
    quotaCache.clear();
  }
}

/**
 * Get cache status for debugging.
 */
export function getQuotaCacheStatus(): Array<{
  provider: string;
  ageMs: number;
  expiresInMs: number;
}> {
  return Array.from(quotaCache.entries())
    .filter(([_, entry]) => entry.data)
    .map(([provider, entry]) => ({
      provider,
      ageMs: Date.now() - entry.data!.fetchedAt,
      expiresInMs: entry.data!.expiresAt - Date.now(),
    }));
}

// ---------------------------------------------------------------------------
// Legacy compatibility
// ---------------------------------------------------------------------------

/**
 * @deprecated Use fetchQuota instead for better type safety
 */
export async function fetchQuotaLegacy(
  provider: string,
  apiKey?: string
): Promise<{ total: number; used: number; totalUSD?: number; usedUSD?: number }> {
  const result = await fetchQuota(provider, apiKey);
  return {
    total: result.total === Infinity ? 999999999 : result.total,
    used: result.used,
    totalUSD: result.totalUSD,
    usedUSD: result.usedUSD,
  };
}
