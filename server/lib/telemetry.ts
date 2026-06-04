import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { isProd } from './paths.ts';

// Configure trace exporter (Jaeger in dev, OTLP in prod)
const traceExporter = new OTLPTraceExporter({
  url: isProd ? process.env.OTLP_TRACE_ENDPOINT : 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: 'nyx-backend',
    [SemanticResourceAttributes.SERVICE_VERSION]: '3.0.0',
  }),
  traceExporter: traceExporter as any,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
    }),
  ],
});

try {
  sdk.start();
  console.log('[Telemetry] OpenTelemetry initialized.');
} catch (error) {
  console.error('[Telemetry] Error initializing OpenTelemetry', error);
}

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('[Telemetry] OpenTelemetry shut down.'))
    .catch((error) => console.log('[Telemetry] Error shutting down OpenTelemetry', error))
    .finally(() => process.exit(0));
});
