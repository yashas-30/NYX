import logger from './logger.js';
import { db } from '../db/client.js';
import { env } from '../config/env.js';
import { CONSTANTS } from '../config/constants.js';
import {
  auditLogs,
  usageLogs,
  usageCosts,
  asyncJobs,
  searchQueries,
  agentRuns,
  promptOptimizations,
  chatConversations,
  codeConversations,
} from '../db/schema.js';
import { lt } from 'drizzle-orm';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

function retentionDays(): number {
  return env.DATA_RETENTION_DAYS || CONSTANTS.DEFAULT_RETENTION_DAYS;
}

function auditRetentionDays(): number {
  return env.AUDIT_LOG_RETENTION_DAYS || CONSTANTS.DEFAULT_AUDIT_LOG_RETENTION_DAYS;
}

function cutoffMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

interface PruneResult {
  table: string;
  deleted: number;
}

function pruneTable(name: string, table: any, column: any, cutoff: number): PruneResult {
  try {
    const result = db.delete(table).where(lt(column, cutoff)).run();
    const count = result.changes ?? 0;
    if (count > 0) {
      logger.info({ table: name, deleted: count }, '[Retention] Pruned expired records');
    }
    return { table: name, deleted: count };
  } catch (error: any) {
    logger.error({ table: name, error: error.message }, '[Retention] Prune failed');
    return { table: name, deleted: 0 };
  }
}

/**
 * Runs one pass of data retention pruning against all eligible tables.
 * Intended to be called on a timer (see `startRetentionPruner`).
 */
export function pruneExpiredData(): PruneResult[] {
  const results: PruneResult[] = [];
  const dataCutoff = cutoffMs(retentionDays());
  const auditCutoff = cutoffMs(auditRetentionDays());

  // Content / conversations (PII-bearing — shortest retention)
  results.push(pruneTable('chat_conversations', chatConversations, chatConversations.updatedAt, dataCutoff));
  results.push(pruneTable('code_conversations', codeConversations, codeConversations.updatedAt, dataCutoff));

  // Operational data
  results.push(pruneTable('usage_logs', usageLogs, usageLogs.timestamp, dataCutoff));
  results.push(pruneTable('usage_costs', usageCosts, usageCosts.timestamp, dataCutoff));
  results.push(pruneTable('async_jobs', asyncJobs, asyncJobs.createdAt, dataCutoff));
  results.push(pruneTable('search_queries', searchQueries, searchQueries.timestamp, dataCutoff));
  results.push(pruneTable('agent_runs', agentRuns, agentRuns.startedAt, dataCutoff));
  results.push(pruneTable('prompt_optimizations', promptOptimizations, promptOptimizations.timestamp, dataCutoff));

  // Audit logs (separate shorter retention)
  results.push(pruneTable('audit_logs', auditLogs, auditLogs.timestamp, auditCutoff));

  return results;
}

/**
 * Starts the periodic data retention pruner.
 * Call once during server boot (from bootstrap.ts).
 * Returns a handle for graceful shutdown.
 */
export function startRetentionPruner(): () => void {
  // Run once immediately on startup
  try {
    const results = pruneExpiredData();
    const total = results.reduce((s, r) => s + r.deleted, 0);
    if (total > 0) {
      logger.info({ deleted: total }, '[Retention] Initial prune complete');
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '[Retention] Initial prune failed');
  }

  intervalHandle = setInterval(() => {
    try {
      pruneExpiredData();
    } catch (error: any) {
      logger.error({ error: error.message }, '[Retention] Scheduled prune failed');
    }
  }, CONSTANTS.RETENTION_PRUNE_INTERVAL_MS);

  intervalHandle.unref();

  return () => {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  };
}
