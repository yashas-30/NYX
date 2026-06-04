export const CONSTANTS = {
  SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  SESSION_PRUNE_INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
  SESSION_REFRESH_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_RETRIES: 5,
} as const;
