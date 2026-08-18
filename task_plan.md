# Antigravity Task Plan

## Current Goal
Unblocked model selector with Lucifer Agent autonomous controller and selected model response generation.

## Phases

### Phase 1: Unblock Model Selector in UI [COMPLETED]
- [x] Removed disabled state, opacity reduction, and click restrictions on the model selector button in `ChatHeader.tsx`.
- [x] Enabled model selector dropdown menu to open and allow selecting any Cloud or Local model even when Lucifer Agent is active.
- [x] Display selected model name dynamically in the header alongside the Lucifer Agent toggle pill.

### Phase 2: Preserve Selected Model & Store Synchronization [COMPLETED]
- [x] Updated `setLuciferAgentEnabled` in `useNyxStore.ts` to only toggle `luciferAgentEnabled` without clearing or overriding `cloudModelId`, `localModelId`, or `currentModel`.
- [x] Prioritized `localModelId || cloudModelId` in `useChatPipeline.ts` when resolving `modelToUse`.

### Phase 3: Lucifer Agent Autonomous Controller Architecture [COMPLETED]
- [x] Local Qwen 2.5 1.5B agent acts as the autonomous intelligence and reasoning engine (intent analysis, query planning, TurboVec LanceDB + SQLite memory retrieval, grounding).
- [x] Enriched agent system prompt and context are supplied directly to the selected target model (Gemini, Claude, GPT, DeepSeek, Local) for final response generation.

### Phase 4: Verification [COMPLETED]
- [x] `cargo check --manifest-path src-tauri/Cargo.toml` -> 0 errors.
- [x] `pnpm --filter @nyx/web typecheck` -> 0 errors.
- [x] `pnpm vitest run` -> 22/22 tests passing.
