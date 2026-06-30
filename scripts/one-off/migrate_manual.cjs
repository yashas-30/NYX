const Database = require('better-sqlite3');
const db = new Database('.nyx-state/nyx.db');
db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
    id text PRIMARY KEY NOT NULL,
    category text NOT NULL,
    event text NOT NULL,
    status text NOT NULL,
    agent_run_id text,
    timestamp integer NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_file_writes (
    id text PRIMARY KEY NOT NULL,
    agent_run_id text NOT NULL,
    file_path text NOT NULL,
    content text NOT NULL,
    diff text,
    status text NOT NULL,
    created_at integer NOT NULL
);
`);
console.log('Done!');
