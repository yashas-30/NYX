# NYX Complete Codebase Analysis

> **Generated:** Comprehensive analysis of the entire NYX repository.  
> **Corpus:** ~6,343 files · ~6,937,000 words (per graphify)

---

## 1. What Is NYX?

**NYX** is a **premium AI coding environment and runner** that executes local LLMs on your GPU (via Vulkan/llama.cpp) and orchestrates cloud LLMs (Gemini, OpenRouter, etc.) under a unified interface. It targets developers who want Claude/Cursor-parity UX with the ability to run models locally.

### Key Selling Points
- Run **local GGUF models** (Llama 3, Qwen, Gemma, Mistral, Phi, DeepSeek) on your GPU — no Ollama or LM Studio needed
- **NYX Agent Swarm**: client-side multi-agent pipeline (Planner → SubagentSwarm → Optimizer)
- **Zero-delay SSE streaming** via Fastify (or Tauri Rust backend in current state)
- **Side-by-side model comparison** (A/B testing)
- **RAG over local codebases** with fastembed embeddings
- **Persistent semantic memory** stored in SQLite
- **Beautiful glassmorphism UI** with spring physics animations

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NYX v3.0.0                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│   │   Web App    │────▶│   Desktop    │────▶│   Tauri      │   │
│   │ (React 19)   │     │   Wrapper    │     │   Rust       │   │
│   │  Vite + TS   │     │  (@nyx/web)  │     │   Backend    │   │
│   └──────────────┘     └──────────────┘     └──────────────┘   │
│          │                                              │       │
│          │ Web / Tauri IPC                               │       │
│          ▼                                              ▼       │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              UNIFIED INFERENCE LAYER                  │       │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │       │
│   │  │  Cloud   │  │  Local   │  │  Agent   │            │       │
│   │  │ (Gemini) │  │ (llama.cpp│  │  Loop    │            │       │
│   │  │ (OpenRouter)│ │ Vulkan) │  │ (ReAct)  │            │       │
│   │  └──────────┘  └──────────┘  └──────────┘            │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              PERSISTENCE LAYER                        │       │
│   │  SQLite (WAL mode) + localStorage + Tauri Store     │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ⚠️ CRITICAL ARCHITECTURE NOTE
The **Fastify Node.js server has been removed** from the working tree. The project now runs as a **pure client-side SPA** with a **Tauri Rust backend** handling all server-side logic (local LLM inference, agent loops, file system, database). The old Fastify server code survives only in a Git worktree at `.worktrees/monorepo-consolidation/apps/server/`.

---

## 3. Monorepo Structure

### Workspace Layout (pnpm + Turborepo)

```
NYX/
├── apps/
│   ├── web/                    ← React 19 + Vite + Tailwind v4 (main app)
│   ├── desktop/                ← Tauri v2 wrapper (just imports @nyx/web)
│   └── web-legacy/             ← Dead/legacy app (only dist/ + node_modules/)
│
├── packages/
│   ├── config/                 ← Shared TypeScript config presets
│   ├── shared/                 ← Core types, schemas, model registry, prompt analysis
│   ├── ui/                     ← Design system (WIP — incomplete, unused)
│   └── uploads/                ← EMPTY DIRECTORY
│
├── src-tauri/                  ← Rust Tauri backend (the actual "server")
│   ├── src/
│   │   ├── commands/           ← ~55 Tauri invoke handlers
│   │   ├── db/                 ← SQLite persistence (sqlx + rusqlite)
│   │   ├── llm/                ← Local model management (llama-server)
│   │   ├── agents/             ← Native genai-based agent system
│   │   ├── rag/                ← RAG: embeddings, scanner, vector DB
│   │   └── ...
│   ├── Cargo.toml              ← 50+ Rust dependencies
│   └── tauri.conf.json
│
├── docs/
│   ├── adr/                    ← Architecture Decision Records
│   └── superpowers/            ← Feature plans + specs
│
├── docker/                     ← Sandbox Dockerfiles (Go, Node, Python, Rust)
├── k8s/                        ← Kubernetes manifests (orphaned — no backend)
├── monitoring/                 ← Grafana, Prometheus, Datadog, Kibana configs
├── scripts/                    ← Build + dev scripts
├── tests/                      ← Test suite (e2e, integration, load, mocks)
│
└── [ROOT CHAOS]                ← ~100+ files that shouldn't be here
```

### Workspace Packages

| Package | Path | Role | Status |
|---------|------|------|--------|
| `@nyx/web` | `apps/web/` | Main web frontend | **Active** |
| `@nyx/desktop` | `apps/desktop/` | Tauri desktop shell | **Active** (thin wrapper) |
| `@nyx/shared` | `packages/shared/` | Isomorphic types + logic | **Active** |
| `@nyx/config` | `packages/config/` | TS config presets | **Active** |
| `@nyx/ui` | `packages/ui/` | Design system | **Incomplete / Unused** |
| `@nyx/uploads` | `packages/uploads/` | Upload utilities | **Empty** |

---

## 4. Web Frontend Deep Dive (`apps/web/`)

