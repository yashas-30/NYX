import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.ts', 'jsdom'],
      ['src/**/*.test.tsx', 'jsdom'],
    ],
    include: [
      'server/lib/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
