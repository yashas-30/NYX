/**
 * @file src/infrastructure/api/authFetch.ts
 * @description Authenticated fetch client that coordinates vault session token retrieval and refresh.
 */

let sessionToken: string | null = null;
let tokenExpiresAt: number = 0;

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
  if (sessionToken && Date.now() < tokenExpiresAt - 10000) {
    return sessionToken;
  }
  const res = await fetch('/api/vault/token');
  const data = await res.json();
  sessionToken = data.token;
  tokenExpiresAt = data.expiresAt || (Date.now() + 5 * 60 * 1000);
  return sessionToken || '';
}

export async function fetchWithAuth(url: string, init?: RequestInit, isStream = false): Promise<Response> {
  const token = await getOrFetchSessionToken(isStream);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('x-nyx-session-token', token);
  const response = await fetch(url, {
    ...init,
    headers
  });

  if (response.status === 401) {
    // Clear cached session token to force a refresh on the next request
    sessionToken = null;
    tokenExpiresAt = 0;
  }

  return response;
}