### Tech Stack
| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript 6.0 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 + custom CSS variables |
| Animation | Framer Motion |
| State | Zustand (with `persist` middleware) |
| Data Fetching | TanStack Query (React Query) + custom fetch wrappers |
| Routing | React Router v7 (actually v6 with data APIs) |
| Icons | Lucide React + @animateicons/react + @phosphor-icons/react |
| Code Editor | Monaco Editor (@monaco-editor/react) |
| i18n | react-i18next |
| Desktop Bridge | @tauri-apps/api + plugins |
| Telemetry | Sentry (@sentry/react) |
| PWA | vite-plugin-pwa (Workbox) |
| Web Workers | Custom stream processor + embedding workers |

### Directory Structure

```
apps/web/src/
├── app/                          # Entry points
│   ├── main.tsx                  # React root, Sentry, Tauri bridge, error overlay
│   ├── App.tsx                   # Privacy mode, local LLM init, shared chat
│   ├── providers.tsx             # QueryClient, Router, Theme, TokenUsage
│   └── router.tsx                # Lazy-loaded routes (Chat, Models, Settings, Compare, Memory)
│
├── core/                         # Core business logic
│   ├── stores/                   # Zustand stores (chat, model, settings, usage)
│   ├── types/                    # Agent templates, project types
│   ├── services/                 # Browser service, debug logger
│   └── prompts/                  # Chat prompt templates
│
├── features/                     # Feature-based modules (PRIMARY ORGANIZATION)
│   ├── chat/                     # Chat UI, streaming pipeline, session management
│   │   ├── components/           # ChatPage, ChatMessageList, ChatPromptInput, etc.
│   │   ├── hooks/                # useChatPipeline, useChatLogic, useChatSessions
│   │   ├── agents/               # OpenHands agent loop, memory, supervisor
│   │   └── prompts/              # System prompts for chat
│   │
│   ├── model-registry/           # Model cards, comparison, HuggingFace downloader
│   │   ├── components/           # ModelCard, HardwareAnalyzerCard, HuggingFaceDownloader
│   │   └── ...
│   │
│   ├── settings/                 # Settings pages, API keys, hotkeys, workspace config
│   │   ├── components/           # ApiKeyVault, ModelSettingsSection, HotkeyManager
│   │   └── ...
│   │
│   ├── dashboard/                # App shell, sidebar, session list
│   │   ├── AppDashboard.tsx      # Collapsible sidebar, session tree, folders
│   │   └── useDashboardState.ts  # URL → mode mapping, API key loading
│   │
│   ├── ai/                       # AI services layer
│   │   ├── services/
│   │   │   ├── ai.service.ts     # UNIFIED INFERENCE (1151 lines) — circuit breaker, cache, dedup, fallbacks
│   │   │   ├── promptClassifier.ts # 1225 lines — intent, complexity, language, framework detection
│   │   │   ├── promptAnalysis.service.ts # 587 lines — 3-layer analysis (heuristic → embedding → LLM)
│   │   │   └── router.service.ts # AutoRouter — cost vs quality, complexity-based routing
│   │   └── ...
│   │
│   ├── agents/                   # Agent orchestrator UI
│   ├── artifacts/                # Artifact viewer & renderer (code, markdown, mermaid)
│   ├── voice/                    # Speech-to-text, TTS, VAD (@ricky0123/vad-web)
│   ├── memory/                   # Memory view panel
│   └── orchestrator/             # Orchestrator UI & hooks
│
├── infrastructure/               # API layer & transport
│   ├── api/
│   │   ├── authFetch.ts          # 468 lines — production fetch client with token refresh, circuit breaker, dedup
│   │   ├── inferenceClient.ts    # 570 lines — unified proxy client with SSE streaming
│   │   ├── directClient.ts       # 588 lines — direct browser-to-Gemini API client
│   │   ├── streamParser.ts       # 693 lines — universal SSE parser (OpenAI, Anthropic, Gemini)
│   │   └── coderApi.ts           # 455 lines — workspace file ops, command execution, path validation
│   ├── services/
│   │   ├── circuitBreaker.ts     # Per-provider circuit breaker
│   │   ├── continuationManager.ts  # Long prompt compression
│   │   └── hybridRouter.ts       # Cloud vs local routing
│   ├── types/                    # Agent type definitions
│   └── utils/                    # Compaction, provider resolution
│
├── shared/                       # Shared components, hooks, context
│   ├── components/               # Command palette, model selector, UI primitives
│   ├── hooks/                    # useAgentLightning, useChatSessions, useLocalModels
│   ├── context/                  # Theme context, token usage context
│   ├── store/                    # useNyxStore (151-action global store)
│   └── config/                   # Model definitions, coding knowledge
│
├── stores/                       # Legacy/secondary Zustand stores
├── hooks/                        # Generic hooks (WS, keyboard, media query)
├── types/                        # Domain types (models, agent, inference, shared)
├── views/                        # Top-level view wrappers (thin re-exports)
└── workers/                      # Web workers (stream processor, embedding)
```

### State Management (Zustand)

| Store | File | Purpose | Persistence |
|-------|------|---------|-------------|
| `useNyxStore` | `shared/store/useNyxStore.ts` | **Global app state** — 151 actions | `localStorage` (`nyx-global-state`) |
| `useChatStore` | `core/stores/useChatStore.ts` | Session management, folders, server sync | `localStorage` + server |
| `useModelStore` | `core/stores/useModelStore.ts` | Model selection, local model loading | `localStorage` |
| `useSettingsStore` | `core/stores/useSettingsStore.ts` | Chat/coder settings | `localStorage` |
| `useUsageStore` | `core/stores/useUsageStore.ts` | Rate limit tracking, RPM/TPM/RPD | `localStorage` |
| `useAppStore` | `stores/` | Legacy app state | `localStorage` |

