# Project Memory & Progress Log

## Recent Architectural Upgrades & System Unifications

### 1. Unblocked Model Selector & Dedicated Generation Model with Lucifer Agent Controller
- **Unblocked Model Selector UI**:
  - Removed all `disabled={...}` locks, `opacity` reductions, and click-guards in [`ChatHeader.tsx`](file:///e:/NYX/apps/web/src/features/chat/components/ChatHeader.tsx).
  - The model selector dropdown is fully accessible and interactive at all times, even when Lucifer Agent is toggled ON.
  - The model selector always clearly displays the active target model (e.g., Claude 3.5 Sonnet, Gemini 2.5 Flash, GPT-4o, DeepSeek, local GGUF models) alongside the Lucifer Agent badge.
- **Autonomous Agent Control & Response Generation**:
  - Updated [`useNyxStore.ts`](file:///e:/NYX/apps/web/src/shared/store/useNyxStore.ts) so toggling Lucifer Agent does not overwrite the user's selected `cloudModelId`, `localModelId`, or `currentModel`.
  - Updated [`useChatPipeline.ts`](file:///e:/NYX/apps/web/src/features/chat/hooks/useChatPipeline.ts) so the target model selected by the user is the model that generates the final response.
  - The local **Qwen 2.5 1.5B Lucifer Agent** on GPU handles intent analysis, multi-hop query planning, tool execution, TurboVec & SQLite vector memory retrieval, and conditions the generation model with executive guidance to fulfill the user's query.

### 2. Model-Native Unified Architecture for Qwen 2.5 1.5B (`nyx-native`) & Cloud
- **Intelligent Query Formulation**:
  - Rewrote `generate_intelligent_query_plan_command` and `generate_search_queries_with_model` in [`agent.rs`](file:///e:/NYX/src-tauri/src/commands/agent.rs) to use `execute_any_stream`, executing against local GGUF models (`qwen2.5-1.5b-instruct`) or cloud models.
  - Implemented robust JSON chunk and substring extractors (`[`...`]` and `{`...`}`) for local LLM completions.
  - Updated [`intelligentQueryEngine.ts`](file:///e:/NYX/apps/web/src/core/services/intelligentQueryEngine.ts) to dynamically accept the active provider/model with non-blocking fallback.

### 3. Multi-Hop Deep Research Engine Unification
- **Full Local & Cloud Parity**:
  - Rewrote [`research.rs`](file:///e:/NYX/src-tauri/src/research.rs) to execute without requiring cloud API keys when using `nyx-native` / local models.
  - Connected the Planner, Web Scraper, Reflection Gap-Finder, and Publisher agents through `execute_any_stream`.
  - Integrated TurboVec LanceDB vector memory and SQLite episodic memories into the deep research context pipeline.

### 4. Media & Multi-Tool Execution
- **Integrated Tool Calling**:
  - Wired `generate_image` (local Diffusers), `search_media` (Pexels & Pixabay photos/videos), and `synthesize_voice` (`LuciferVoiceTool`) into `execute_tool` in [`agent.rs`](file:///e:/NYX/src-tauri/src/commands/agent.rs).

### 5. Web Search Speed & Latency Optimization
- **Eliminated Multi-Second Fetch Delays**:
  - Lowered `fetch_page_content` network timeout to 1500ms.
  - Optimized candidate deep page scraping to only fetch full HTML when snippets are sparse (< 160 characters) and capped at 2 parallel requests.
  - Refined media prefetching in [`useChatPipeline.ts`](file:///e:/NYX/apps/web/src/features/chat/hooks/useChatPipeline.ts) to avoid unwanted media calls during text/code searches.

### 6. Dynamic Qwen 2.5 1.5B (Lucifer Agent) as Single Source of Truth
- **Replaced Fragile Frontend Regexes**:
  - Removed hardcoded regex gates for intent, search requirement, and media triggers in [`useChatPipeline.ts`](file:///e:/NYX/apps/web/src/features/chat/hooks/useChatPipeline.ts).
  - Wired Qwen 2.5 1.5B's `queryPlan` (`intent`, `requires_search`, `response_style`, `target_depth`, `source_preference`) directly into the pipeline execution path.
- **Precise Model-Driven Multi-Modal Routing**:
  - `source_preference: "wikimedia"` routes to Wikipedia/Wikimedia for fictional characters, comic book entities, historical figures, and scientific diagrams.
  - `source_preference: "pexels_pixabay"` routes directly to Pexels & Pixabay REST APIs with user keys for nature, lifestyle, backgrounds, and real-world photos.
  - Preserved Qwen's exact AI query formulations verbatim without destructive sanitization.
- **Unified Persona & Encyclopedic Depth**:
  - Aligned `LUCIFER_PERSONA` in [`src-tauri/src/orchestrator/lucifer.rs`](file:///e:/NYX/src-tauri/src/orchestrator/lucifer.rs) and [`luciferPersona.ts`](file:///e:/NYX/apps/web/src/core/agents/luciferPersona.ts).
  - Ensured character lore, origins, backstories, and deep research inquiries trigger comprehensive, multi-section exhaustive output.
- **Dead Code Removal**:
  - Deleted legacy FLUX illustration prompt generators and dead imports from `useChatPipeline.ts` and `mediaEngine.ts`.

### 7. LangGraph Researcher-Writer Multi-Agent Implementation (`scripts/researcher_writer_graph.py`)
- **Qwen 2.5 1.5B Local Researcher**:
  - Bound to `ddg_text_search`, `ddg_image_search`, and `scrape_webpage`.
  - Implements multi-tier mode- **Status**: Complete & Verified
- **Issue Diagnosis**:
  - `ReferenceError: image is not defined` occurred at `src/core/agents/luciferPersona.ts:62:24` due to unescaped backticks around ``(`/image`)`` inside the `IDENTITY_BLOCK` template literal, causing JavaScript to parse `/image/` as a division expression on an undeclared `image` variable and crashing startup.
  - Windows WebView2 transparent window flag caused empty alpha compositing resulting in a white frame.
  - Missing `'unsafe-eval'` and `blob:` in Tauri CSP was blocking Vite HMR and Web Workers.
- **Fixes Applied**:
  - Escaped backticks in `src/core/agents/luciferPersona.ts` (`\`/image\``).
  - Disabled window transparency in `src-tauri/tauri.conf.json` and `src-tauri/src/main.rs`.
  - Updated CSP in `src-tauri/tauri.conf.json` to allow `'unsafe-eval'`, `blob:`, and worker scripts.
  - Added inline `#121212` background styles to `index.html`.
  - Verified with `pnpm --filter @nyx/web build`, `pnpm vitest run` (22/22 passed), and `cargo test` (17/17 passed).
- **TypeScript Web**: `pnpm vitest run` -> Passed (22/22 tests).
- **Python Multi-Agent Script**: `python scripts/researcher_writer_graph.py --test-tools` -> Passed (DDG text search, Bing/DDG image search, and scraping verified).

## Verification
- **Rust Backend**: `cargo test --manifest-path src-tauri/Cargo.toml` -> Passed (17/17 tests).
- **TypeScript Web**: `pnpm vitest run` -> Passed (22/22 tests).
- **Python Multi-Agent Script**: `python scripts/researcher_writer_graph.py --test-tools` -> Passed (DDG text search, Bing/DDG image search, and scraping verified).
