/**
 * Per-request abort controllers (not global singleton).
 * Stores { controller, timestamp } for periodic cleanup of stale controllers.
 */

interface ControllerEntry {
  controller: AbortController;
  timestamp: number;
}

export const activeControllers = new Map<string, ControllerEntry>();

// Periodic cleanup of stale controllers (older than 10 minutes)
// Note: This runs in the background; callers should still use cancelRequest/cancelAllRequests.
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCleanup(intervalMs = 60_000): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, data] of activeControllers.entries()) {
      if (now - data.timestamp > 600_000) {
        data.controller.abort();
        activeControllers.delete(id);
      }
    }
  }, intervalMs);
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/** Cancel a specific request by its requestId. */
export function cancelRequest(requestId: string): void {
  const data = activeControllers.get(requestId);
  if (data) {
    data.controller.abort();
    activeControllers.delete(requestId);
  }
}

/** Cancel all in-flight requests. */
export function cancelAllRequests(): void {
  activeControllers.forEach((data) => data.controller.abort());
  activeControllers.clear();
}

/**
 * Backward compatibility alias for cancelAllRequests.
 */
export function cancelCurrentRequest(): void {
  cancelAllRequests();
}