**Key `useNyxStore` features:**
- `activeMode`: 15 modes (chat, coder, registry, settings, compare, memory, etc.)
- `executionMode`: auto, standard, parallel, ensemble, ab-test
- Dual-model selection: `cloudModelId` + `localModelId`
- API keys: in-memory + optional Tauri secure vault
- Privacy mode with auto-destruct timer
- Workspace path operations

### Routing

React Router v7 with **lazy-loaded** routes:

| Route | Component | Lazy |
|-------|-----------|------|
| `/` | `ChatView` | ✅ |
| `/chat` | → `/` redirect | — |
| `/models` | `ModelRegistryView` | ✅ |
| `/settings` | `SettingsView` | ✅ |
| `/compare` | `ModelComparisonView` | ✅ |
| `/memory` | `MemoryView` | ✅ |
| `/share/:id` | `SharedChatView` | ✅ |
| `*` | → `/` redirect | — |

### The Streaming Pipeline (The Heart of NYX)

```
User Input
    ↓
ChatPromptInput → useChatLogic
    ↓
useChatPipeline (1381+ lines)
    ├── analyzePrompt() → intent / complexity / language / framework
    ├── checkUsageLimits() → RPM/TPM/RPD guards
    ├── optimizeContextWindow() → token pruning / summarization
    ├── loadMemories() → long-term memory retrieval
    ├── determineRouting() → cloud vs local vs parallel
    ↓
AIService.execute() → directFetch / tauriLlmStream
    ↓
SSE Stream → parseSSEStream → Web Worker
    ↓
safeUpdateHistory → Zustand store → localStorage + Server
    ↓
ChatMessageList renders → ArtifactCanvas auto-opens <nyx_artifact>
```

### AI Service (`ai.service.ts`) — 1151 lines

The **crown jewel** of the frontend. A production-grade unified inference client:

- **Circuit breaker** per provider (5 failures → 30s open)
- **Request deduplication** with 30s TTL
- **Cache layer** — reads/writes to `/api/v1/cache/{get,set}`
- **Token counting** via `tiktoken` (cl100k_base) + fallback heuristic
- **Provider implementations**: Gemini (direct API), Local/Tauri (Rust IPC), OpenRouter, Pollinations fallback
- **Parallel execution**: `executeParallel()` — multi-model calls
- **Ensemble execution**: `executeEnsemble()` — synthesizes multiple outputs
- **Continuation support**: `compressPrompt()` for long inputs
- **Auto cache markers** for messages > 4000 tokens

### Prompt Analysis Engine

Three layers of prompt intelligence:

1. **promptClassifier.ts** (1225 lines) — Fast heuristic layer:
   - 18 intent types (code_generation, debug, refactor, architecture, web_search, etc.)
   - Language detection (18 languages)
   - Framework detection (50+ frameworks)
   - Complexity scoring (trivial → enterprise)
   - Hardware detection (Arduino, ESP32, Raspberry Pi, etc.)
   - Safety analysis (voltage mismatch, RAM constraints)

2. **promptAnalysis.service.ts** (587 lines) — Medium layer:
   - Embedding classifier using `transformers.js` (Xenova/all-MiniLM-L6-v2)
   - LLM router via Gemini API for complex cases
   - Tone, domain, expertise, urgency detection

3. **Hybrid Router** — Routes to optimal model based on cost/quality slider, complexity, and provider health.

### Feature Modules

| Feature | Key Components | Status |
|---------|---------------|--------|
| **Chat** | ChatPage, useChatPipeline, useChatLogic | **Complete** |
| **Model Registry** | ModelCard, HuggingFaceDownloader, HardwareAnalyzer | **Complete** |
| **Settings** | ApiKeyVault, HotkeyManager, McpSettings, CacheDashboard | **Complete** |
| **Dashboard** | AppDashboard, sidebar, session tree, folders | **Complete** |
| **Agents** | OpenHands agent loop, memory, supervisor | **Complete** |
| **Artifacts** | ArtifactCanvas, code renderer, mermaid | **Complete** |
| **Voice** | VAD, speech-to-text, TTS | **Complete** |
| **Memory** | Memory view, semantic search | **Complete** |
| **Orchestrator** | Orchestrator UI, useOrchestrator | **Complete** |

---

## 5. Desktop App (`apps/desktop/` + `src-tauri/`)

### Desktop Wrapper (`apps/desktop/`)

```json
{
  "name": "@nyx/desktop",
  "dependencies": { "@nyx/web": "workspace:*" }
}
```

That's it. The desktop app is a **thin wrapper** that imports `@nyx/web` and lets Tauri load it.

### Tauri Configuration (`src-tauri/tauri.conf.json`)

- Window: 1440×900, min 900×600, frameless, transparent, centered
- CSP: restrictive with `connect-src` to `127.0.0.1:*`, Google APIs, HuggingFace
- Bundles: NSIS (Windows), DMG (macOS), AppImage + DEB (Linux)
- Updater: configured to check GitHub releases (currently inactive)
- Resources: bundles `../dist` (the built web frontend)

### Rust Backend (`src-tauri/src/`)

