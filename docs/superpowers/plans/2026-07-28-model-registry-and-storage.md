# Local Model Registry DB & Namespace Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a persistent SQLite database registry table for local models and transition the models directory into a clean namespace structure.

**Architecture:** Create `local_models` table in SQLite during app startup. Expose Tauri commands to query/update local models. Update the file scanner to query the DB index first, and implement a self-healing background worker that processes legacy models.

**Tech Stack:** Rust, sqlx (SQLite), Tauri, React, TanStack Query

---

### Task 1: SQLite Table Definition & Model Struct

**Files:**
- Modify: `src-tauri/src/db/pool.rs`
- Modify: `src-tauri/src/db/models.rs`

- [ ] **Step 1: Define `local_models` table in SQLite schema**
  Modify `src-tauri/src/db/pool.rs` to include the `local_models` table creation script inside the `init_db_pool` schema block:
  ```sql
  CREATE TABLE IF NOT EXISTS local_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_id TEXT,
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      model_type TEXT NOT NULL,
      architecture TEXT,
      context_length INTEGER,
      has_mmproj INTEGER DEFAULT 0,
      downloaded_at INTEGER NOT NULL,
      last_used_at INTEGER,
      use_count INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      tags TEXT,
      preset_config TEXT
  );
  ```

- [ ] **Step 2: Add `LocalModel` struct in db models**
  Modify `src-tauri/src/db/models.rs` to add the `LocalModel` struct:
  ```rust
  #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
  pub struct LocalModel {
      pub id: String,
      pub name: String,
      pub repo_id: Option<String>,
      pub filename: String,
      pub file_path: String,
      pub size_bytes: i64,
      pub model_type: String,
      pub architecture: Option<String>,
      pub context_length: Option<i32>,
      pub has_mmproj: i32,
      pub downloaded_at: i64,
      pub last_used_at: Option<i64>,
      pub use_count: i32,
      pub rating: i32,
      pub is_favorite: i32,
      pub tags: Option<String>,
      pub preset_config: Option<String>,
  }
  ```

- [ ] **Step 3: Run cargo check to verify compilation**
  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: Success with no schema compilation errors.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/db/pool.rs src-tauri/src/db/models.rs
  git commit -m "db: define local_models table and struct model mapping"
  ```

---

### Task 2: Implement Tauri Registry Commands

**Files:**
- Modify: `src-tauri/src/commands/db.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add registry DB commands to commands/db.rs**
  Modify `src-tauri/src/commands/db.rs` to append command functions:
  ```rust
  use crate::db::models::LocalModel;

  #[tauri::command]
  pub async fn db_get_local_models(
      pool: State<'_, SqlitePool>,
  ) -> Result<Vec<LocalModel>, String> {
      let models = sqlx::query_as::<_, LocalModel>(
          "SELECT * FROM local_models ORDER BY downloaded_at DESC"
      )
      .fetch_all(&*pool)
      .await
      .map_err(|e| e.to_string())?;
      Ok(models)
  }

  #[tauri::command]
  pub async fn db_upsert_local_model(
      pool: State<'_, SqlitePool>,
      model: LocalModel,
  ) -> Result<(), String> {
      sqlx::query(
          "INSERT INTO local_models (id, name, repo_id, filename, file_path, size_bytes, model_type, architecture, context_length, has_mmproj, downloaded_at, last_used_at, use_count, rating, is_favorite, tags, preset_config)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name=excluded.name, repo_id=excluded.repo_id, filename=excluded.filename, file_path=excluded.file_path,
             size_bytes=excluded.size_bytes, model_type=excluded.model_type, architecture=excluded.architecture,
             context_length=excluded.context_length, has_mmproj=excluded.has_mmproj, downloaded_at=excluded.downloaded_at,
             last_used_at=excluded.last_used_at, use_count=excluded.use_count, rating=excluded.rating,
             is_favorite=excluded.is_favorite, tags=excluded.tags, preset_config=excluded.preset_config"
      )
      .bind(&model.id)
      .bind(&model.name)
      .bind(&model.repo_id)
      .bind(&model.filename)
      .bind(&model.file_path)
      .bind(model.size_bytes)
      .bind(&model.model_type)
      .bind(&model.architecture)
      .bind(model.context_length)
      .bind(model.has_mmproj)
      .bind(model.downloaded_at)
      .bind(model.last_used_at)
      .bind(model.use_count)
      .bind(model.rating)
      .bind(model.is_favorite)
      .bind(&model.tags)
      .bind(&model.preset_config)
      .execute(&*pool)
      .await
      .map_err(|e| e.to_string())?;
      Ok(())
  }

  #[tauri::command]
  pub async fn db_update_model_preset(
      pool: State<'_, SqlitePool>,
      id: String,
      preset_config: String,
  ) -> Result<(), String> {
      sqlx::query("UPDATE local_models SET preset_config = ? WHERE id = ?")
          .bind(preset_config)
          .bind(id)
          .execute(&*pool)
          .await
          .map_err(|e| e.to_string())?;
      Ok(())
  }

  #[tauri::command]
  pub async fn db_update_model_metadata(
      pool: State<'_, SqlitePool>,
      id: String,
      rating: i32,
      is_favorite: i32,
      tags: String,
  ) -> Result<(), String> {
      sqlx::query("UPDATE local_models SET rating = ?, is_favorite = ?, tags = ? WHERE id = ?")
          .bind(rating)
          .bind(is_favorite)
          .bind(tags)
          .bind(id)
          .execute(&*pool)
          .await
          .map_err(|e| e.to_string())?;
      Ok(())
  }

  #[tauri::command]
  pub async fn db_delete_local_model(
      pool: State<'_, SqlitePool>,
      id: String,
  ) -> Result<(), String> {
      sqlx::query("DELETE FROM local_models WHERE id = ?")
          .bind(id)
          .execute(&*pool)
          .await
          .map_err(|e| e.to_string())?;
      Ok(())
  }
  ```

