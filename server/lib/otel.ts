/**
 * @file server/lib/otel.ts
 * @description Initializes OpenTelemetry Node SDK for distributed tracing.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import logger from './logger.ts';

const sdk = new NodeSDK({
  instrumentations: [getNodeAutoInstrumentations()],
});

try {
  sdk.start();
  logger.info('[OTel] OpenTelemetry SDK initialized successfully');
} catch (error: any) {
  logger.error({ error: error.message }, '[OTel] Failed to initialize OpenTelemetry SDK');
}
