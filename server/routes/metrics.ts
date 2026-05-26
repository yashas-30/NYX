import { Router } from 'express';
import { CacheServer } from '../lib/cache.ts';
import { LocalModelRunner } from '../lib/localModelRunner.ts';

export const metricsRouter = Router();

metricsRouter.get('/metrics', (req, res) => {
  const cacheStats = CacheServer.getStats();
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? cacheStats.hits / total : 0;
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  const isPrometheus = req.headers.accept?.includes('text/plain') || req.query.format === 'prometheus';

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
      state: LocalModelRunner.getState(),
      activeModel: LocalModelRunner.getActiveModel(),
      activeContextSize: LocalModelRunner.getActiveContextSize(),
    },
    system: {
      uptime,
      memory,
    },
  });
});
