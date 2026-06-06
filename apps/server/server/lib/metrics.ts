import { register, Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  requestsTotal: new Counter({
    name: 'nyx_requests_total',
    help: 'Total AI requests',
    labelNames: ['provider', 'model', 'status']
  }),
  inferenceDuration: new Histogram({
    name: 'nyx_inference_duration_seconds',
    help: 'Model inference duration',
    labelNames: ['provider', 'model'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]
  }),
  tokensGenerated: new Counter({
    name: 'nyx_tokens_generated_total',
    help: 'Total tokens generated',
    labelNames: ['provider', 'model']
  }),
  cacheHitRatio: new Gauge({
    name: 'nyx_cache_hit_ratio',
    help: 'Cache hit ratio (0-1)',
    labelNames: ['provider', 'model']
  }),
  pipelineDuration: new Histogram({
    name: 'nyx_agent_pipeline_duration_seconds',
    help: 'Agent pipeline stage duration',
    labelNames: ['stage']
  }),
  activeSessions: new Gauge({
    name: 'nyx_active_sessions',
    help: 'Number of active user sessions'
  }),
  vramUsage: new Gauge({
    name: 'nyx_vram_usage_bytes',
    help: 'GPU VRAM usage',
    labelNames: ['gpu_id', 'model']
  }),
  errorsTotal: new Counter({
    name: 'nyx_errors_total',
    help: 'Total errors',
    labelNames: ['type', 'provider']
  })
};

export const getMetrics = async () => {
  return await register.metrics();
};
export const getMetricsContentType = () => register.contentType;
