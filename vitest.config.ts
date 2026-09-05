import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/release/**',
      '**/dist-server/**',
      '**/dist-desktop/**',
      '**/e2e/**',
      '**/*.spec.ts',
      '**/.worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@nyx/shared': path.resolve(import.meta.dirname, './packages/shared/src/index.ts'),
      '@': path.resolve(import.meta.dirname, './apps/web'),
      '@src': path.resolve(import.meta.dirname, './apps/web/src'),
      '@shared': path.resolve(import.meta.dirname, './apps/web/src/shared'),
      '@features': path.resolve(import.meta.dirname, './apps/web/src/features'),
      '@core': path.resolve(import.meta.dirname, './apps/web/src/core'),
      '@stores': path.resolve(import.meta.dirname, './apps/web/src/stores'),
      '@assets': path.resolve(import.meta.dirname, './apps/web/src/assets'),
      '@server': path.resolve(import.meta.dirname, './apps/server/server'),
    },
  },
});
