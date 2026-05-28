import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: 'electron/main.ts',
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      outDir: 'dist-electron',
      emptyOutDir: true,
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      lib: {
        entry: 'electron/preload.ts',
        formats: ['cjs'],
        fileName: () => 'preload.js',
      },
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        external: ['electron'],
      },
    },
    plugins: [],
  },
  renderer: {
    root: '.',
    plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
      // tiktoken uses a native WASM binary — exclude from pre-bundling.
      // The dynamic import in ai.service.ts already has a catch() fallback.
      exclude: ['tiktoken'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@src': path.resolve(__dirname, './src'),
        '@server': path.resolve(__dirname, './server'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
    server: {
      watch: {
        ignored: [
          '**/.nyx-cache/**',
          '**/.nyx-models/**',
          '**/.nyx-logs/**',
          '**/nyx.db*',
          '**/scratch/**',
          '**/server.log',
          '**/server.err',
          /[/\\]nyx\.db.*/,
          /.*nyx\.db.*/,
        ],
      },
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: 'index.html',
        // tiktoken ships a native WASM binary that Vite/Rollup cannot bundle.
        // It is only used via a dynamic import() with a catch fallback in ai.service.ts,
        // so marking it external is safe — the fallback heuristic activates automatically.
        external: ['tiktoken'],
        onwarn(warning, warn) {
          if (warning.code === 'EVAL' && warning.id?.includes('lottie-web')) {
            return;
          }
          // Suppress "tiktoken is external" warnings — expected by design
          if (warning.code === 'UNRESOLVED_IMPORT' && warning.exporter === 'tiktoken') {
            return;
          }
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('motion')) {
                return 'vendor-animation';
              }
              if (id.includes('recharts') || id.includes('d3')) {
                return 'vendor-charts';
              }
              if (id.includes('lottie-web') || id.includes('lottie')) {
                return 'vendor-lottie';
              }
            }
          },
        },
      },
    },
  },
});
