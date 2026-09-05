// fallow-ignore-file code-duplication
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
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

// ── getComputedStyle color helper for modern oklch support ──
export function getConvertedStyle(elt: Element, pseudoElt?: string | null): CSSStyleDeclaration {
  return window.getComputedStyle(elt, pseudoElt);
}

// ── Global Error Catcher (catches fatal startup errors only) ──
window.addEventListener('error', (e) => {
  const msg = e.message || e.error?.message || '';
  // Ignore cross-origin script errors (e.g. from sandboxed iframes, Monaco CDN workers, etc.)
  if (!msg || msg === 'Script error.' || msg.includes('Script error')) {
    console.warn('[NYX] Ignored non-fatal cross-origin script error:', e);
    return;
  }
  if (
    msg.includes('ResizeObserver loop') ||
    msg.includes('ResizeObserver loop completed with undelivered notifications') ||
    msg.includes('ResizeObserver loop limit exceeded') ||
    msg.includes('Canceled') ||
    msg.includes('Loading chunk')
  ) {
    // Benign browser / bundler notification when layout changes during render/mount — ignore
    return;
  }
  console.error('[NYX] Uncaught error:', e.error || e.message);

  // Don't duplicate crash overlays if one already exists
  if (document.getElementById('nyx-crash-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'nyx-crash-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#111;color:#ef4444;padding:2rem;font-family:monospace;overflow:auto;';
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h2 style="color:#ef4444;margin:0">&#9888; NYX startup crash</h2>
      <button onclick="document.getElementById('nyx-crash-overlay').remove()" style="background:#222;color:#fff;border:1px solid #444;padding:4px 12px;border-radius:4px;cursor:pointer">Dismiss</button>
    </div>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:0.9;background:#1a1a1a;padding:1rem;border-radius:4px">${e.message}\n\n${e.error?.stack || ''}</pre>
  `;
  document.body.appendChild(overlay);
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.message || String(e.reason || '');
  if (!msg || msg === 'Script error.' || msg.includes('Script error')) {
    console.warn('[NYX] Ignored non-fatal promise rejection:', e.reason);
    return;
  }
  if (
    msg.includes('ResizeObserver loop') ||
    msg.includes('ResizeObserver loop completed with undelivered notifications') ||
    msg.includes('ResizeObserver loop limit exceeded') ||
    msg.includes('Canceled') ||
    msg.includes('abort')
  ) {
    // Benign browser notification — ignore
    return;
  }
  console.error('[NYX] Unhandled promise rejection:', e.reason);

  if (document.getElementById('nyx-crash-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'nyx-crash-overlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999999;background:#111;color:#facc15;padding:2rem;font-family:monospace;overflow:auto;';
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <h2 style="color:#facc15;margin:0">&#9888; NYX unhandled rejection</h2>
      <button onclick="document.getElementById('nyx-crash-overlay').remove()" style="background:#222;color:#fff;border:1px solid #444;padding:4px 12px;border-radius:4px;cursor:pointer">Dismiss</button>
    </div>
    <pre style="white-space:pre-wrap;font-size:12px;opacity:0.9;background:#1a1a1a;padding:1rem;border-radius:4px">${msg}\n\n${e.reason?.stack || ''}</pre>
  `;
  document.body.appendChild(overlay);
});

// ── Tauri IPC Bridge ─────────────────────────────
if (typeof window !== 'undefined') {
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
  if (isTauri) {
    document.documentElement.classList.add('is-tauri');
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
      })
      .catch((err) => {
        console.error('[nyxIPC] Failed to load Tauri core APIs:', err);
      });
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
