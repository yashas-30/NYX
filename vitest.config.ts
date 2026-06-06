import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**', '**/dist-server/**', '**/dist-desktop/**', '**/e2e/**', '**/*.spec.ts', '**/.worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@nyx/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, './apps/web'),
      '@src': path.resolve(__dirname, './apps/web/src'),
      '@shared': path.resolve(__dirname, './apps/web/src/shared'),
      '@features': path.resolve(__dirname, './apps/web/src/features'),
      '@core': path.resolve(__dirname, './apps/web/src/core'),
      '@assets': path.resolve(__dirname, './apps/web/src/assets'),
      '@server': path.resolve(__dirname, './apps/server/server'),
    },
  },
});