#### Tech Stack
| Category | Crates |
|----------|--------|
| Tauri | tauri v2 + 12 plugins (shell, dialog, fs, http, store, updater, process, notification, opener, os, single-instance, window-state) |
| Async | tokio (full), tokio-util, futures-util |
| HTTP | reqwest (json + stream), eventsource-stream |
| Database | sqlx (SQLite, tokio-rustls), rusqlite, sqlite-vec |
| AI | genai v0.1.13, rig-core v0.4.0, tiktoken-rs |
| Embeddings | fastembed v5.17.2 |
| System | sysinfo, enigo (input automation), xcap (screenshots), image |
| Terminal | portable-pty |
| Security | keyring (OS credential store) |
| Web | scraper, urlencoding |
| Other | chrono, regex, base64, uuid, tokio-tungstenite, walkdir, notify, window-vibrancy |

#### File Structure

```
src-tauri/src/
├── main.rs                     # Entry point, AppState, Tauri builder, GPU forcing
├── ai_engine.rs                # Placeholder unified engine
├── research.rs                 # Deep research: DuckDuckGo scraper
├── tray.rs                     # System tray icon + menu
│
├── commands/                   # All Tauri invoke handlers (~55 commands)
│   ├── mod.rs                  # Re-exports
│   ├── agent.rs                # 30+ built-in tools + web search
│   ├── agent_orchestrator.rs   # ReAct loop with streaming, retries, cancellation
│   ├── app.rs                  # Version + external URL opener
│   ├── computer_use.rs         # Screenshot, mouse, keyboard automation
│   ├── dialog.rs               # Native folder picker
│   ├── fs.rs                   # File watcher, read/write/list, chunking
│   ├── llm.rs                  # Unified LLM streaming (multi-provider)
│   ├── mcp.rs                  # MCP server lifecycle + JSON-RPC tool calling
│   ├── pty.rs                  # Pseudo-terminal spawning
│   ├── system.rs               # System info, GPU info, command execution
│   ├── vault.rs                # Secure keyring-based API key storage
│   └── window.rs               # Window controls (min/max/close/hide/show)
│
├── db/                         # SQLite persistence
│   ├── mod.rs
│   ├── pool.rs                 # Connection pool + schema initialization
│   ├── models.rs               # sqlx FromRow structs
│   └── commands.rs             # CRUD for chat, sessions, memories, folders
│
├── llm/                        # Local model management
│   ├── mod.rs                  # Tauri commands for local model lifecycle
│   ├── manager.rs              # LlamaManager: spawn/kill llama-server
│   ├── downloader.rs           # Download llama-server-vulkan + default GGUF
│   ├── hf_downloader.rs        # HuggingFace download (resume/pause/cancel)
│   ├── gemini.rs               # Gemini provider (async_trait)
│   └── provider.rs             # LlmProvider trait
│
├── agents/                     # Native agent system (genai-based)
│   ├── mod.rs
│   ├── engine.rs               # AgentEngine: ReAct loop with tool calls
│   ├── memory.rs               # AgentMemory: message history management
│   ├── stream.rs               # Tauri command: start_native_agent
│   ├── tools.rs                # Agent tools (bash, read_file, RAG, web, scrape)
│   └── genai_test.rs           # Type-check stub
│
└── rag/                        # Retrieval-Augmented Generation
    ├── mod.rs
    ├── embeddings.rs            # fastembed (All-MiniLM-L6-v2) wrapper
    ├── scanner.rs               # CodebaseScanner: index workspace
    └── vector_db.rs             # In-memory vector DB + cosine similarity
```

#### Key Commands Registered (~55 total)

| Category | Commands |
|----------|----------|
| **Window** | minimize, maximize, close, show, hide |
| **File System** | fs_read_file, fs_write_file, fs_list_dir, fs_watch_start/stop, fs_parse_and_chunk_file |
| **System** | system_gpu_info, system_info, get_hardware_specs, execute_command |
| **Computer Use** | execute_computer_action (screenshot, mouse, keyboard) |
| **Vault** | vault_store_key, vault_get_key, vault_delete_key, vault_status, vault_list_keys |
| **MCP** | mcp_start_server, mcp_send_request, mcp_call_tool, mcp_stop_server, mcp_list_servers |
| **LLM** | llm_stream_request, orchestrate_supervisor, cancel_agent_loop |
| **Agent Tools** | run_agent_tool, approve_tool, reject_tool, resolve_plugin_tool, resolve_browser_action |
| **Local Models** | download_local_model, list_local_models, start/stop_local_server, hf_download_model, hf_pause/resume/cancel |
| **Database** | db_get_all_chat_sessions, db_save_chat_session, db_delete_chat_session, db_add/get/delete_memory, db_search_memories |
| **Research** | start_deep_research |

#### Agent Orchestrator (`agent_orchestrator.rs`)

The **ReAct agent loop** is the most sophisticated part of the Rust backend:

1. System prompt injection with `[SUPERVISOR INSTRUCTIONS]`
2. SSE streaming from provider
3. Tool call parsing from delta stream
4. **Parallel execution** — `futures_util::future::join_all`
5. **Destructive tool gating** — write/run commands require user approval via `tokio::sync::oneshot`
6. **Error handling** — 3 consecutive failures → force synthesis fallback
7. **Cancellation** — `AtomicBool` checked each iteration
8. **Timeout** — 5-minute hard limit
9. **Retries** — exponential backoff on 429/503
10. **Persistence** — tool results written to `swarm_context_pool`

