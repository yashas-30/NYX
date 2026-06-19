import promClient from 'prom-client';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { sessions } from '../db/schema.js';
import { gt } from 'drizzle-orm';
import { SystemService } from '../features/system/system.service.js';

// Counter for requests
export const requestsTotal = new promClient.Counter({
  name: 'nyx_requests_total',
  help: 'Total number of HTTP requests labeled by method, path, and status code',
  labelNames: ['method', 'path', 'status'],
});

// Histogram for request duration
export const requestDurationSeconds = new promClient.Histogram({
  name: 'nyx_request_duration_seconds',
  help: 'Request duration histogram in seconds labeled by method, path, and status code',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

// Counter for AI tokens generated
export const aiTokensGeneratedTotal = new promClient.Counter({
  name: 'nyx_ai_tokens_generated_total',
  help: 'Total number of AI tokens generated labeled by provider',
  labelNames: ['provider'],
});

// Histogram for AI latency
export const aiLatencySeconds = new promClient.Histogram({
  name: 'nyx_ai_latency_seconds',
  help: 'Latency of downstream AI calls in seconds labeled by provider',
  labelNames: ['provider'],
  buckets: [0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
});

// Gauge for local model VRAM usage
export const localModelVramBytes = new promClient.Gauge({
  name: 'nyx_local_model_vram_bytes',
  help: 'Total local model VRAM usage in bytes',
});

// Gauge for active sessions
export const activeSessions = new promClient.Gauge({
  name: 'nyx_active_sessions',
  help: 'Total number of active sessions',
});

// Helper/hook to track active sessions and VRAM
const systemService = new SystemService();

export async function updateSystemMetrics() {
  try {
    // 1. Calculate active sessions from database
    const now = Date.now();
    const activeResult = db.select().from(sessions).where(gt(sessions.expiresAt, now)).all();
    activeSessions.set(activeResult.length);
  } catch (error) {
    // Suppress db/sqlite locks/errors
  }

  try {
    // 2. Local model VRAM usage
    const specs = await systemService.detectVRAM();
    if (specs && specs.vram) {
      localModelVramBytes.set(specs.vram - specs.freeVram);
    } else {
      localModelVramBytes.set(0);
    }
  } catch (error) {
    // Suppress system info errors
  }
}

// Fastify Hook to measure traffic and latency
const START_TIME_SYMBOL = Symbol('request-start-time');

export function registerMetricsHook(fastify: FastifyInstance) {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any)[START_TIME_SYMBOL] = process.hrtime();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as any)[START_TIME_SYMBOL];
    if (!startTime) return;

    const diff = process.hrtime(startTime);
    const durationInSeconds = diff[0] + diff[1] / 1e9;

    const method = request.method;
    // Strip query parameters to avoid path cardinality explosion
    const path = request.routeOptions?.url || request.url.split('?')[0];
    const status = String(reply.statusCode);

    requestsTotal.labels({ method, path, status }).inc();
    requestDurationSeconds.labels({ method, path, status }).observe(durationInSeconds);
  });
}
