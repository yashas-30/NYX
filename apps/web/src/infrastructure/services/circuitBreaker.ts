/**
 * @file src/infrastructure/services/circuitBreaker.ts
 * @description Client-side Circuit Breaker to monitor provider health and trip/recover dynamically.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures before tripping
  cooldownPeriodMs: number; // Time in MS to wait before attempting recovery (HALF_OPEN)
}

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private provider: string;

  constructor(provider: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.provider = provider;
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      cooldownPeriodMs: config.cooldownPeriodMs ?? 30000, // Default 30s cooldown
    };
  }

  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.updateState();
  }

  private updateState(): void {
    if (this.state === 'OPEN') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure >= this.config.cooldownPeriodMs) {
        this.state = 'HALF_OPEN';
        console.warn(
          `[CircuitBreaker] Provider "${this.provider}" entering HALF_OPEN state. Cooldown period expired.`
        );
      }
    } else if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
        console.error(
          `[CircuitBreaker] Provider "${this.provider}" tripped to OPEN! Threshold of ${this.config.failureThreshold} consecutive failures exceeded.`
        );
      }
    }
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }
}

class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();
  private defaultThreshold = 3;
  private defaultCooldown = 30000;

  getBreaker(provider: string): CircuitBreaker {
    if (!this.breakers.has(provider)) {
      this.breakers.set(
        provider,
        new CircuitBreaker(provider, {
          failureThreshold: this.defaultThreshold,
          cooldownPeriodMs: this.defaultCooldown,
        })
      );
    }
    return this.breakers.get(provider)!;
  }

  isOpen(provider: string): boolean {
    return this.getBreaker(provider).isOpen();
  }

  recordSuccess(provider: string): void {
    this.getBreaker(provider).recordSuccess();
  }

  recordFailure(provider: string): void {
    this.getBreaker(provider).recordFailure();
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
