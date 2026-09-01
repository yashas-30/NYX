/**
 * Universal Live Preview Execution Engine
 *
 * Provides a high-fidelity, native runtime environment for all previewable code:
 * - In-memory Storage polyfills (eliminates SecurityError in sandboxed iframes)
 * - Smart dynamic dependency detection (Tailwind, Lucide, FontAwesome, Chart.js, D3, Three.js, GSAP, Math.js, React/Babel)
 * - Top-of-head injection so user custom styles & scripts always override CDN resets
 * - Native global script execution (no Function wrapper / scope trapping)
 * - Non-intrusive runtime error capturing
 */

const STORAGE_POLYFILL = `
<script>
  (function() {
    function createMemStorage() {
      var store = {};
      return {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function(k, v) { store[k] = String(v); },
        removeItem: function(k) { delete store[k]; },
        clear: function() { store = {}; },
        key: function(i) { return Object.keys(store)[i] || null; },
        get length() { return Object.keys(store).length; }
      };
    }
    try {
      var testKey = '__nyx_storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
    } catch (e) {
      var memLocal = createMemStorage();
      try {
        Object.defineProperty(window, 'localStorage', { value: memLocal, writable: true, configurable: true });
      } catch (err) {
        window.localStorage = memLocal;
      }
    }
    try {
      var testSKey = '__nyx_session_test__';
      window.sessionStorage.setItem(testSKey, testSKey);
      window.sessionStorage.removeItem(testSKey);
    } catch (e) {
      var memSession = createMemStorage();
      try {
        Object.defineProperty(window, 'sessionStorage', { value: memSession, writable: true, configurable: true });
      } catch (err) {
        window.sessionStorage = memSession;
      }
    }

    // AudioContext Auto-Unlock, Resume & Safe Creation
    try {
      var RealAudioContext = window.AudioContext || window.webkitAudioContext;
      if (RealAudioContext) {
        var SafeAudioContext = function(options) {
          var ctx;
          try {
            ctx = options !== undefined ? new RealAudioContext(options) : new RealAudioContext();
          } catch(e) {
            ctx = new RealAudioContext();
          }
          window.__nyx_audio_ctx = ctx;
          var resumeCtx = function() {
            if (ctx && ctx.state === 'suspended') {
              ctx.resume().catch(function() {});
            }
          };
          window.addEventListener('click', resumeCtx, { passive: true });
          window.addEventListener('keydown', resumeCtx, { passive: true });
          window.addEventListener('touchstart', resumeCtx, { passive: true });
          window.addEventListener('mousedown', resumeCtx, { passive: true });
          return ctx;
        };
        SafeAudioContext.prototype = RealAudioContext.prototype;
        window.AudioContext = SafeAudioContext;
        window.webkitAudioContext = SafeAudioContext;
      }
    } catch (aErr) {}

    // Lucide icon initializer
    function initLucideIcons() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) {}
      }
    }
    window.addEventListener('DOMContentLoaded', initLucideIcons);
    window.addEventListener('load', initLucideIcons);
  })();
</script>
`;

/**
 * Builds the required CDN script & stylesheet tags based on code contents.
 * Only loads libraries that are actually referenced in the code to keep load times near-instant.
 */
