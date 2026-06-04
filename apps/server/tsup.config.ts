import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts', 'server/worker.ts'],
  format: ['esm'],
  target: 'node22',
  minify: true,
  clean: true,
  outDir: 'dist-server',
  banner: {
    js: `import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);`,
  },
  external: [
    'better-sqlite3', 'onnxruntime-node', 'esbuild', 'sharp', 'lightningcss',
    'pino', 'pino-pretty', 'thread-stream', 'vite', 'swagger-ui-express',
    '@fastify/swagger-ui', 'keytar', '@opentelemetry/sdk-node',
    '@opentelemetry/auto-instrumentations-node', '@opentelemetry/exporter-trace-otlp-http'
  ],
});