**Built-in Tools (~30):**
- `web_search`, `fetch_page`, `web_scrape`, `web_browse`
- `read_file`, `write_file`, `edit_file`, `list_directory`, `grep_search`, `diff_files`
- `run_python`, `run_javascript`, `run_terminal_command`, `run_shell`, `run_test`, `lint_code`
- `get_system_info`, `take_screenshot`
- `run_mcp_tool`, `schedule_task`
- `read_pdf`, `read_docx`
- `create_presentation`, `create_spreadsheet`
- `generate_image`, `edit_image`, `analyze_image`
- `browser_click`, `browser_type`, `browser_get_html`, `browser_screenshot`

#### Local Model Server (`llm/manager.rs`)

**LlamaManager** spawns `llama-server-vulkan.exe` with:
- `-ngl 999` (max GPU layers)
- `--port 8080`
- `--ctx-size 8192`
- `--cache-type-k q8_0 --cache-type-v q8_0`
- `--batch-size 512 --ubatch-size 512`
- `-t 8` (threads)
- Auto warmup request after 200ms

#### HuggingFace Downloader (`llm/hf_downloader.rs`)

- Resume/pause/cancel support
- `.part` files for partial downloads
- Range headers for resume
- `downloads.json` persistence
- Progress tracking via Tauri `Channel`

#### RAG System (`rag/`)

1. **CodebaseScanner** (`scanner.rs`): Walks `.ts/.tsx/.js/.jsx/.rs/.md/.json/.py`, chunks first 2000 chars
2. **Embeddings** (`embeddings.rs`): `fastembed` (All-MiniLM-L6-v2) async wrapper
3. **Vector DB** (`vector_db.rs`): In-memory `HashMap<String, VectorRecord>` with cosine similarity, serialized to JSON

#### Database Schema (`db/`)

SQLite with WAL mode:
- `chat_conversations` — id, title, model, folder_id, tags, share_id, timestamps
- `chat_folders` — id, name, created_at
- `chat_messages` — id, conversation_id, parent_id, role, content, model, is_pinned, timestamp, token_usage, attachments, feedback
- `swarm_context_pool` — Agent memory per session
- `long_term_memories` — id, fact, category, embedding (JSON), created_at

Memory search uses cosine similarity computed in Rust over deserialized JSON embeddings.

#### AppState (Global Managed State)

```rust
pub struct AppState {
    pub mcp_manager: Arc<commands::mcp::McpManager>,
    pub pty_state: Arc<Mutex<HashMap<String, PtySession>>>,
    pub agent_cancel: Arc<AtomicBool>,
    pub pending_approvals: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
    pub pending_plugin_tools: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
    pub pending_browser_actions: Arc<Mutex<HashMap<String, oneshot::Sender<String>>>>,
}
```

---

## 6. Shared Packages (`packages/`)

### `@nyx/shared` — The Backbone

**Build:** `tsup` → `dist/index.{js,cjs,d.ts}`

**Exports:**
1. **types.ts** — Zod schemas for `ChatMessage`, `AISettings`, `ModelOption`, `ModelSpecs`, `TelemetryMetrics`
2. **models.ts** — Model registry (14 entries: Gemini, Gemma, NYX Native, aliases)
3. **provider.ts** — Provider detection, health tracking, circuit-breaker logic, capability detection
4. **promptAnalyzer.ts** — 1,624-line isomorphic prompt analysis engine:
   - 11 intent types, 5 complexity levels
   - 25+ language detection, 50+ framework detection
   - Hardware detection (Arduino, ESP32, Raspberry Pi, etc.)
   - Hardware safety analysis (voltage, RAM, I2C)
   - Prompt optimization templates

**Constants:**
- `PORTS`: WEB 3000, API 3010, FASTIFY 3001, SCRAPLING 3002, FALLBACK 12345
- `CONTEXT_SIZES`: DEFAULT 2048, COMPLEX 4096, ENTERPRISE 8192
- `LOCAL_MODEL_PORT`: 12345

### `@nyx/config` — TypeScript Presets

| Config | Extends | Key Settings |
|--------|---------|-------------|
| `tsconfig.base.json` | — | `target: ES2022`, `module: NodeNext`, `strict: true` |
| `tsconfig.react.json` | base | `jsx: react-jsx`, `lib: [ES2022, DOM]` |
| `tsconfig.node.json` | base | `lib: [ES2022]`, `types: [node]` |
| `tsconfig.lib.json` | base | `declaration`, `declarationMap`, `sourceMap` |

### `@nyx/ui` — Design System (WIP)

**Status: INCOMPLETE**
- Has `Button`, `Input` components with `class-variance-authority`
- Has design tokens (animations, colors, spacing, typography)
- **Missing:** `package.json`, `utils/cn.ts`, exports
- **Not consumed** by `@nyx/web` — the web app uses inline Tailwind instead

### `@nyx/uploads` — Empty

Completely empty directory. No package.json, no source files.

---

## 7. The Server Situation (CRITICAL)

### ⚠️ What the README Says

The README and `ARCHITECTURE.md` describe a **Fastify 5 backend** at `apps/server/` with:
- `server/lib/unifiedEngine.ts` — unified inference coordinator
- `server/lib/logger.ts` — Pino logger with API key redaction
- `server/middleware/requestSigner.ts` — HMAC-based request signing
- `server/db/schema.sqlite.ts` — SQLite schema via Drizzle ORM
- 20+ feature modules (agents, auth, cache, chat, conversations, files, graphql, local-models, etc.)

