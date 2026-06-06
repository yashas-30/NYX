// fallow-ignore-file code-duplication
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { ErrorBoundary } from './core/components/ErrorBoundary';
import './i18n';
import './index.css';
import * as Sentry from '@sentry/react';

// Expose env to shared packages to avoid compiler warnings about import.meta
if (typeof globalThis !== 'undefined') {
  (globalThis as any).importMetaEnv = (import.meta as any).env;
}

if ((import.meta as any).env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: (import.meta as any).env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Tracing
    tracesSampleRate: 1.0,
    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// ── Modern CSS Color Space Polyfill for Framer Motion ──
function oklabToRgb(L: number, a: number, b: number, alpha: number = 1): string {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_ = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const f = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const R = Math.max(0, Math.min(255, Math.round(f(r) * 255)));
  const G = Math.max(0, Math.min(255, Math.round(f(g) * 255)));
  const B = Math.max(0, Math.min(255, Math.round(f(b_) * 255)));

  return `rgba(${R}, ${G}, ${B}, ${alpha})`;
}

function oklchToRgb(L: number, C: number, H: number, alpha: number = 1): string {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  return oklabToRgb(L, a, b, alpha);
}

function convertModernColor(colorStr: any): any {
  if (typeof colorStr !== 'string') return colorStr;
  const trimmed = colorStr.trim();

  const parseVal = (str: string) => {
    if (str.endsWith('%')) {
      return parseFloat(str) / 100;
    }
    return parseFloat(str);
  };

  if (trimmed.startsWith('oklab(')) {
    const match = trimmed.match(/oklab\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split('/');
      const coords = parts[0].trim().split(/\s+/).map(parseVal);
      const alpha = parts[1] ? parseVal(parts[1].trim()) : 1;
      if (coords.length === 3 && !coords.some(isNaN)) {
        return oklabToRgb(coords[0], coords[1], coords[2], alpha);
      }
    }
  }

  if (trimmed.startsWith('oklch(')) {
    const match = trimmed.match(/oklch\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split('/');
      const coords = parts[0].trim().split(/\s+/).map(parseVal);
      const alpha = parts[1] ? parseVal(parts[1].trim()) : 1;
      if (coords.length === 3 && !coords.some(isNaN)) {
        return oklchToRgb(coords[0], coords[1], coords[2], alpha);
      }
    }
  }

  return colorStr;
}

if (typeof window !== 'undefined') {
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = function (
    elt: Element,
    pseudoElt?: string | null
  ): CSSStyleDeclaration {
    const style = originalGetComputedStyle(elt, pseudoElt);
    return new Proxy(style, {
      get(target: any, prop: string | symbol) {
        const val = target[prop];
        if (typeof val === 'function') {
          if (prop === 'getPropertyValue') {
            return function (propertyName: string) {
              const rawVal = target.getPropertyValue(propertyName);
              return convertModernColor(rawVal);
            };
          }
          return val.bind(target);
        }
        if (typeof prop === 'string') {
          const colorProps = new Set([
            'backgroundColor',
            'color',
            'borderColor',
            'borderTopColor',
            'borderBottomColor',
            'borderLeftColor',
            'borderRightColor',
            'outlineColor',
            'textDecorationColor',
          ]);
          if (colorProps.has(prop)) {
            return convertModernColor(val);
          }
        }
        return val;
      },
    });
  };
}

// ── Global Error Catcher (shows errors in Tauri window instead of blank screen) ──
window.addEventListener('error', (e) => {
  console.error('[NYX] Uncaught error:', e.error || e.message);
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#111;color:#ef4444;padding:2rem;font-family:monospace;overflow:auto;';
  overlay.innerHTML = `
    <h2 style="color:#ef4444;margin-bottom:1rem">&#9888; NYX startup crash</h2>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:0.9;background:#1a1a1a;padding:1rem;border-radius:4px">${e.message}\n\n${e.error?.stack || ''}</pre>
  `;
  document.body.appendChild(overlay);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[NYX] Unhandled promise rejection:', e.reason);
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#111;color:#facc15;padding:2rem;font-family:monospace;overflow:auto;';
  overlay.innerHTML = `
    <h2 style="color:#facc15;margin-bottom:1rem">&#9888; NYX unhandled rejection</h2>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:0.9;background:#1a1a1a;padding:1rem;border-radius:4px">${e.reason?.message || e.reason || 'Unknown error'}\n\n${e.reason?.stack || ''}</pre>
  `;
  document.body.appendChild(overlay);
});

// ── Transparent Global Session Fetch Interceptor ─────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlightTokenPromise: Promise<string> | null = null;

// ── Tauri IPC Bridge & Dynamic Port Resolution ─────────────────────────────
let backendBaseUrl = '';

if (typeof window !== 'undefined') {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
  if (isTauri) {
    import('@tauri-apps/api/core')
      .then(({ invoke }) => {
        (window as any).nyxIPC = {
          invoke: async (cmd: string, args?: any) => {
            try {
              return await invoke(cmd, args);
            } catch (e: any) {
              console.error(`[nyxIPC] Invoke error for ${cmd}:`, e);
              throw e;
            }
          },
          showOpenDirectory: async () => {
            try {
              const res = await invoke<any>('dialog_open_directory');
              return res && res.success ? res.data : null;
            } catch (e: any) {
              console.error('[nyxIPC] showOpenDirectory error:', e);
              return null;
            }
          },
        };
        console.log('[nyxIPC] Initialized Tauri bridge on window.nyxIPC');
      })
      .catch((err) => {
        console.error('[nyxIPC] Failed to load Tauri core APIs:', err);
      });
  }
}

async function initBackendUrl() {
  const isTauri =
    typeof window !== 'undefined' &&
    (!!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__);
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<any>('server_get_ports');
      if (res && res.success && res.data && res.data.express_port) {
        backendBaseUrl = `http://127.0.0.1:${res.data.express_port}`;
        console.log(`[Tauri] Dynamically resolved Express backend URL: ${backendBaseUrl}`);
        return;
      }
    } catch (e: any) {
      console.warn('[Tauri] Failed to query server ports via IPC:', e);
    }
  }
  backendBaseUrl = '';
}

