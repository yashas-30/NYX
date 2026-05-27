import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { ThemeProvider } from './context/ThemeContext.tsx';
import { TokenUsageProvider } from './context/TokenUsageContext.tsx';

// ── Transparent Global Session Fetch Interceptor ─────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise: Promise<string> | null = null;

async function getOrFetchSessionToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 10000) {
    return cachedToken;
  }
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) throw new Error(`Auth status ${res.status}`);
      const data = await res.json();
      cachedToken = data.token;
      tokenExpiresAt = data.expiresAt || (Date.now() + 5 * 60 * 1000);
      return data.token || '';
    } catch (err) {
      console.error('[Session Interceptor] Failed to fetch session token:', err);
      return '';
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}

const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
  const isApiCall = urlStr.includes('/api/') && 
                    !urlStr.includes('/api/auth/session') && 
                    !urlStr.includes('/api/vault/token') && 
                    !urlStr.includes('/api/health') && 
                    !urlStr.includes('/api/admin/logs');

  if (isApiCall) {
    try {
      const token = await getOrFetchSessionToken();
      if (token) {
        init = init || {};
        const headers = new Headers(init.headers);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (!headers.has('X-NYX-Session-Token')) {
          headers.set('X-NYX-Session-Token', token);
        }
        init.headers = headers;
      }
    } catch (err) {
      console.warn('[Fetch Interceptor] Error applying auth header:', err);
    }
  }

  return originalFetch.call(this, input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <TokenUsageProvider>
        <App />

      </TokenUsageProvider>
    </ThemeProvider>
  </StrictMode>,
);
