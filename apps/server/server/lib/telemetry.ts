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
  ttftMs?: number;       // Time-to-first-token
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
  /** Ring buffer of recent TTFT samples (ms). */
  private recentTtft: number[] = [];

  /** Maximum recent events kept in-memory. */
  private readonly MAX_RECENT = 500;

  recordRequest(provider: string, model: string, durationMs: number, tokensGenerated?: number, ttftMs?: number): void {
    this.totalRequests++;
    if (tokensGenerated) this.totalTokens += tokensGenerated;

    const record: RequestRecord = {
      provider,
      model,
      durationMs,
      ttftMs,
      tokensGenerated,
      timestamp: Date.now(),
    };

    this.recentRequests.push(record);
    if (this.recentRequests.length > this.MAX_RECENT) {
      this.recentRequests.shift();
    }

    // Track TTFT samples
    if (ttftMs !== undefined) {
      this.recentTtft.push(ttftMs);
      if (this.recentTtft.length > this.MAX_RECENT) {
        this.recentTtft.shift();
      }
    }

    // Persist to DB asynchronously (non-blocking)
    this.persistRequestAsync(record);
  }

  /**
   * Record TTFT only — call this as soon as the first token arrives,
   * before the full response has finished streaming.
   */
  recordTTFT(provider: string, model: string, ttftMs: number): void {
    this.recentTtft.push(ttftMs);
    if (this.recentTtft.length > this.MAX_RECENT) {
      this.recentTtft.shift();
    }
    logger.debug({ provider, model, ttftMs }, '[Telemetry] TTFT recorded');
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
    // Compute TTFT percentiles from the in-memory ring buffer
    const ttftSamples = [...this.recentTtft].sort((a, b) => a - b);
    const avgTtftMs = ttftSamples.length > 0
      ? Math.round(ttftSamples.reduce((s, v) => s + v, 0) / ttftSamples.length)
      : null;
    const p95TtftMs = ttftSamples.length > 0
      ? ttftSamples[Math.floor(ttftSamples.length * 0.95)]
      : null;

    // Compute avg total latency from recent requests
    const latencySamples = this.recentRequests.map(r => r.durationMs);
    const avgLatencyMs = latencySamples.length > 0
      ? Math.round(latencySamples.reduce((s, v) => s + v, 0) / latencySamples.length)
      : null;

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      totalTokens: this.totalTokens,
      errorRate: this.totalRequests > 0 ? this.totalErrors / this.totalRequests : 0,
      latency: {
        avgMs: avgLatencyMs,
        ttftSampleCount: ttftSamples.length,
        avgTtftMs,
        p95TtftMs,
      },
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