async function getOrFetchSessionToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 10000) {
    return cachedToken;
  }
  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const res = await fetch('/api/v1/auth/session');
      if (!res.ok) throw new Error(`Auth status ${res.status}`);
      const data = await res.json();
      cachedToken = data.token;
      tokenExpiresAt = data.expiresAt || Date.now() + 5 * 60 * 1000;
      return data.token || '';
    } catch (err: any) {
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
  let urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  if (urlStr.startsWith('/api/v1/') && backendBaseUrl) {
    urlStr = `${backendBaseUrl}${urlStr}`;
    input = urlStr;
  }

  const isApiCall =
    urlStr.includes('/api/v1/') &&
    !urlStr.includes('/api/v1/auth/session') &&
    !urlStr.includes('/api/v1/vault/token') &&
    !urlStr.includes('/api/v1/health') &&
    !urlStr.includes('/api/v1/admin/logs');

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
    } catch (err: any) {
      console.warn('[Fetch Interceptor] Error applying auth header:', err);
    }
  }

  return originalFetch.call(this, input, init);
};

function RootContainer() {
  const [isBackendReady, setIsBackendReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkBackend = async () => {
      await initBackendUrl();
      while (mounted) {
        try {
          // Always use /api/v1/ — backendBaseUrl is just the host:port when Tauri resolves it
          const base = backendBaseUrl || '';
          const url = `${base}/api/v1/health`;
          const res = await originalFetch(url, { headers: { Accept: 'application/json' } });
          // Any real HTTP response (including 500) means the backend is alive and TCP is up
          if (res.status < 600) {
            if (mounted) setIsBackendReady(true);
            return;
          }
        } catch {
          // Backend not up yet — keep waiting
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    checkBackend();
    return () => {
      mounted = false;
    };
  }, []);

  if (!isBackendReady) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          color: '#a1a1aa',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
        >
          <div
            style={{
              width: '2rem',
              height: '2rem',
              border: '3px solid #27272a',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          ></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div>Starting NYX backend...</div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootContainer />
  </StrictMode>
);
