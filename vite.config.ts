import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  // Set the base path to '/NYX/' when building inside GitHub Actions for GitHub Pages deployment
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const base = isGithubActions ? '/NYX/' : '/';

  return {
    base,
    plugins: [react(), tailwindcss(), wasm(), topLevelAwait()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
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
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        external: ['tiktoken'],
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
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