### ❌ What Actually Exists

**The `apps/server/` directory DOES NOT EXIST in the working tree.**

The Fastify server was progressively removed during a migration to Tauri:
```
git log: move to tauri → fixes and migration → major overhaul → overhaul
```

The server code survives only in:
1. **Git worktree**: `.worktrees/monorepo-consolidation/apps/server/` — full source preserved
2. **Compiled bundles**: `src-tauri/target/*/dist-server/server.mjs` (~593 KB) and `server.cjs` (~5.4 MB)
3. **MONOREPO_MIGRATION_BASELINE.md** — snapshot of the migration state

### 🎭 Current Dev Mode

The `vite.config.ts` contains a **mock backend plugin** that intercepts `/api/*` requests and returns hardcoded JSON:

```typescript
// Mock responses for:
// /vault/token → { token: 'mock-token-for-ui-testing' }
// /vault/validate → { valid: true }
// /memory → { memories: [...] }
// /conversations → []
// /nyx/local-models → { models: [], status: 'offline' }
```

The **real proxy** to the Fastify server is **commented out**.

### 🏗️ Infrastructure Files (Orphaned)

| File | Status | Problem |
|------|--------|---------|
| `Dockerfile` | **Broken** | References `apps/server/dist` which doesn't exist |
| `docker-compose.yml` | **Stale** | References Redis, exposes port 3000 |
| `nginx.conf` | **Orphaned** | Expects `nyx-server:3000` upstream |
| `k8s/deployment.yaml` | **Orphaned** | References `nyx-backend:latest` on port 3010 |
| `scripts/build-server.js` | **Broken** | References deleted `server.ts` and `server/python/` |
| `tests/integration/api.test.ts` | **Broken** | Imports deleted `apps/server/server/lib/fastifyConfig.js` |
| `CONTRIBUTING.md` | **Stale** | Says `pnpm run dev` starts both frontend and Fastify backend |
| `README.md` | **Stale** | Mentions `apps/server/` architecture |

---

## 8. Embedded Foreign Projects (Should Be Extracted)

Four separate projects are embedded inside the monorepo:

### 1. `animateicons_temp/`
- Full independent project with its own `.git/`, `.github/`, `.changeset/`
- 15+ directories: actions, app, cli, components, core, data, hooks, icons, lib, mcp, npm, public, scripts, tests, types, utils
- **Action:** Should be a separate repo or under `examples/`

### 2. `claude-obsidian/`
- Obsidian vault with `.obsidian/`, `.vault-meta/`, `wiki/`, `agents/`, `skills/`, `commands/`, `scripts/`
- Has its own `.git_disabled` (disabled git repo)
- **Action:** Completely separate domain — extract to own repo

### 3. `nyx-antigravity-extension/`
- Browser extension with its own `.fallow/` config
- Has `src/` directory
- **Action:** Extract to own repo or `extensions/`

### 4. `test_genai_bin/`
- Rust binary project with `src/` and `target/`
- **Action:** Should be a standalone test project or move to `tools/`

---

## 9. Root Directory Chaos

### ~100+ Files That Shouldn't Be at Root

**One-off scripts / migration debris (~25 files):**
```
analyze_clones.py, extract_panel.py, fix_dupes.py, fix_server.py, fix_server_2.py,
fix_ts.cjs, fix_tsc_errors.js, generate_pdf.cjs, implement_features.cjs,
migrate_manual.cjs, migrate_prompt.cjs, migrate_prompt.js, migrate_prompt.ts,
refactor_routers.cjs, revert_extensions.cjs, rewrite-port.cjs,
rewrite-unified.cjs, rewrite-vram.cjs, rewrite.cjs, suppress_clones.cjs, suppress_clones.py
```

**Tool output files (~65 files):**
```
batch_0.json → batch_4.json (5 files)
partition_0.json → partition_44.json (45 files)
fallow_*.json (6 files)
lint_output*.txt (2 files)
typecheck_output*.txt (4 files)
typescript_errors.txt, partition_clones.cjs, payload.json
```

**Temporary / scratch files:**
```
temp.ts, temp_transcript.txt, test.txt, ddg.html, help.txt, panel.txt,
diff.txt, server.ts.bak, scratch.py
```

**Audit / export artifacts:**
```
nyx_audit.md, nyx_audit.pdf, nyx_codebase_audit.pdf,
NYX_Codebase_For_AI_Studio.md (2MB), NYX_Project_For_AI_Studio.zip
```

**Weird filename:**
```
C:Usersyasha.claudeplanshumming-coalescing-stream-agent-ad5a9f3504ecf39c9.md
```

---

## 10. Design System

### Two Competing Design Systems

1. **NYX Native Design** (from README + actual UI):
   - Dark-first: `#0c0c0e` / `#131315` backgrounds
   - Glassmorphism: `bg-zinc-900/85` with `backdrop-blur-xl` and `border-white/8`
   - Accents: `#0ea5e9` (blue-500) for GPU, `#8b5cf6` (violet-500) for AI
   - Typography: Geist Variable (mono-sans)
   - Animations: Framer Motion spring physics (`stiffness: 380, damping: 32`)

