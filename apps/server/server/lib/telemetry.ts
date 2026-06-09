import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import logger from './logger.js';

// ── OpenTelemetry SDK Bootstrap ────────────────────────────────────────────────

export const initTelemetry = () => {
  if (process.env.DISABLE_TELEMETRY === 'true') return;

  const sdk = new NodeSDK({
    traceExporter: new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
};

// ── NyxTelemetry: Structured request/error/token tracking ─────────────────────

interface RequestRecord {
  provider: string;
  model: string;
  durationMs: number;
  tokensGenerated?: number;
  timestamp: number;
}

interface ErrorRecord {
  provider: string;
  model: string;
  errorType: string;
  timestamp: number;
}

class NyxTelemetryClass {
  private totalRequests = 0;
  private totalErrors = 0;
  private totalTokens = 0;
  private recentRequests: RequestRecord[] = [];
  private recentErrors: ErrorRecord[] = [];

  /** Maximum recent events kept in-memory (ring buffer style). */
  private readonly MAX_RECENT = 500;

  recordRequest(provider: string, model: string, durationMs: number, tokensGenerated?: number): void {
    this.totalRequests++;
    if (tokensGenerated) this.totalTokens += tokensGenerated;

    const record: RequestRecord = {
      provider,
      model,
      durationMs,
      tokensGenerated,
      timestamp: Date.now(),
    };

    this.recentRequests.push(record);
    if (this.recentRequests.length > this.MAX_RECENT) {
      this.recentRequests.shift();
    }

    // Persist to DB asynchronously (non-blocking)
    this.persistRequestAsync(record);
  }

  recordError(provider: string, model: string, errorType: string): void {
    this.totalErrors++;

    const record: ErrorRecord = { provider, model, errorType, timestamp: Date.now() };
    this.recentErrors.push(record);
    if (this.recentErrors.length > this.MAX_RECENT) {
      this.recentErrors.shift();
    }

    this.persistErrorAsync(record);
  }

  getStats() {
    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalTokens: this.totalTokens,
      errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
      recentRequests: this.recentRequests.slice(-10),
      recentErrors: this.recentErrors.slice(-10),
    };
  }

  private async persistRequestAsync(record: RequestRecord): Promise<void> {
    try {
      const { db } = await import('../db/client.js');
      const { telemetryEvents } = await import('../db/schema.js');
      await db.insert(telemetryEvents).values({
        provider: record.provider,
        model: record.model,
        eventType: 'request',
        durationMs: record.durationMs,
        tokensGenerated: record.tokensGenerated ?? null,
        timestamp: record.timestamp,
      });
    } catch {
      // Telemetry persistence is non-critical — fail silently
    }
  }

  private async persistErrorAsync(record: ErrorRecord): Promise<void> {
    try {
      const { db } = await import('../db/client.js');
      const { telemetryEvents } = await import('../db/schema.js');
      await db.insert(telemetryEvents).values({
        provider: record.provider,
        model: record.model,
        eventType: 'error',
        durationMs: null,
        tokensGenerated: null,
        errorType: record.errorType,
        timestamp: record.timestamp,
      });
    } catch {
      // Telemetry persistence is non-critical — fail silently
    }
  }
}

/** Singleton telemetry instance — import and use across the server. */
export const NyxTelemetry = new NyxTelemetryClass();
