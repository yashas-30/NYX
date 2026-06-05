import client from 'prom-client';

// Create metrics
export const httpRequestDuration = new client.Histogram({
  name: 'nyx_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

export const aiRequestDuration = new client.Histogram({
  name: 'nyx_ai_request_duration_seconds',
  help: 'Duration of AI requests in seconds',
  labelNames: ['provider', 'model', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60]
});

export const aiTokensGenerated = new client.Counter({
  name: 'nyx_ai_tokens_generated_total',
  help: 'Total tokens generated',
  labelNames: ['provider', 'model']
});

export const aiErrors = new client.Counter({
  name: 'nyx_ai_errors_total',
  help: 'Total AI errors',
  labelNames: ['provider', 'model', 'error_type']
});

export const activeConnections = new client.Gauge({
  name: 'nyx_active_connections',
  help: 'Number of active WebSocket connections'
});

export const cacheHitRate = new client.Gauge({
  name: 'nyx_cache_hit_rate',
  help: 'Cache hit rate percentage'
});

// Register all metrics
client.register.registerMetric(httpRequestDuration);
client.register.registerMetric(aiRequestDuration);
client.register.registerMetric(aiTokensGenerated);
client.register.registerMetric(aiErrors);
client.register.registerMetric(activeConnections);
client.register.registerMetric(cacheHitRate);

// Metrics endpoint
export function metricsHandler(req: any, res: any) {
  res.header('Content-Type', client.register.contentType);
  res.send(client.register.metrics());
}