2. **Claude-style Design** (`DESIGN.md`):
   - Warm cream canvas: `#faf9f5`
   - Coral CTAs: `#cc785c`
   - Serif display: Copernicus / Tiempos Headline
   - **This appears to be a template/placeholder** — the actual UI does not use this design

### `PRODUCT.md` Design Principles
- **Utility First**: High information density, scan-friendly
- **Clinical Contrast**: Tinted neutrals, not pure black/white
- **Intentional Spacing**: 8px grid, rhythmic hierarchy
- **Anti-references**: No SaaS-cream pastels, no decorative glassmorphism, no side-stripe borders

---

## 11. Key Features & Capabilities

### 11.1 Chat System
- **Streaming SSE** with universal parser (OpenAI, Anthropic, Gemini formats)
- **Multi-model support**: Gemini (direct), OpenRouter, Pollinations, Local (llama.cpp)
- **Artifacts**: Auto-detection of `<nyx_artifact>` tags, code rendering, mermaid diagrams
- **Tool calls**: Approval/rejection flow, parallel execution
- **Branching**: Conversation branches at any message
- **Memory**: Long-term memory retrieval from SQLite
- **Web search**: DuckDuckGo, Tavily, Jina AI integration
- **Export**: Markdown, JSON, TXT, HTML, Obsidian, Notion, GitHub Gist
- **Share**: Share conversations via URL

### 11.2 Model Management
- **Model registry**: 14 curated models with specs, rate limits, capabilities
- **HuggingFace downloader**: Resume/pause/cancel GGUF downloads
- **Hardware analyzer**: System specs, VRAM estimation
- **Side-by-side comparison**: A/B test two models
- **Local model server**: llama.cpp Vulkan with full GPU layer control

### 11.3 Agent System
- **ReAct loop**: Streaming, parallel tool execution, user approval, cancellation
- **30+ built-in tools**: File ops, terminal, web search, browser automation, code execution
- **MCP integration**: External tool servers via JSON-RPC
- **Native agent**: genai-based experimental agent with RAG
- **Deep research**: DuckDuckGo scraper with progress tracking

### 11.4 Coder Features
- **Workspace integration**: File read/write, directory listing, command execution
- **Path validation**: Prevents directory traversal, null bytes, enforces absolute paths
- **Codebase knowledge**: RAG indexing of workspace files
- **Terminal**: PTY spawning via Tauri or HTTP API
- **Branching**: Conversation branches for different code approaches

### 11.5 Security
- **API key vault**: OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Privacy mode**: Auto-destruct session after 5 minutes of inactivity
- **Request signing**: HMAC-based session token validation
- **Path validation**: Traversal attack prevention
- **Destructive tool gating**: User must approve write/run commands
- **Circuit breakers**: Per-provider failure isolation
- **Request deduplication**: Prevents duplicate API calls

### 11.6 Performance
- **Lazy loading**: All routes lazy-loaded
- **Web workers**: Stream processing off main thread
- **Debounced sync**: 1s batching for session persistence
- **Cache-first**: stale-while-revalidate for vault status
- **Context optimization**: Token pruning and summarization
- **Manual chunking**: Vite splits vendor bundles (icons, animation, charts, lottie, codemirror, syntax)

---

## 12. Data Flow

### Chat Request Flow
```
User types message
    ↓
ChatPromptInput (with file drop support)
    ↓
useChatLogic → analyzePrompt() → intent/complexity/language/framework
    ↓
useChatPipeline
    ├── checkUsageLimits() → RPM/TPM/RPD guards
    ├── optimizeContextWindow() → prune/summarize history
    ├── loadMemories() → SQLite / localStorage
    ├── determineRouting() → cloud vs local vs parallel
    ↓
AIService.execute()
    ├── Cloud path: directFetch → Gemini API → SSE stream
    ├── Local path: tauriLlmStream → llama-server → SSE stream
    ├── Parallel path: executeParallel() → multiple models
    └── Ensemble path: executeEnsemble() → synthesize outputs
    ↓
parseSSEStream → universal parser
    ↓
Web Worker → text processing
    ↓
safeUpdateHistory → Zustand store
    ↓
localStorage + Server (SQLite via Tauri IPC)
    ↓
ChatMessageList re-renders
    ↓
ArtifactCanvas auto-opens detected artifacts
```

### Tauri IPC Flow
```
Frontend: invoke('command_name', args)
    ↓
Tauri bridge → Rust backend
    ↓
Command handler (e.g., llm_stream_request)
    ↓
Process → emit events via Channel<T> or app.emit()
    ↓
Frontend: listen('event_name', callback)
```

---

## 13. Testing

| Test Suite | Location | Framework | Status |
|-----------|----------|-----------|--------|
| Unit tests | `packages/shared/tests/` | Vitest | **Working** |
| Component tests | `apps/web/` | Vitest + React Testing Library | **Configured** |
| E2E tests | `tests/e2e/`, `apps/web/e2e/` | Playwright | **Configured** |
| Integration tests | `tests/integration/api.test.ts` | Vitest | **BROKEN** (references deleted server) |
| Load tests | `tests/load/` | Unknown | **Present** |
| Mocks | `tests/mocks/` | MSW | **Present** |

---

## 14. Strengths

