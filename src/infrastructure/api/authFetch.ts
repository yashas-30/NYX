/**
 * @file src/infrastructure/api/authFetch.ts
 * @description Authenticated fetch client that coordinates vault session token retrieval and refresh.
 */

import { context, propagation } from '@opentelemetry/api';
import { Mutex } from 'async-mutex';

let sessionToken: string | null = null;
let tokenExpiresAt: number = 0;
const tokenMutex = new Mutex();

export function setSessionToken(token: string | null): void {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

async function getOrFetchSessionToken(isStream = false): Promise<string> {
  if (isStream) {
    const res = await fetch('/api/vault/token?stream=true');
    const data = await res.json();
    return data.token;
  }

  return tokenMutex.runExclusive(async () => {
    if (sessionToken && Date.now() < tokenExpiresAt - 10000) {
      return sessionToken;
    }
    const res = await fetch('/api/vault/token');
    const data = await res.json();
    sessionToken = data.token;
    tokenExpiresAt = data.expiresAt || Date.now() + 5 * 60 * 1000;
    return sessionToken || '';
  });
}

export async function fetchWithAuth(
  url: string,
  init?: RequestInit,
  isStream = false
): Promise<Response> {
  const token = await getOrFetchSessionToken(isStream);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('x-nyx-session-token', token);

  // Inject OpenTelemetry context for tracing propagation
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  for (const [key, value] of Object.entries(carrier)) {
    headers.set(key, value);
  }

  // Rewrite streaming requests to target Fastify on port 3001 directly
  let targetUrl = url;
  const streamMatch = url.match(
    /^\/api\/(gemini|openrouter|nvidia|opencode|pollinations)\/stream$/
  );
  if (streamMatch) {
    targetUrl = `http://127.0.0.1:3001/api/stream/${streamMatch[1]}`;
  }

  const response = await fetch(targetUrl, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    // Clear cached session token to force a refresh on the next request
    sessionToken = null;
    tokenExpiresAt = 0;

    // Auto-retry exactly once with a fresh token
    console.log('[AuthFetch] Session token expired/invalid. Auto-refreshing and retrying once...');
    const newToken = await getOrFetchSessionToken(isStream);
    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('Authorization', `Bearer ${newToken}`);
    retryHeaders.set('x-nyx-session-token', newToken);

    // Reinject traces for the retry request
    const retryCarrier: Record<string, string> = {};
    propagation.inject(context.active(), retryCarrier);
    for (const [key, value] of Object.entries(retryCarrier)) {
      retryHeaders.set(key, value);
    }

    return fetch(targetUrl, {
      ...init,
      headers: retryHeaders,
    });
  }

  return response;
}
