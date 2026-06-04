import { db } from '../db/client.ts';
import { auditLogs } from '../db/schema.ts';
import crypto from 'crypto';
import logger from './logger.ts';

type AuditCategory =
  | 'api_key_usage'
  | 'file_write_attempt'
  | 'terminal_command'
  | 'authentication'
  | 'safety_gate';
type AuditStatus = 'success' | 'failure' | 'blocked';

interface AuditLogOptions {
  category: AuditCategory;
  event: Record<string, any>;
  status: AuditStatus;
  agentRunId?: string;
}

export class AuditLog {
  static async log(options: AuditLogOptions): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const timestamp = Date.now();

      await db.insert(auditLogs).values({
        id,
        category: options.category,
        event: JSON.stringify(options.event),
        status: options.status,
        agentRunId: options.agentRunId,
        timestamp,
      });
    } catch (error: any) {
      logger.error('[AuditLog] Failed to write audit log:', error.message);
    }
  }

  static async getLogs(category?: AuditCategory, limit = 100) {
    try {
      if (category) {
        return await db.query.auditLogs.findMany({
          where: (logs, { eq }) => eq(logs.category, category),
          orderBy: (logs, { desc }) => [desc(logs.timestamp)],
          limit,
        });
      }
      return await db.query.auditLogs.findMany({
        orderBy: (logs, { desc }) => [desc(logs.timestamp)],
        limit,
      });
    } catch (error: any) {
      logger.error('[AuditLog] Failed to fetch audit logs:', error.message);
      return [];
    }
  }
}
