/**
 * @file src/infrastructure/api/authFetch.ts
 * @description Production-grade authenticated fetch client with circuit breaking,
 *   request deduplication, timeout handling, and Claude/Kimi-parity reliability.
 */

import { context, propagation, trace } from '@opentelemetry/api';
import { Mutex } from 'async-mutex';

// Tauri imports (conditionally used)
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
let backendPort: number | null = null;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30000;
const STREAM_TIMEOUT_MS = 120000;
const TOKEN_REFRESH_BUFFER_MS = 10000;
const TOKEN_TTL_MS = 5 * 60 * 1000;
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_RESET_MS = 30000;
const DEDUPE_WINDOW_MS = 100;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let sessionToken: string | null = null;
let tokenExpiresAt: number = 0;
const tokenMutex = new Mutex();
let isOfflineMode: boolean = false;

export function setOfflineMode(offline: boolean): void {
  isOfflineMode = offline;
}

// Circuit breaker for stream backend
interface CircuitState {
  failures: number;
  lastFailure: number;
  open: boolean;
}
const circuitStates = new Map<string, CircuitState>();

// Request deduplication
interface PendingDedupe {
  resolve: (res: Response) => void;
  reject: (err: any) => void;
}
const inflightResolvers = new Map<string, PendingDedupe[]>();
const inflightRequests = new Set<string>();
let dedupeTimer: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

function isTokenValid(): boolean {
  return !!sessionToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS;
}

