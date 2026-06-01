# ADR 001: Transition to WAL-Mode SQLite Database with Drizzle ORM

## Context and Problem Statement

NYX previously managed chat histories, custom configurations, and interaction logs using temporary in-memory structures mirrored directly to flat `.json` file stores on the user's local disk (e.g., `conversations.json`).

While simple to implement, this pattern suffered from several architectural constraints:

1. **Concurrency and Lockups:** Simultaneous read/write disk accesses caused periodic lockups, especially during high-speed assistant response streaming.
2. **Data Integrity Risks:** Power outages or unexpected application shutdowns mid-write risked corrupting the entire JSON flat-file history.
3. **Inefficient Querying:** Loading complete chat logs just to list thread titles in the sidebar created significant memory and CPU overhead.
4. **Poor Extensibility:** Adding relationships (e.g., matching messages to provider usage logs or model presets) required complex, manual object-relational mapping.

## Decision Drivers

- **Performance:** Ensure high-speed, parallel reads and non-blocking writes for seamless streaming.
- **Reliability:** Maintain strict transactional ACID guarantees to prevent data corruption.
- **Portability:** Keep the database local and self-contained within the client's state scope (zero external database service dependencies).
- **Type-Safety:** Ensure compile-time type checked database queries that integrate perfectly with our hardened strict-mode TypeScript pipeline.

## Considered Alternatives

1. **Flat-File JSON with mutex locks:** Safe from concurrent writes, but extremely slow and doesn't scale to long chat histories.
2. **IndexedDB:** Runs in the client browser process, but is difficult to access from the Electron main and Express/Fastify server-side background processes.
3. **SQLite with raw SQL / Better-SQLite3:** High performance and local, but lacks type-safe schemas and automatic migration management.

## Decision Outcome

We decided to adopt **SQLite backed by the high-performance `better-sqlite3` driver wrapped in the Drizzle ORM client** under the following rules:

1. **Write-Ahead Logging (WAL):** Enable SQLite's WAL journal mode to support massive concurrent reads alongside non-blocking writes.
2. **Programmatic Startup Migrations:** Integrate automatic, programmatic migrations inside the server initialization lifecycle (`migrator.ts`) so schema updates ship transparently in standard desktop packages.
3. **Automatic First-Run Import:** Write a transaction-backed legacy porting routine that imports old `.json` conversations into SQLite on boot and renames the flat file as a backup.
4. **Foreign Key Cascades:** Enable strict SQLite foreign keys to automatically clean up orphaned messages on conversation deletions.
