# Design Specification: Local Model Registry DB & Namespace Storage

**Date:** July 28, 2026  
**Status:** Approved  
**Sub-project:** 1 of 5 (NYX Local Model Manager Modernization)

---

## 1. Goal Description

This specification outlines the transition of NYX's local model discovery and management system from a flat, unindexed filesystem folder to a persistent **SQLite Database Registry** and a structured **Namespaced Storage Taxonomy**. 

This foundation resolves:
- UI lag caused by recursive directory walks and GGUF header reading every 2 seconds.
- Memory/context parameter volatility (user presets resetting on app restart).
- Root directory clutter and filename conflicts when downloading shared auxiliary assets (like diffusion VAEs, text encoders, and vision projectors).

---

## 2. Technical Specification

### A. Database Schema (`src-tauri/src/db/pool.rs` & `models.rs`)
A new SQLite database table `local_models` will be added to index downloaded files, track usage stats, and persist custom model presets.

```sql
CREATE TABLE IF NOT EXISTS local_models (
    id TEXT PRIMARY KEY,               -- Unique identifier (e.g. "bartowski/Llama-3.2-1B-Instruct-Q4_K_M.gguf")
    name TEXT NOT NULL,                -- User-facing display name
    repo_id TEXT,                      -- HuggingFace repo ID (e.g. "bartowski/Llama-3.2-1B-Instruct")
    filename TEXT NOT NULL,            -- Original file name
    file_path TEXT NOT NULL,           -- Relative path inside models/ directory
    size_bytes INTEGER NOT NULL,       -- File size on disk
    model_type TEXT NOT NULL,          -- 'text-generation' | 'vision' | 'text-to-image' | 'onnx' | 'pytorch'
    architecture TEXT,                 -- e.g. 'llama', 'qwen2', 'flux', 'sdxl'
    context_length INTEGER,            -- Dynamic context length window limit
    has_mmproj INTEGER DEFAULT 0,      -- 1 if linked projector exists, else 0
    downloaded_at INTEGER NOT NULL,    -- Timestamp of download completion
    last_used_at INTEGER,              -- Timestamp of last server load
    use_count INTEGER DEFAULT 0,       -- Total load count
    rating INTEGER DEFAULT 0,          -- User star rating (0-5)
    is_favorite INTEGER DEFAULT 0,     -- 1 if starred, else 0
    tags TEXT,                         -- JSON array of user tags e.g. '["coding", "agent"]'
    preset_config TEXT                 -- JSON map of custom load arguments (ngl, context overrides)
);
```

#### Struct Model Mapping (`models.rs`):
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

---

### B. Namespaced Directory Restructuring

To support shared companion files and clean up the flat `models/` root, model weights and helper files will reside in subfolders matching their task and repository namespace:

```
~/.nyx-models/models/
├── llm/                            # LLM checkpoints
│   └── {owner}/{repo}/
│       └── *.gguf
├── diffusion/                      # Diffusion checkpoints (UNet, DiT)
│   └── {owner}/{repo}/
│       └── *.safetensors
├── vae/                            # Shared Autoencoders / VAEs
│   └── {owner}/{repo}/
│       └── ae.safetensors
├── text_encoders/                  # Shared text encoders (CLIP, T5)
│   └── {owner}/{repo}/
│       └── *.safetensors
└── projectors/                     # Multimodal CLIP projection models (mmproj)
    └── {owner}/{repo}/
        └── mmproj-*.gguf
```

---

### C. Tauri IPC Database Commands (`src-tauri/src/commands/db.rs`)

We will expose Tauri commands to perform CRUD actions on local models:

1. **`db_get_local_models`**: Returns all indexed local models.
2. **`db_upsert_local_model`**: Adds/updates a model in the index registry. Called upon download completion or manual file registration.
3. **`db_update_model_preset`**: Saves custom NGL / context overlays for a model in `preset_config`.
4. **`db_update_model_metadata`**: Updates rating, favorite state, tags, or name.
5. **`db_delete_local_model`**: Removes a model record from the SQLite registry.

---

### D. Upgraded Directory Scanner & Sync Logic (`local_orchestrator.rs`)

1. **DB-First Directory Listing**:
   `list_local_models` will check the `local_models` DB table first. Disk directory tree scans will only run on cache misses or manual refresh requests, dropping listing execution time to **<1ms**.
   
2. **Tokio Blocking Thread Pool**:
   Synchrous metadata parsing (`parse_gguf_metadata`) will be wrapped in `tokio::task::spawn_blocking` to prevent blocking the async runtime loop.

3. **Self-Healing Index & Migration**:
   On startup, a background worker will scan `app_data_dir/models` for unindexed files.
   - Any raw `.gguf` file found in the flat root directory will be automatically parsed, moved to the new `models/llm/unorganized/` subfolder, and indexed into the DB table.
   - This ensures backward compatibility for users with existing models.

---

## 3. Verification Plan

### Automated Verification
- Verify SQLite table creation on backend startup using logs.
- Run `cargo check --manifest-path src-tauri/Cargo.toml` to verify database integrations compile successfully.
- Validate React frontend compilation with `npx tsc --noEmit` after connecting the query hooks to the new Tauri commands.

### Manual Verification
1. Verify model library renders properly and reads from the database.
2. Change a model's NGL slider, restart the app, and verify settings persist.
3. Drag-and-drop an external `.gguf` file into the models folder and verify it self-heals, indexes, and moves to the correct subfolder.
4. Delete a model and check that both the file is removed and its database record is deleted.
