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
      'server/features/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  } as any,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@src': path.resolve(__dirname, './src'),
      '@server': path.resolve(__dirname, './server'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
