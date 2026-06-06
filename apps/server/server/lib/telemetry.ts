import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export const initTelemetry = () => {
  if (process.env.DISABLE_TELEMETRY === 'true') return;

  const sdk = new NodeSDK({
    traceExporter: new JaegerExporter({ 
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces' 
    }),
    instrumentations: [getNodeAutoInstrumentations()]
  });

  sdk.start();
  
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};
