import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'server.ts',
    worker: 'server/worker.ts',
    'tokenEstimator.worker': 'server/lib/workers/tokenEstimator.worker.ts',
    'sse.worker': 'server/lib/workers/sse.worker.ts'
  },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: process.env.NODE_ENV === 'production',
  external: [
    // Native modules that shouldn't be bundled
    'better-sqlite3',
    'electron',
  ],
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
  }
});