function getSmartDependencies(code: string): string {
  const deps: string[] = [];

  // Storage polyfill (always active to prevent sandboxed iframe crashes)
  deps.push(STORAGE_POLYFILL);

  // Fonts
  deps.push(`
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Geist:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  `);

  // Tailwind CSS — only if tailwind classes or directives are present
  const hasTailwind =
    /class=["'][^"']*(?:flex|grid|p-\d|px-|py-|m-\d|text-|bg-|rounded|border-|shadow|space-|justify-|items-|w-|h-|max-w|min-h|gap-)[^"']*["']/i.test(
      code
    ) ||
    code.includes('tailwind') ||
    code.includes('@apply');

  if (hasTailwind && !code.includes('cdn.tailwindcss.com')) {
    deps.push(`
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    if (window.tailwind) {
      tailwind.config = {
        darkMode: 'class',
        theme: {
          extend: {
            colors: {
              brand: { 500: '#ffffff', 600: '#e4e4e7' }
            }
          }
        }
      };
    }
  </script>
    `);
  }

  // Lucide Icons
  if (
    (code.includes('lucide') || code.includes('data-lucide')) &&
    !code.includes('unpkg.com/lucide')
  ) {
    deps.push('<script src="https://unpkg.com/lucide@latest"></script>');
  }

  // FontAwesome
  if (
    (code.includes('fa-') || code.includes('fas ') || code.includes('fab ')) &&
    !code.includes('font-awesome')
  ) {
    deps.push(
      '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">'
    );
  }

  // Chart.js
  if (
    (code.includes('new Chart') || code.includes('Chart(') || code.includes('chart.js')) &&
    !code.includes('cdn.jsdelivr.net/npm/chart.js')
  ) {
    deps.push('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>');
  }

  // D3.js
  if (code.includes('d3.') && !code.includes('cdn.jsdelivr.net/npm/d3')) {
    deps.push('<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>');
  }

  // Import Map for modern ES module packages
  deps.push(`
  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
      "three/examples/jsm/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
      "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js",
      "gsap/": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/",
      "canvas-confetti": "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm",
      "howler": "https://cdn.jsdelivr.net/npm/howler@2.2.4/+esm",
      "animejs": "https://cdn.jsdelivr.net/npm/animejs@3.2.2/+esm",
      "lucide": "https://cdn.jsdelivr.net/npm/lucide@latest/+esm",
      "react": "https://esm.sh/react@18.2.0",
      "react-dom": "https://esm.sh/react-dom@18.2.0",
      "react-dom/client": "https://esm.sh/react-dom@18.2.0/client"
    }
  }
  </script>
  `);

  // Three.js
  if (
    (code.includes('THREE.') || code.includes('three') || code.includes('OrbitControls')) &&
    !code.includes('three.min.js')
  ) {
    deps.push(
      '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>'
    );
    deps.push(
      '<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"></script>'
    );
  }

  // GSAP
  if (code.includes('gsap.') && !code.includes('gsap.min.js')) {
    deps.push('<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>');
  }

  // Canvas-Confetti
  if (code.includes('confetti(') && !code.includes('confetti.browser.min.js')) {
    deps.push(
      '<script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js"></script>'
    );
  }

  // Howler.js (Audio Engine)
  if (code.includes('Howl(') || (code.includes('Howler.') && !code.includes('howler.min.js'))) {
    deps.push(
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>'
    );
  }

  // Matter.js (2D Physics Engine)
  if (code.includes('Matter.') && !code.includes('matter.min.js')) {
    deps.push(
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"></script>'
    );
  }

  // Anime.js
  if (code.includes('anime(') && !code.includes('anime.min.js')) {
    deps.push(
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>'
    );
  }

  // Math.js
  if (code.includes('math.') && !code.includes('math.js')) {
    deps.push(
      '<script src="https://cdn.jsdelivr.net/npm/mathjs@12.4.0/lib/browser/math.js"></script>'
    );
  }

  // React & Babel Standalone (for JSX in HTML)
  if (
    (code.includes('React.') ||
      code.includes('ReactDOM.') ||
      code.includes('type="text/babel"') ||
      code.includes('useState(') ||
      code.includes('useEffect(')) &&
    !code.includes('react.production.min.js')
  ) {
    deps.push(`
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    `);
  }

  return deps.join('\n');
}

/**
 * Generates an interactive execution environment for standalone JavaScript/TypeScript scripts
 */
