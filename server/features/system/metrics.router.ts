import { Router } from 'express';
import { SystemService } from './system.service.ts';
import promClient from 'prom-client';

export const metricsRouter = Router();
const service = new SystemService();

// Initialize default node metrics (memory, CPU, event loop lag, etc.)
promClient.collectDefaultMetrics({ prefix: 'nyx_' });

// Define custom metrics
const cacheHitsCounter = new promClient.Counter({
  name: 'nyx_cache_hits_total',
  help: 'Total number of cache hits',
});
const cacheMissesCounter = new promClient.Counter({
  name: 'nyx_cache_misses_total',
  help: 'Total number of cache misses',
});

metricsRouter.get('/metrics', async (req, res) => {
  try {
    const { cacheStats, hitRate, uptime, memory, modelsState, activeModel, activeContextSize } =
      service.getMetrics();
    const isPrometheus =
      req.headers.accept?.includes('text/plain') || req.query.format === 'prometheus';

    if (isPrometheus) {
      res.setHeader('Content-Type', promClient.register.contentType);
      const metrics = await promClient.register.metrics();
      return res.send(metrics);
    }

    res.json({
      cache: {
        hitRate,
        ...cacheStats,
      },
      models: {
        state: modelsState,
        activeModel,
        activeContextSize,
      },
      system: {
        uptime,
        memory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