async function fetchFreshToken(isStream = false, attempt = 0): Promise<{ token: string; expiresAt: number }> {
  // Offline bypass logic: Check explicit offline flag OR if ollama is selected
  let isLocalProviderSelected = false;
  try {
    const { useNyxStore } = require('../../shared/store/useNyxStore');
    const storeState = useNyxStore.getState();
    const provider = storeState.settings?.provider || 'ollama';
    isLocalProviderSelected = provider === 'ollama' || provider === 'lmstudio';
  } catch (e) {
    // Ignore store import errors if it hasn't initialized
  }

  if (isOfflineMode || isLocalProviderSelected) {
    return { token: 'offline_token_bypass', expiresAt: Date.now() + 86400000 };
  }

  if (isTauri && backendPort === null) {
    try {
      const res: any = await invoke('server_get_ports');
      if (res.success && res.data) {
        backendPort = res.data.express_port || 3010;
      } else {
        backendPort = 3010;
      }
    } catch (e) {
      backendPort = 3010;
    }
  }

  // If endpoint is relative, resolve it via Tauri invoke (dynamic)
  const basePath = isStream ? '/api/v1/vault/token?stream=true' : '/api/v1/vault/token';
  const endpoint = isTauri && backendPort 
    ? `http://127.0.0.1:${backendPort}${basePath}`
    : basePath;

  const fetchFn = isTauri ? tauriFetch : window.fetch;

  try {
    const res = await fetchFn(endpoint, {
      method: 'GET',
      headers: {
        'x-nyx-client': 'web-v1',
      },
      signal: createTimeoutSignal(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      
      // Only retry transient server errors (starting up); non-retriable otherwise
      if ((res.status === 503 || res.status === 502 || res.status === 504) && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
        return fetchFreshToken(isStream, attempt + 1);
      }
      
      throw new Error(`Token refresh failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!data.token) {
      throw new Error('Token refresh returned empty token');
    }

    return {
      token: data.token,
      expiresAt: data.expiresAt || Date.now() + TOKEN_TTL_MS,
    };
  } catch (err: any) {
    const msg = err?.message || String(err) || '';
    // Never retry permanent failures: scope errors, auth rejections, etc.
    const isPermanent =
      msg.includes('not allowed on the configured scope') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('forbidden');
    if (!isPermanent && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      return fetchFreshToken(isStream, attempt + 1);
    }
    
    throw new Error(`Token refresh failed: ${msg || 'Unknown error'}`);
  }
}

export async function getOrFetchSessionToken(isStream = false): Promise<string> {
  // Fast path: valid cached token
  if (!isStream && isTokenValid()) {
    return sessionToken!;
  }

  // Slow path: acquire mutex and refresh
  return tokenMutex.runExclusive(async () => {
    // Double-check after acquiring lock
    if (!isStream && isTokenValid()) {
      return sessionToken!;
    }

    const fresh = await fetchFreshToken(isStream);
    sessionToken = fresh.token;
    tokenExpiresAt = fresh.expiresAt;
    return fresh.token;
  });
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

function isCircuitOpen(url: string): boolean {
  const state = circuitStates.get(url);
  if (!state || !state.open) return false;

  if (Date.now() - state.lastFailure > CIRCUIT_RESET_MS) {
    state.open = false;
    state.failures = 0;
    return false;
  }
  return true;
}

function recordSuccess(url: string): void {
  circuitStates.delete(url);
}

function recordFailure(url: string): void {
  const state = circuitStates.get(url) || { failures: 0, lastFailure: 0, open: false };
  state.failures++;
  state.lastFailure = Date.now();
  if (state.failures >= CIRCUIT_THRESHOLD) {
    state.open = true;
    console.warn(`[AuthFetch] Circuit breaker OPEN for ${url}`);
  }
  circuitStates.set(url, state);
}

// ---------------------------------------------------------------------------
// Request deduplication
// ---------------------------------------------------------------------------

function getDedupeKey(url: string, init?: RequestInit): string {
  return `${init?.method || 'GET'}:${url}:${JSON.stringify(init?.body || '')}`;
}

function cleanupDedupe(): void {
  if (dedupeTimer) clearTimeout(dedupeTimer);
  dedupeTimer = setTimeout(() => {
    inflightRequests.clear();
  }, DEDUPE_WINDOW_MS);
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function createTimeoutSignal(ms: number): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  // Clean up timer if signal is already aborted externally
  ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return ctrl.signal;
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

async function resolveTargetUrl(url: string): Promise<string> {
  if (!isTauri || url.startsWith('http')) return url;
  
  if (backendPort === null) {
    try {
      const res: any = await invoke('server_get_ports');
      if (res.success && res.data) {
        backendPort = res.data.express_port || 3010;
      } else {
        backendPort = 3010;
      }
    } catch (e) {
      backendPort = 3010;
    }
  }
  
  return `http://127.0.0.1:${backendPort}${url.startsWith('/') ? '' : '/'}${url}`;
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

function injectTracing(headers: Headers): void {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  for (const [key, value] of Object.entries(carrier)) {
    headers.set(key, value);
  }
}

function logRequest(
  method: string,
  url: string,
  status: number,
  latencyMs: number,
  error?: string
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute('http.status_code', status);
    span.setAttribute('http.latency_ms', latencyMs);
    if (error) span.setAttribute('error.message', error);
  }

  // Downgrade expected polling errors to debug so they don't spam the console
  const isExpectedPollingError = 
    (url.includes('local-models/ollama/models') && status === 500) ||
    (url.includes('models/list') && status === 409) ||
    (url.includes('local-models/ollama/models') && status === 503) ||
    status === 404; // TEMPORARY BYPASS: Silence mock-backend 404s

  if ((error || status >= 400) && !isExpectedPollingError) {
    console.error(
      `[AuthFetch] ${method} ${url} → ${status} (${latencyMs}ms)${error ? ` | ${error}` : ''}`
    );
  } else {
    // Suppressed: console.debug(`[AuthFetch] ${method} ${url} → ${status} (${latencyMs}ms)${error ? ` | ${error}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Main fetch function
// ---------------------------------------------------------------------------

export async function fetchWithAuth(
  url: string,
  init?: RequestInit,
  isStream = false
): Promise<Response> {
  const targetUrl = await resolveTargetUrl(url);
  const method = init?.method || 'GET';

  // Circuit breaker check for stream endpoints
  if (isStream && isCircuitOpen(targetUrl)) {
    throw new Error(`Circuit breaker open for ${targetUrl}. Try again later.`);
  }

  // Request deduplication for non-mutating requests
  const dedupeKey = getDedupeKey(targetUrl, init);
  if (method === 'GET' && inflightRequests.has(dedupeKey)) {
    return new Promise<Response>((resolve, reject) => {
      if (!inflightResolvers.has(dedupeKey)) {
        inflightResolvers.set(dedupeKey, []);
      }
      inflightResolvers.get(dedupeKey)!.push({ resolve, reject });
    });
  }

  const startTime = performance.now();
  const timeoutMs = isStream ? STREAM_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  // Create timeout signal and merge with user-provided signal
  const timeoutSignal = createTimeoutSignal(timeoutMs);
  const signal = init?.signal ? mergeSignals(init.signal, timeoutSignal) : timeoutSignal;

  // Build headers
  const token = await getOrFetchSessionToken(isStream);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('x-nyx-session-token', token);
  headers.set('Accept', 'application/json');

  // Connection reuse hint
  if (!headers.has('Connection')) {
    headers.set('Connection', 'keep-alive');
  }

  injectTracing(headers);

  const fetchFn = isTauri ? tauriFetch : window.fetch;

  const requestPromise = fetchFn(targetUrl, {
    ...init,
    headers,
    signal,
  })
    .then(async (response) => {
      // Delete immediately to prevent microtask-level key re-use on resolved response stream
      inflightRequests.delete(dedupeKey);

      const latency = Math.round(performance.now() - startTime);

      // Handle 401 with synchronized retry
      if (response.status === 401) {
        logRequest(method, targetUrl, 401, latency, 'Token expired');

        const originalToken = token;
        // Only one retry attempt, with fresh token under mutex
        const retryToken = await tokenMutex.runExclusive(async () => {
          // Check if another request already refreshed the token while we were waiting for the lock
          if (sessionToken && sessionToken !== originalToken && isTokenValid()) {
            return sessionToken;
          }
          // Force refresh
          sessionToken = null;
          tokenExpiresAt = 0;
          const fresh = await fetchFreshToken(isStream);
          sessionToken = fresh.token;
          tokenExpiresAt = fresh.expiresAt;
          return fresh.token;
        });

        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set('Authorization', `Bearer ${retryToken}`);
        retryHeaders.set('x-nyx-session-token', retryToken);
        retryHeaders.set('Accept', 'application/json');
        injectTracing(retryHeaders);

        const retryResponse = await fetchFn(targetUrl, {
          ...init,
          headers: retryHeaders,
          signal,
        });

        const retryLatency = Math.round(performance.now() - startTime);
        logRequest(method, targetUrl, retryResponse.status, retryLatency);

        if (retryResponse.ok) {
          recordSuccess(targetUrl);
        } else if (retryResponse.status === 401) {
          recordFailure(targetUrl);
          throw new Error('Authentication failed after token refresh. Please log in again.');
        }

        // Resolve all pending resolvers with clones of the retry response
        const resolvers = inflightResolvers.get(dedupeKey) || [];
        inflightResolvers.delete(dedupeKey);
        inflightRequests.delete(dedupeKey);
        for (const r of resolvers) {
          r.resolve(retryResponse.clone());
        }

        return retryResponse;
      }

      logRequest(method, targetUrl, response.status, latency);

      if (response.ok) {
        recordSuccess(targetUrl);
      } else if (response.status >= 500) {
        recordFailure(targetUrl);
      }

      // Resolve all pending resolvers with clones of the original response
      const resolvers = inflightResolvers.get(dedupeKey) || [];
      inflightResolvers.delete(dedupeKey);
      inflightRequests.delete(dedupeKey);
      for (const r of resolvers) {
        r.resolve(response.clone());
      }

      return response;
    })
    .catch((error) => {
      inflightRequests.delete(dedupeKey);
      const latency = Math.round(performance.now() - startTime);

      const resolvers = inflightResolvers.get(dedupeKey) || [];
      inflightResolvers.delete(dedupeKey);
      inflightRequests.delete(dedupeKey);
      for (const r of resolvers) {
        r.reject(error);
      }

      if (error.name === 'AbortError') {
        if (signal.aborted && !init?.signal?.aborted) {
          // Our timeout fired, not user abort
          logRequest(method, targetUrl, 0, latency, `Request timeout after ${timeoutMs}ms`);
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        logRequest(method, targetUrl, 0, latency, 'Aborted by user');
        throw error;
      }

      logRequest(method, targetUrl, 0, latency, error.message);
      recordFailure(targetUrl);
      throw error;
    })
    .finally(() => {
      inflightRequests.delete(dedupeKey);
    });

  // Track inflight for deduplication
  if (method === 'GET') {
    inflightRequests.add(dedupeKey);
    cleanupDedupe();
  }

  return requestPromise.then((res) => res.clone());
}

// ---------------------------------------------------------------------------
// Health check for stream backend
// ---------------------------------------------------------------------------

export async function checkBackendHealth(url?: string): Promise<boolean> {
  // Health check goes through the Express API (proxied by Vite in dev)
  const target = url || '/api/v1/health';
  try {
    const res = await fetch(target, { signal: createTimeoutSignal(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cleanup (call on app shutdown)
// ---------------------------------------------------------------------------

export function cleanupAuthFetch(): void {
  if (dedupeTimer) clearTimeout(dedupeTimer);
  inflightRequests.clear();
  inflightResolvers.clear();
  circuitStates.clear();
}
