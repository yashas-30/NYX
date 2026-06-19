import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import crypto from 'crypto';
import logger from './logger.js';

type AuditCategory =
  | 'api_key_usage'
  | 'file_write_attempt'
  | 'terminal_command'
  | 'authentication'
  | 'safety_gate'
  | 'data_access';
type AuditStatus = 'success' | 'failure' | 'blocked' | 'executed';

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
          where: (logs: any, { eq }: any) => eq(logs.category, category),
          orderBy: (logs: any, { desc }: any) => [desc(logs.timestamp)],
          limit,
        });
      }
      return await db.query.auditLogs.findMany({
        orderBy: (logs: any, { desc }: any) => [desc(logs.timestamp)],
        limit,
      });
    } catch (error: any) {
      logger.error('[AuditLog] Failed to fetch audit logs:', error.message);
      return [];
    }
  }
}