- [ ] **Step 2: Register commands in main.rs**
  Modify `src-tauri/src/main.rs` to register the commands inside the `.invoke_handler(tauri::generate_handler![...])` builder call:
  ```rust
  // Add imports
  use crate::commands::db::{
      db_get_local_models,
      db_upsert_local_model,
      db_update_model_preset,
      db_update_model_metadata,
      db_delete_local_model,
  };

  // Add into generate_handler!
  db_get_local_models,
  db_upsert_local_model,
  db_update_model_preset,
  db_update_model_metadata,
  db_delete_local_model,
  ```

- [ ] **Step 3: Run cargo check to verify compilation**
  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: Success.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/commands/db.rs src-tauri/src/main.rs
  git commit -m "db: add Tauri command handlers for local model registry CRUD"
  ```

---

### Task 3: Restructure Storage & Update Server Scanner

**Files:**
- Modify: `src-tauri/src/llm/local_orchestrator.rs`

- [ ] **Step 1: Update GGUF parser to run in block pool**
  Modify `local_orchestrator.rs` to ensure `parse_gguf_metadata` executes using `tokio::task::spawn_blocking` to avoid synchronous blocks.

- [ ] **Step 2: Restructure directory paths in `list_local_models`**
  Modify `list_local_models` in `local_orchestrator.rs` to read from namespaced directories:
  - Text LLMs: `models/llm/{owner}/{repo}/`
  - VAEs: `models/vae/{owner}/{repo}/`
  - Text Encoders: `models/text_encoders/{owner}/{repo}/`
  - Projectors: `models/projectors/{owner}/{repo}/`

- [ ] **Step 3: Implement DB caching logic in `list_local_models`**
  Modify `list_local_models` to check the SQLite registry table first instead of calling `scan_folder_fast` on every load event. Only perform scanning for new files that have not yet been registered.

- [ ] **Step 4: Implement self-healing directory organizer**
  Add a helper migration function that runs on startup. It scans the root `models/` directory. If any GGUF file is found at the root level, it auto-parses its headers, moves the file into `models/llm/unorganized/`, and inserts it into the `local_models` DB table automatically.

- [ ] **Step 5: Run cargo check to verify compilation**
  Run: `cargo check --manifest-path src-tauri/Cargo.toml`
  Expected: Success.

- [ ] **Step 6: Commit**
  ```bash
  git add src-tauri/src/llm/local_orchestrator.rs
  git commit -m "db: namespace local model directories and implement DB-first scanning"
  ```

---

### Task 4: Connect UI Query Hooks

**Files:**
- Modify: `apps/web/src/shared/hooks/useLocalModels.ts`

- [ ] **Step 1: Bind useLocalModels to Tauri DB commands**
  Modify `apps/web/src/shared/hooks/useLocalModels.ts` to fetch using `db_get_local_models` instead of `list_local_models`:
  ```typescript
  export function useLocalModels(enabled: boolean = true) {
    return useQuery({
      queryKey: ['localModels'],
      queryFn: async () => {
        try {
          const models: any[] = await invoke('db_get_local_models');
          // Map backend LocalModel fields back to frontend structure
          const formattedModels = models.map((m) => {
            const rawCtx = m.context_length || 4096;
            const contextWindow = formatContextWindow(rawCtx, m.name);
            const specs = inferModelSpecs(m.name);

            return {
              ...m,
              specs: {
                ...specs,
                contextWindow,
                size: (m.size_bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
              },
              capabilities: specs.capabilities,
              status: m.status || 'completed',
              features: [
                'Local',
                m.model_type === 'text-to-image'
                  ? 'Diffusion'
                  : m.model_type === 'onnx'
                  ? 'ONNX'
                  : m.model_type === 'pytorch'
                  ? 'PyTorch'
                  : 'GGUF',
              ],
              pros: ['Private', 'Fast', 'No Cloud'],
              cons: ['Requires RAM/VRAM'],
            };
          });
          return { models: formattedModels };
        } catch (e) {
          console.error('Failed to fetch local models from DB', e);
          return { models: [] };
        }
      },
      refetchInterval: enabled ? 3_000 : false,
      staleTime: 0,
      gcTime: 300_000,
      enabled,
    });
  }
  ```

- [ ] **Step 2: Run frontend TypeScript compilation check**
  Run: `cd apps/web && npx tsc --noEmit --project tsconfig.json`
  Expected: Success with no types/compilation errors.

- [ ] **Step 3: Commit**
  ```bash
  git add apps/web/src/shared/hooks/useLocalModels.ts
  git commit -m "feat: hook local models catalog to SQLite registry DB"
  ```
