export const CONSTANTS = {
  SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  SESSION_PRUNE_INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
  SESSION_REFRESH_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_RETRIES: 5,

  /** How often the data retention pruner runs. */
  RETENTION_PRUNE_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
  /** Default retention when neither env var nor constant is configured. */
  DEFAULT_RETENTION_DAYS: 365,
  DEFAULT_AUDIT_LOG_RETENTION_DAYS: 90,
} as const;