1. **Sophisticated AI streaming pipeline** — One of the most complete SSE implementations I've seen in a client-side app
2. **Dual-runtime architecture** — Clean separation between web and Tauri modes
3. **Prompt intelligence** — 3-layer analysis engine with language, framework, hardware detection
4. **Production reliability patterns** — Circuit breakers, deduplication, retries, fallbacks, caching
5. **Rich feature set** — Chat, coder, model registry, voice, memory, orchestrator, artifacts
6. **Security-conscious** — Vault storage, privacy mode, path validation, token management
7. **Local LLM integration** — llama.cpp Vulkan with full control over GPU layers, context, sampling
8. **Agent system** — ReAct loop with 30+ tools, MCP support, user approval gates
9. **RAG system** — fastembed embeddings, codebase scanner, in-memory vector DB
10. **Well-typed** — Extensive TypeScript with Zod schemas shared across frontend and backend

---

## 15. Weaknesses & Issues

1. **❌ Server has been deleted** — The README, ARCHITECTURE, Dockerfile, and many configs are stale. The app is currently a frontend-only mock.
2. **❌ Root directory is a dumping ground** — 100+ files of scripts, outputs, temps, and artifacts clutter the root.
3. **❌ Embedded foreign projects** — 4 separate projects (animateicons, claude-obsidian, antigravity-extension, test_genai) should be extracted.
4. **❌ Documentation is fragmented** — ARCHITECTURE.md (25 lines), architecture_overview.md (34KB), DESIGN.md (589 lines), plus multiple AI-specific context files (CLAUDE.md, GEMINI.md, etc.) compete for authority.
5. **❌ @nyx/ui is abandoned** — Incomplete design system with no package.json, no exports, missing dependencies.
6. **❌ @nyx/uploads is empty** — Dead package directory.
7. **❌ Integration tests are broken** — Reference deleted server code.
8. **❌ Duplicate test directories** — `test/`, `tests/`, `e2e/`, `apps/web/e2e/`, `playwright-report/`, `test-results/` are scattered.
9. **❌ AI tool configs scattered** — `.agents/`, `.claude/`, `.commandcode/`, `.gemini/`, `.cursorrules`, `.github/agents/`, `.github/skills/`, `.vscode/skills/` — 7+ locations.
10. **❌ Build artifacts at root** — `dist/`, `dist-desktop/`, `release/` should be in `.gitignore`.
11. **⚠️ Complexity cost** — The frontend has 5+ Zustand stores, 3 layers of prompt analysis, and dual-runtime conditionals everywhere. This is justified by the feature set but makes onboarding harder.
12. **⚠️ MONOREPO_MIGRATION_BASELINE.md** — Suggests a migration was abandoned mid-way. The `apps/server/src/` directory that was "new" is now gone.

---

## 16. Recommendations

### Immediate (P0)
1. **Decide on architecture** — Either restore the Fastify server or update ALL docs to reflect the Tauri-only reality.
2. **Clean the root** — Move scripts to `scripts/one-off/`, outputs to `tmp/`, delete temps, archive audits.
3. **Extract embedded projects** — Move `animateicons_temp`, `claude-obsidian`, `nyx-antigravity-extension`, `test_genai_bin` to separate repos.
4. **Fix broken tests** — Either restore the server or rewrite integration tests to test the Tauri backend.

### Short-term (P1)
5. **Consolidate test directories** — Merge `test/` into `tests/`, delete duplicates.
6. **Consolidate AI configs** — Move all agent configs into `.ai/` or `agent-configs/`.
7. **Delete or complete @nyx/ui** — Either finish the design system or delete it.
8. **Delete @nyx/uploads** — Empty package, no purpose.
9. **Add dist/ to .gitignore** — Build artifacts shouldn't be committed.
10. **Merge architecture docs** — Pick one source of truth between ARCHITECTURE.md and architecture_overview.md.

### Medium-term (P2)
11. **Restore the server OR commit to Tauri** — If going Tauri-only, add `externalBin` or `sidecar` in Tauri to bundle the server. If restoring the server, copy from the worktree and update infrastructure files.
12. **Uncomment Vite proxy** — If restoring server, re-enable the proxy to `localhost:3001`.
13. **Add Tauri sidecar** — For desktop, bundle the Node.js server as a sidecar process so the desktop app can run standalone.
14. **Clean up git worktree** — The `.worktrees/monorepo-consolidation/` may be stale. Either merge it or delete it.
15. **Add proper CI/CD** — The `.github/workflows/` and `.gitlab-ci.yml` exist but the CONTRIBUTING.md is stale.

---

## 17. File Count Summary

| Area | Approx. Files | Notes |
|------|--------------|-------|
| `apps/web/src/` | ~400+ | Main frontend |
| `src-tauri/src/` | ~40 | Rust backend |
| `packages/` | ~20 | Shared packages |
| `docs/` | ~20 | Documentation |
| `tests/` | ~10 | Test files |
| `docker/` | 4 | Sandbox Dockerfiles |
| `k8s/` | ~5 | K8s manifests |
| `monitoring/` | ~10 | Observability configs |
| **Root clutter** | ~100+ | Scripts, outputs, temps |
| **Embedded projects** | ~200+ | animateicons, claude-obsidian, etc. |
| **node_modules** | ~3000+ | Dependencies |
| **graphify-out** | ~10 | Knowledge graph |
| **Total** | **~6,300+** | Per graphify |

---

*End of Complete NYX Codebase Analysis*
