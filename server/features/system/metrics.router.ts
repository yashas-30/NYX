import { Router } from 'express';
import { SystemService } from './system.service.ts';

export const metricsRouter = Router();
const service = new SystemService();

metricsRouter.get('/metrics', (req, res) => {
  try {
    const { cacheStats, hitRate, uptime, memory, modelsState, activeModel, activeContextSize } =
      service.getMetrics();
    const isPrometheus =
      req.headers.accept?.includes('text/plain') || req.query.format === 'prometheus';

    if (isPrometheus) {
      let metrics = `# HELP nyx_cache_hits_total Total number of cache hits.\n`;
      metrics += `# TYPE nyx_cache_hits_total counter\n`;
      metrics += `nyx_cache_hits_total ${cacheStats.hits}\n\n`;

      metrics += `# HELP nyx_cache_misses_total Total number of cache misses.\n`;
      metrics += `# TYPE nyx_cache_misses_total counter\n`;
      metrics += `nyx_cache_misses_total ${cacheStats.misses}\n\n`;

      metrics += `# HELP nyx_cache_hit_rate Cache hit rate percentage.\n`;
      metrics += `# TYPE nyx_cache_hit_rate gauge\n`;
      metrics += `nyx_cache_hit_rate ${hitRate}\n\n`;

      metrics += `# HELP nyx_system_uptime_seconds Process uptime in seconds.\n`;
      metrics += `# TYPE nyx_system_uptime_seconds gauge\n`;
      metrics += `nyx_system_uptime_seconds ${uptime}\n\n`;

      metrics += `# HELP nyx_system_memory_rss_bytes System memory RSS size in bytes.\n`;
      metrics += `# TYPE nyx_system_memory_rss_bytes gauge\n`;
      metrics += `nyx_system_memory_rss_bytes ${memory.rss}\n\n`;

      metrics += `# HELP nyx_system_memory_heap_used_bytes Heap memory used in bytes.\n`;
      metrics += `# TYPE nyx_system_memory_heap_used_bytes gauge\n`;
      metrics += `nyx_system_memory_heap_used_bytes ${memory.heapUsed}\n`;

      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
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
