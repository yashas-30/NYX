export const CONSTANTS = {
  SESSION_TTL_MS: 30 * 60 * 1000, // 30 minutes
  SESSION_PRUNE_INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
  SESSION_REFRESH_TTL_MS: 30 * 60 * 1000, // 30 minutes
  MAX_RETRIES: 5,
} as const;
