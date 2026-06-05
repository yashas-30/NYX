export interface Database {
  exec: (sql: string) => void;
  prepare: (sql: string) => any;
  transaction: (fn: () => void) => () => void;
}

interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
        INSERT INTO schema_version (version) VALUES (1);
      `);
    }
  },
  {
    version: 2,
    name: 'add_usage_logs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          model_id TEXT NOT NULL,
          prompt_tokens INTEGER,
          completion_tokens INTEGER,
          total_tokens INTEGER,
          latency_ms INTEGER,
          cost_usd REAL,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_logs(provider, timestamp);
      `);
    }
  },
  {
    version: 3,
    name: 'add_evolved_rules',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS evolved_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric TEXT NOT NULL,
          critique TEXT NOT NULL,
          rule TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          hit_count INTEGER DEFAULT 0,
          last_used INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_rules_metric ON evolved_rules(metric);
      `);
    }
  }
];

export function runMigrations(db: Database): void {
  // Get current version
  let currentVersion;
  try {
    currentVersion = db.prepare('SELECT version FROM schema_version').get() as any;
  } catch (e) {
    // If table doesn't exist yet, version is 0
    currentVersion = null;
  }
  const version = currentVersion?.version || 0;

  // Apply pending migrations
  for (const migration of MIGRATIONS) {
    if (migration.version > version) {
      console.log(`[Migration] Applying ${migration.name} (v${migration.version})...`);

      db.transaction(() => {
        migration.up(db);
        db.prepare('UPDATE schema_version SET version = ?').run(migration.version);
      })();

      console.log(`[Migration] Applied ${migration.name}`);
    }
  }
}
