import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    optimizeDeps: {
      esbuildOptions: { target: 'esnext' },
      exclude: ['tiktoken'],
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'zustand',
        'zustand/middleware',
        'motion/react',
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
        '@opentelemetry/api'
      ],
      entries: ['src/**/*.{ts,tsx}'],
    },
    esbuild: {
      logOverride: {
        'unsupported-css-property': 'silent',
      },
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
              if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
              if (id.includes('lottie-web') || id.includes('lottie')) return 'vendor-lottie';
              if (id.includes('@codemirror')) return 'vendor-codemirror';
              if (id.includes('react-syntax-highlighter') || id.includes('refractor')) return 'vendor-syntax';
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
      proxy: {
        // Forward all /api/* requests to Express backend (default dev port 3010)
        '/api': {
          target: 'http://127.0.0.1:3010',
          changeOrigin: true,
          secure: false,
        },
        // Forward WebSocket session-sync to Express
        '/ws': {
          target: 'http://127.0.0.1:3010',
          changeOrigin: true,
          ws: true,
          secure: false,
        },
      },
    },

  };
});
