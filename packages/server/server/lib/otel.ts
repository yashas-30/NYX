/**
 * @file server/lib/otel.ts
 * @description Initializes OpenTelemetry Node SDK for distributed tracing.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import logger from './logger.js';

const traceExporter = new OTLPTraceExporter({
  // Default URL is http://localhost:4318/v1/traces, can be overridden via OTEL_EXPORTER_OTLP_ENDPOINT
});

const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }, // Disable noisy fs logs, keep custom/high-value tracing only
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-fastify': { enabled: true },
    } as any),
  ],
});

try {
  sdk.start();
  logger.info('[OTel] OpenTelemetry SDK initialized successfully');
} catch (error: any) {
  logger.error({ error: error.message }, '[OTel] Failed to initialize OpenTelemetry SDK');
}

// Global tracer instance
export const tracer = trace.getTracer('nyx-server');

/**
 * Traces an async operation inside a custom span.
 */
export async function traceActiveSpan<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => logger.info('[OTel] Tracing terminated'))
    .catch((error) => logger.error({ error }, '[OTel] Error terminating tracing'))
    .finally(() => process.exit(0));
});
