import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import svgr from 'vite-plugin-svgr';
import { visualizer } from 'rollup-plugin-visualizer';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// ---------------------------------------------------------------------------
// AI Provider Proxy targets (avoids browser CORS on direct fetch)
// ---------------------------------------------------------------------------
const AI_PROXY_TARGETS: Record<string, string> = {
  openrouter: 'https://openrouter.ai',
  openai:     'https://api.openai.com',
  anthropic:  'https://api.anthropic.com',
  deepseek:   'https://api.deepseek.com',
};

/** Forward an IncomingMessage to an external HTTPS target and pipe the response back. */
function proxyAIRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetBase: string,
  upstreamPath: string
) {
  const target = new URL(targetBase);
  const options: https.RequestOptions = {
    hostname: target.hostname,
    port: 443,
    path: upstreamPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: target.hostname, // correct Host header for upstream
    },
  };
  // Remove headers that confuse upstream APIs
  delete (options.headers as any)['origin'];
  delete (options.headers as any)['referer'];

  const proxyReq = https.request(options, (proxyRes) => {
    // Pass through CORS headers so browser is happy with the local response
    res.writeHead(proxyRes.statusCode ?? 200, {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[AI Proxy] upstream error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'AI proxy upstream error', detail: err.message }));
  });

  req.pipe(proxyReq, { end: true });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      {
        name: 'mock-backend',
        configureServer(server) {
          // ------------------------------------------------------------------
          // AI Provider Proxy — routes /api/proxy/<provider>/* to upstream API
          // so browser CORS never blocks the requests.
          // ------------------------------------------------------------------
          server.middlewares.use('/api/proxy', (req, res, next) => {
            if (!req.url) { next(); return; }

            // Handle CORS preflight
            if (req.method === 'OPTIONS') {
              res.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,OPTIONS',
                'access-control-allow-headers': '*',
                'access-control-max-age': '86400',
              });
              res.end();
              return;
            }

            // URL shape: /api/proxy/<provider>/<upstream-path>
            // e.g.  /api/proxy/openrouter/api/v1/chat/completions
            const parts = req.url.replace(/^\//, '').split('/');
            const providerKey = parts[0];  // e.g. 'openrouter'
            const upstreamPath = '/' + parts.slice(1).join('/');
            const targetBase = AI_PROXY_TARGETS[providerKey];

            if (!targetBase) {
              next();
              return;
            }

            proxyAIRequest(req as http.IncomingMessage, res as http.ServerResponse, targetBase, upstreamPath);
          });

          server.middlewares.use('/api', (req, res, next) => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url && (req.url.includes('/vault/token') || req.url.includes('/auth/session'))) {
              res.statusCode = 200;
              res.end(JSON.stringify({ 
                token: 'mock-token-for-ui-testing', 
                expiresAt: Date.now() + 10000000,
                success: true
              }));
            } else if (req.url && req.url.includes('/vault/validate')) {
              res.statusCode = 200;
              res.end(JSON.stringify({ valid: true, error: null }));
            } else if (req.url && req.url.includes('/vault/store')) {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } else if (req.url && req.url.includes('/memory')) {
              if (req.method === 'GET') {
                res.statusCode = 200;
                // Return some mock memory
                res.end(JSON.stringify({
                  memories: [
                    { id: '1', fact: 'User prefers dark mode', category: 'preference', createdAt: Date.now() }
                  ]
                }));
              } else if (req.method === 'POST') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                  memory: { id: Date.now().toString(), fact: 'New memory added', category: 'manual', createdAt: Date.now() }
                }));
              } else if (req.method === 'DELETE') {
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true }));
              }
            } else if (req.url && req.url.includes('/conversations')) {
              res.statusCode = 200;
              res.end(JSON.stringify([]));
            } else if (req.url && req.url.includes('/sessions')) {
              res.statusCode = 200;
              res.end(JSON.stringify([]));
            } else if (req.url && req.url.includes('/nyx/local-models')) {
              res.statusCode = 200;
              res.end(JSON.stringify({ models: [], status: 'offline', success: true }));
            } else if (req.url && req.url.includes('/vault/status')) {
              res.statusCode = 200;
              res.end(JSON.stringify({ configured: false, success: true }));
            } else if (req.url && req.url.includes('/cache/stats')) {
              res.statusCode = 200;
              res.end(JSON.stringify({ size: 0, count: 0, success: true }));
            } else {
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true, message: 'Backend mock default success fallback' }));
            }
          });

          server.httpServer?.on('upgrade', (req, socket, head) => {
            if (req.url && req.url.includes('/ws/session-sync')) {
              const key = req.headers['sec-websocket-key'];
              if (key) {
                const accept = crypto
                  .createHash('sha1')
                  .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
                  .digest('base64');
                
                socket.write(
                  'HTTP/1.1 101 Switching Protocols\r\n' +
                  'Upgrade: websocket\r\n' +
                  'Connection: Upgrade\r\n' +
                  `Sec-WebSocket-Accept: ${accept}\r\n` +
                  '\r\n'
                );

                socket.on('error', () => {
                  socket.destroy();
                });
              } else {
                socket.destroy();
              }
            }
          });
        }
      },
      react(),
      tailwindcss(),
      wasm(),
      topLevelAwait(),
      svgr(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        },
        manifest: {
          name: 'NYX Coder Workspace',
          short_name: 'NYX',
          description: 'Transparent agentic AI coding workspace',
          theme_color: '#09090b',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
        filename: 'dist/stats.html'
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    optimizeDeps: {
      // @ts-ignore - Vite types might be slightly outdated with Rolldown migration
      rolldownOptions: { target: 'esnext' } as any,
      exclude: ['tiktoken'],
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'zustand',
        'zustand/middleware',
        '@codemirror/state',
        '@codemirror/view',
        '@base-ui/react',
        'sonner',
        'clsx',
        'tailwind-merge',
        'react-markdown',
        'react-syntax-highlighter',
        'remark-gfm',
        '@tanstack/react-virtual',
        'async-mutex',
        '@opentelemetry/api',
      ],
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@src': path.resolve(__dirname, './src'),
        '@server': path.resolve(__dirname, './server'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@features': path.resolve(__dirname, './src/features'),
        '@core': path.resolve(__dirname, './src/core'),
        '@assets': path.resolve(__dirname, './src/assets'),
      },
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 8000,
      rollupOptions: {
        external: ['tiktoken'],
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          if (warning.message.includes('is dynamically imported by')) return;
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('motion')) return 'vendor-animation';
              if (id.includes('lottie-web') || id.includes('lottie')) return 'vendor-lottie';
              if (id.includes('@codemirror')) return 'vendor-codemirror';
              if (id.includes('react-syntax-highlighter') || id.includes('refractor'))
                return 'vendor-syntax';
              if (id.includes('@base-ui')) return 'vendor-base-ui';
            }
          },
        },
      },
    },
    server: {
      watch: {
        usePolling: false,
        ignored: [
          '**/src-tauri/**',
          '**/.nyx-state/**',
          '**/.nyx-cache/**',
          '**/.nyx-models/**',
          '**/.nyx-logs/**',
          '**/.nyx-keys/**',
          '**/.nyx-backups/**',
          '**/nyx.db*',
          '**/scratch/**',
          '**/server.log',
          '**/server.err',
          '**/config.json',
          '**/conversations.json',
        ],
      },
      port: 3000,
      strictPort: true,
      proxy: undefined /* process.env.FASTIFY_VITE_EMBEDDED ? undefined : {
        '/uploads': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('error', (err: any, req, res: any) => {
              if (err.code === 'ECONNREFUSED') {
                if (!res.headersSent) {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                }
                res.end(JSON.stringify({ error: 'Server starting, please retry...' }));
              }
            });
          }
        },
        '/ws': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          ws: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('error', (err: any, req, res: any) => {
              if (err.code === 'ECONNREFUSED') {
                if (res.writeHead && !res.headersSent) {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                }
                if (res.end) res.end(JSON.stringify({ error: 'Server starting, please retry...' }));
              }
            });
          }
        },
      } */,
    },
  };
});
