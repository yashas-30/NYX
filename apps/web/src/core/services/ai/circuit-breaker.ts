/**
 * Simple circuit breaker for cloud providers.
 * Uses closed → open → half-open state machine.
 */

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_TIMEOUT_MS = 30000;

export function isCircuitOpen(provider: string): boolean {
  const state = circuits.get(provider);
  if (!state || state.state === 'closed') return false;

  if (state.state === 'open') {
    if (Date.now() - state.lastFailure > CIRCUIT_TIMEOUT_MS) {
      state.state = 'half-open'; // Transition to half-open
      return false; // Allow one test request
    }
    return true; // Still open
  }

  // half-open: allow through, next result will close or re-open
  return false;
}

export function recordSuccess(provider: string): void {
  circuits.delete(provider);
}

export function recordFailure(provider: string): void {
  const state = circuits.get(provider) || { failures: 0, lastFailure: 0, state: 'closed' as const };

  if (state.state === 'half-open') {
    // If we fail while half-open, immediately trip back to open
    state.state = 'open';
    state.lastFailure = Date.now();
  } else {
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= CIRCUIT_THRESHOLD) state.state = 'open';
  }

  circuits.set(provider, state);
}
