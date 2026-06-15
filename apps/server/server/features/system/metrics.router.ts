import { FastifyInstance } from 'fastify';
import { SystemService } from './system.service.js';
import promClient from 'prom-client';
import { NyxTelemetry } from '../../lib/telemetry.js';

export async function metricsRouter(fastify: FastifyInstance) {
  const service = new SystemService();

  // Initialize default node metrics (memory, CPU, event loop lag, etc.)
  try {
    promClient.collectDefaultMetrics({ prefix: 'nyx_' });
  } catch (err) {
    // Suppress double registration errors
  }

  // Define custom metrics as Gauges to allow dynamic setting of exact stats on scrape
  const cacheHitsGauge = new promClient.Gauge({
    name: 'nyx_cache_hits_total',
    help: 'Total number of cache hits',
  });
  const cacheMissesGauge = new promClient.Gauge({
    name: 'nyx_cache_misses_total',
    help: 'Total number of cache misses',
  });
  const cacheHitRateGauge = new promClient.Gauge({
    name: 'nyx_cache_hit_rate',
    help: 'Cache hit rate (0.0 to 1.0)',
  });
  const cacheItemCountGauge = new promClient.Gauge({
    name: 'nyx_cache_items_total',
    help: 'Total number of items in cache',
  });
  const cacheSizeBytesGauge = new promClient.Gauge({
    name: 'nyx_cache_size_bytes',
    help: 'Total size of cache in bytes',
  });


  const systemHealthGauge = new promClient.Gauge({
    name: 'nyx_system_health_status',
    help: 'System health status (1 = ok, 0.5 = degraded, 0 = down)',
  });
  const dependencyHealthGauge = new promClient.Gauge({
    name: 'nyx_dependency_health_status',
    help: 'Health status of dependencies (1 = ok, 0.5 = degraded, 0 = down)',
    labelNames: ['dependency'],
  });

  fastify.get('/metrics', async (request, reply) => {
    try {
      const { cacheStats, hitRate, uptime, memory } =
        await service.getMetrics();
      const health = await service.getHealth();

      // Dynamically update metrics values
      cacheHitsGauge.set(cacheStats.hits);
      cacheMissesGauge.set(cacheStats.misses);
      cacheHitRateGauge.set(hitRate);
      cacheItemCountGauge.set(cacheStats.itemCount);
      cacheSizeBytesGauge.set(cacheStats.totalSizeBytes);


      const overallHealthVal =
        health.overall === 'ok' ? 1 : health.overall === 'degraded' ? 0.5 : 0;
      systemHealthGauge.set(overallHealthVal);

      if (health.checks && health.checks.dependencies) {
        for (const [depName, status] of Object.entries(health.checks.dependencies)) {
          const val = status === 'ok' ? 1 : status === 'degraded' ? 0.5 : 0;
          dependencyHealthGauge.labels({ dependency: depName }).set(val);
        }
      }

      const isPrometheus =
        request.headers.accept?.includes('text/plain') ||
        (request.query as any).format === 'prometheus';

      if (isPrometheus) {
        reply.header('Content-Type', promClient.register.contentType);
        const metrics = await promClient.register.metrics();
        return reply.send(metrics);
      }

      reply.send({
        cache: {
          hitRate,
          ...cacheStats,
        },
        system: {
          uptime,
          memory,
        },
        health,
        telemetry: NyxTelemetry.getStats(),
      });
    } catch (error: any) {
      reply.code(500).send({ error: error.message });
    }
  });
}
