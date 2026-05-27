import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import * as path from 'path';

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
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      watch: {
        ignored: [
          '**/.nyx-cache/**',
          '**/.nyx-models/**',
          '**/scratch/**',
          '**/server.log',
          '**/server.err'
        ]
      }
    },
    build: {
      target: 'esnext',
      outDir: 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: 'index.html',
        onwarn(warning, warn) {
          if (warning.code === 'EVAL' && warning.id?.includes('lottie-web')) {
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