function buildJsExecutionHtml(code: string, language: string): string {
  const cleanCode = code
    .replace(/^```(?:javascript|js|typescript|ts|node)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  return `<!DOCTYPE html>
<html class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${STORAGE_POLYFILL}
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      background: #09090b;
      color: #f4f4f5;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .console-output {
      background: #000000;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 12px;
      min-height: 200px;
      max-height: 380px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .log-entry { margin: 4px 0; display: flex; gap: 8px; }
    .log-info { color: #e4e4e7; }
    .log-warn { color: #facc15; }
    .log-error { color: #f87171; }
    .btn-rerun {
      background: #27272a;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
    }
    .btn-rerun:hover { background: #3f3f46; }
  </style>
</head>
<body>
  <div class="console-header">
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#22c55e;"></span>
      <span style="font-weight:600; font-size:11px; text-transform:uppercase; color:#a1a1aa;">
        ${language.toUpperCase()} EXECUTION CONSOLE
      </span>
    </div>
    <button class="btn-rerun" onclick="runScript()">Run Again</button>
  </div>
  <div class="console-output" id="output"></div>
  <div id="app-root"></div>

  <script>
    var outputEl = document.getElementById('output');

    function appendLog(type, args) {
      var entry = document.createElement('div');
      entry.className = 'log-entry ' + (type === 'error' ? 'log-error' : type === 'warn' ? 'log-warn' : 'log-info');
      var prefix = type === 'error' ? '✖ ' : type === 'warn' ? '▲ ' : '• ';
      var text = Array.prototype.slice.call(args).map(function(arg) {
        if (typeof arg === 'object') {
          try { return JSON.stringify(arg, null, 2); } catch(e) { return String(arg); }
        }
        return String(arg);
      }).join(' ');
      entry.textContent = prefix + text;
      outputEl.appendChild(entry);
      outputEl.scrollTop = outputEl.scrollHeight;
    }

    var originalLog = console.log;
    var originalWarn = console.warn;
    var originalError = console.error;

    console.log = function() { appendLog('info', arguments); originalLog.apply(console, arguments); };
    console.warn = function() { appendLog('warn', arguments); originalWarn.apply(console, arguments); };
    console.error = function() { appendLog('error', arguments); originalError.apply(console, arguments); };

    window.onerror = function(msg, url, line) {
      appendLog('error', [msg + (line ? ' (line ' + line + ')' : '')]);
    };

    function runScript() {
      outputEl.innerHTML = '';
      try {
        var rawCode = ${JSON.stringify(cleanCode)};
        var transformed = rawCode;
        if (typeof Babel !== 'undefined') {
          try {
            transformed = Babel.transform(rawCode, { presets: ['typescript'] }).code;
          } catch (bErr) {}
        }
        var script = document.createElement('script');
        script.text = transformed;
        document.body.appendChild(script);
      } catch (err) {
        appendLog('error', [err.name + ': ' + err.message]);
      }
    }

    window.addEventListener('DOMContentLoaded', runScript);
  </script>
</body>
</html>`;
}

/**
 * Builds the complete live preview HTML document with all libraries, styles, and error recovery.
 */
export function buildLivePreviewSrcDoc(rawCode: string, language = 'html'): string {
  const cleanLang = (language || '').toLowerCase().trim();
  let cleanCode = (rawCode || '').trim();

  // Strip markdown fences
  cleanCode = cleanCode
    .replace(/^```(?:html|htm|xml|svg|javascript|js|typescript|ts)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!cleanCode) return '';

  // Check if pure algorithmic script (no HTML/DOM)
  const hasHtmlTags =
    /<html\b|<head\b|<body\b|<div\b|<button\b|<canvas\b|<script\b|<style\b|<svg\b|<!DOCTYPE/i.test(
      cleanCode
    );

  const isPureScript =
    ['javascript', 'js', 'typescript', 'ts', 'node'].includes(cleanLang) && !hasHtmlTags;

  if (isPureScript) {
    return buildJsExecutionHtml(cleanCode, cleanLang);
  }

  // Auto-upgrade scripts using ES module imports without type="module"
  cleanCode = cleanCode.replace(
    /<script(?![^>]*\btype=)([^>]*)>([\s\S]*?)<\/script>/gi,
    (match, attrs, body) => {
      if (/\bimport\s+[\s\S]*?from\s+['"]/.test(body) || /\bimport\s+['"]/.test(body)) {
        return `<script type="module"${attrs}>${body}</script>`;
      }
      return match;
    }
  );

  const smartDeps = getSmartDependencies(cleanCode);

  const isFullHtmlDoc =
    cleanCode.includes('<!DOCTYPE') || cleanCode.includes('<html') || cleanCode.includes('<head');

  if (isFullHtmlDoc) {
    // Inject smart dependencies at the VERY TOP of <head> so the user's custom CSS/JS take priority
    if (/<head[^>]*>/i.test(cleanCode)) {
      return cleanCode.replace(/(<head[^>]*>)/i, `$1\n${smartDeps}\n`);
    } else if (/<html[^>]*>/i.test(cleanCode)) {
      return cleanCode.replace(/(<html[^>]*>)/i, `$1\n<head>\n${smartDeps}\n</head>\n`);
    }
    const strippedDoctype = cleanCode.replace(/<!DOCTYPE[^>]*>/i, '').trim();
    return `<!DOCTYPE html>\n<html>\n<head>\n${smartDeps}\n</head>\n<body>\n${strippedDoctype}\n</body>\n</html>`;
  }

  // Fragment or single component / SVG wrapper
  const isSvgOnly =
    cleanLang === 'svg' || (/^<svg\b/i.test(cleanCode) && !cleanCode.includes('<div'));

  return `<!DOCTYPE html>
<html class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${smartDeps}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: ${isSvgOnly ? '24px' : '16px'};
      background: #09090b;
      color: #ffffff;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      width: 100%;
      ${isSvgOnly ? 'display: flex; align-items: center; justify-content: center;' : ''}
    }
    ${isSvgOnly ? 'svg { max-width: 100%; height: auto; display: block; margin: auto; }' : ''}
  </style>
</head>
<body class="bg-[#09090b] text-white">
  ${cleanCode}
</body>
</html>`;
}
