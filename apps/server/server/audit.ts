import crypto from 'crypto';

export interface Database {
  exec: (sql: string) => void;
  prepare: (sql: string) => any;
  transaction: (fn: () => void) => () => void;
}

interface AuditEvent {
  id: string;
  timestamp: number;
  userId: string;
  action: string;
  resource: string;
  details: any;
  ip: string;
  userAgent: string;
  success: boolean;
}

export class AuditLogger {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        details TEXT,
        ip TEXT,
        user_agent TEXT,
        success INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, timestamp);
    `);
  }

  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    this.db.prepare(`
      INSERT INTO audit_log (id, timestamp, user_id, action, resource, details, ip, user_agent, success)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      timestamp,
      event.userId,
      event.action,
      event.resource,
      JSON.stringify(event.details),
      event.ip,
      event.userAgent,
      event.success ? 1 : 0
    );
  }

  query(filters: { userId?: string; action?: string; startTime?: number; endTime?: number; limit?: number }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      sql += ' AND user_id = ?';
      params.push(filters.userId);
    }
    if (filters.action) {
      sql += ' AND action = ?';
      params.push(filters.action);
    }
    if (filters.startTime) {
      sql += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }
    if (filters.endTime) {
      sql += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    sql += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params) as AuditEvent[];
  }
}

// Usage in middleware
export function auditMiddleware(auditLogger: AuditLogger) {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();

    res.on('finish', () => {
      auditLogger.log({
        userId: req.user?.id || 'anonymous',
        action: `${req.method} ${req.path}`,
        resource: req.path,
        details: {
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          body: req.body ? Object.keys(req.body) : undefined
        },
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        success: res.statusCode < 400
      });
    });

    next();
  };
}
