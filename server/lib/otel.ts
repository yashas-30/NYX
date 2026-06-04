/**
 * @file server/lib/otel.ts
 * @description Initializes OpenTelemetry Node SDK for distributed tracing.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import logger from './logger.ts';

const traceExporter = new OTLPTraceExporter({
  // Default URL is http://localhost:4318/v1/traces, can be overridden via OTEL_EXPORTER_OTLP_ENDPOINT
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs logs if needed, for now use defaults
      '@opentelemetry/instrumentation-fs': { enabled: true },
      '@opentelemetry/instrumentation-http': { enabled: true },
    }),
  ],
});

try {
  sdk.start();
  logger.info('[OTel] OpenTelemetry SDK initialized successfully');
} catch (error: any) {
  logger.error({ error: error.message }, '[OTel] Failed to initialize OpenTelemetry SDK');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => logger.info('[OTel] Tracing terminated'))
    .catch((error) => logger.error({ error }, '[OTel] Error terminating tracing'))
    .finally(() => process.exit(0));
});
