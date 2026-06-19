# `apps/web` Deep Audit Report

**Audited directory:** `E:\NYX\apps\web`  
**Date:** 2026-06-17 (local time)  
**Tooling:** TypeScript compiler (`tsc --noEmit`), static analysis via Python AST + regex, manual config inspection.

---

## Executive Summary

- **Syntax errors:** `0` (`tsc --noEmit` passes cleanly).
- **Broken imports/exports (TypeScript resolution):** `0`.
- **Missing dependencies:** `0` (all imported packages exist in `node_modules` and are listed in `package.json`).
- **Configuration issues:** `9` (vite / tsconfig / package.json mismatches, leftover files, redundant configs).
- **Orphaned / dead files:** `65` (never imported by any other source file).
- **Unused exports:** `230` (exported symbols never referenced anywhere in the codebase).
- **Duplicate filenames:** `11` (same filename in multiple directories, often indicating copy-paste leftovers).
- **Missing assets:** `2` real issues (PWA icons); the rest are false-positives from string literals or build-time paths.

---

## 1. Syntax Errors

**Result:** None found.

`node_modules/.bin/tsc --noEmit` was executed in `apps/web` and exited with code `0`. All `.ts`, `.tsx`, `.js`, and `.json` files parse successfully.

---

## 2. Broken Imports / Exports (TypeScript Resolution)

**Result:** None found by the compiler.

All static `import` / `export` statements resolve to real files or installed packages.  
**Note:** There are a few *asset* references that look like imports but are actually string literals (e.g., `package.json` paths inside UI components). These are not compiler errors, but they may be runtime dead code (see Section 8).

---

## 3. Missing Dependencies / Version Mismatches

**Result:** No missing dependencies.

Every package imported in source code is present in `node_modules` and declared in `package.json` (dependencies, devDependencies, or optionalDependencies).

### Notable version observations

| Package | `package.json` version | Installed version | Note |
|---|---|---|---|
| `lucide-react` | `^1.17.0` | `1.17.0` | Installed version matches. |
| `framer-motion` | `^12.40.0` | `12.40.0` | Installed version matches. |
| `react-router-dom` | `^7.17.0` | `7.17.0` | Installed version matches. |
| `xterm` | `^5.3.0` | `5.3.0` | Installed version matches. |
| `react` | `^19.2.7` | `19.2.7` | Installed version matches. |
| `react-dom` | `^19.2.7` | `19.2.7` | Installed version matches. |
| `tailwindcss` | `^4.3.0` | `4.3.0` | Installed version matches. |
| `vite` | `^8.0.16` | `8.0.16` | Installed version matches. |
| `@nyx/shared` | `workspace:*` | symlinked | Symlink to `packages/shared` works. |
| `motion` (separate package) | — | **not installed** | Referenced only in `vite.config.ts` `optimizeDeps` (see Section 4). |
| `recharts` / `d3` | — | **not installed** | Referenced only in `vite.config.ts` `manualChunks` (see Section 4). |

---

## 4. Configuration Issues

| File | Issue |
|---|---|
| `vite.config.ts` | Alias `@server` is defined in Vite but **missing** from `tsconfig.json` paths. Any source file using `@server` will fail TypeScript resolution. |
| `vite.config.ts` | `optimizeDeps.include` lists `motion/react`, but the `motion` package is **not** in `package.json` dependencies. No source file currently imports it, so it is a dead config entry. |
| `vite.config.ts` | `manualChunks` splits `recharts` and `d3` into a `vendor-charts` chunk, but neither library is in `dependencies`. Dead config entry. |
| `postcss.config.cjs` | Uses `autoprefixer`, but Tailwind CSS v4 is already configured via the `@tailwindcss/vite` plugin in `vite.config.ts`. The PostCSS config is likely redundant / unused. |
| `package.json` | DevDependency `workbox-webpack-plugin` is present even though the project uses Vite (`vite-plugin-pwa` handles Workbox). |
| `package.json` | DevDependency `@next/bundle-analyzer` is present but this is a **Vite** app, not a Next.js app. |
| `components.json` | `style` is set to `"base-nova"`, which is not a standard shadcn/ui style (`"default"` or `"new-york"`). If this is a custom registry, ensure it is installed and configured. |
| `tsconfig.json` | `src/graphify-out` is inside `src/` and is captured by the `src/**/*` glob. This bloats the type-check and may accidentally include cache files in the build. Add an `exclude` entry. |
| `temp.js` (root) | A 62 KB file at the project root looks like a leftover scratch file. It is not referenced by any config, but it clutters the repo. |

---

## 5. Orphaned / Dead Files (65)

These files are never imported (statically or dynamically) by any other file in the codebase. They are strong candidates for deletion or indicate half-finished features.

### `src/components/*` (legacy / duplicate components)
- `src/components/chat/MessageTree.tsx`
- `src/components/chat/StreamingIndicator.tsx`
- `src/components/CommandPalette.tsx` *(duplicate of `src/shared/components/CommandPalette.tsx`)*
- `src/components/layout/MobileLayout.tsx`
- `src/components/notifications/ToastProvider.tsx`

### `src/config/*`
- `src/config/ports.ts`

### `src/core/*` (unused core modules)
- `src/core/agents/DeveloperAgent.ts`
- `src/core/agents/researchAgent.ts`
- `src/core/agents/useChatAgent.ts`
- `src/core/index.ts`
- `src/core/stores/useChatStore.ts` *(duplicate of `src/stores/useChatStore.ts`)*
- `src/core/stores/useModelStore.ts`
- `src/core/tools/nyxTools.ts`
- `src/core/tools/toolExecutor.ts`
- `src/core/types/ag-ui.ts`
- `src/core/types/agent.ts` *(duplicate of `src/types/agent.ts`)*
- `src/core/types/project.ts`

### `src/features/*` (disconnected feature shells)
- `src/features/artifacts/ArtifactViewer.tsx` *(duplicate of `src/components/artifacts/ArtifactViewer.tsx`)*
- `src/features/artifacts/components/ArtifactRenderer.tsx`
- `src/features/artifacts/index.ts`
- `src/features/audio/index.ts`
- `src/features/auth/index.ts`
- `src/features/chat/components/ComputerUsePreview.tsx`
- `src/features/chat/services/ContextManager.ts` *(duplicate of `src/features/chat/utils/ContextManager.ts`)*
- `src/features/chat/services/PromptAnalysisService.ts` *(duplicate logic in `src/core/services/promptAnalysis.service.ts`)*
- `src/features/collaboration/index.ts`
- `src/features/collaboration/yjs.ts`
- `src/features/compliance/index.ts`
- `src/features/debug/index.ts`
- `src/features/deploy/index.ts`
- `src/features/gamification/index.ts`
- `src/features/ide/components/CollaborativeEditor.tsx`
- `src/features/ide/components/Editor.tsx`
- `src/features/marketplace/index.ts`
- `src/features/model-registry/config/models.ts` *(duplicate of `src/shared/config/models.ts` and `src/types/models.ts`)*
- `src/features/orchestrator/index.ts`
- `src/features/privacy/index.ts`
- `src/features/research/index.ts`
- `src/features/safety/index.ts`
- `src/features/sandbox/index.ts`
- `src/features/settings/AccessibilityChecker.ts`
- `src/features/settings/CacheDashboard.tsx`
- `src/features/settings/components/AuditLogView.tsx`
- `src/features/settings/components/EvolutionaryRules.tsx`
- `src/features/settings/components/HotkeyManager.tsx`
- `src/features/settings/components/NetworkSettings.tsx`
- `src/features/settings/components/WorkspaceConfig.tsx`
- `src/features/settings/McpSettings.tsx`
- `src/features/settings/RoutingSettings.tsx`
- `src/features/settings/SettingsProfileManager.ts`
- `src/features/settings/SettingsSyncService.ts`
- `src/features/support/index.ts`
- `src/features/team/index.ts`

### `src/hooks/*`
- `src/hooks/useSwipeGesture.ts`

### `src/infrastructure/*` (unused services)
- `src/infrastructure/api/ensemble.service.ts`
- `src/infrastructure/api/router.service.ts`
- `src/infrastructure/services/circuitBreaker.ts`
- `src/infrastructure/services/titleGenerator.ts`
- `src/infrastructure/services/toolSystem.ts`

### `src/shared/*` (unused shared utilities)
- `src/shared/components/ui/UnifiedDiffViewer.tsx`
- `src/shared/constants.ts`
- `src/shared/hooks/useScraplingStatus.ts`
- `src/shared/index.ts`
- `src/shared/promptAnalyzer.ts`
- `src/utils/export.ts`

---

## 6. Duplicate Filenames (11)

Same filename in multiple directories. Usually indicates a refactor where the old copy was left behind.

| Filename | Locations |
|---|---|
| `ArtifactViewer.tsx` | `src/components/artifacts/ArtifactViewer.tsx`  
`src/features/artifacts/ArtifactViewer.tsx` |
| `ErrorBoundary.tsx` | `src/components/artifacts/ErrorBoundary.tsx`  
`src/core/components/ErrorBoundary.tsx`  
`src/shared/components/ErrorBoundary.tsx` |
| `CommandPalette.tsx` | `src/components/CommandPalette.tsx`  
`src/shared/components/CommandPalette.tsx` |
| `useChatStore.ts` | `src/core/stores/useChatStore.ts`  
`src/stores/useChatStore.ts` |
| `agent.ts` | `src/core/types/agent.ts`  
`src/types/agent.ts` |
| `useChatSessions.ts` | `src/features/chat/hooks/useChatSessions.ts`  
`src/shared/hooks/useChatSessions.ts` |
| `ContextManager.ts` | `src/features/chat/services/ContextManager.ts`  
`src/features/chat/utils/ContextManager.ts` |
| `ModelComparisonView.tsx` | `src/features/model-registry/components/ModelComparisonView.tsx`  
`src/views/ModelComparisonView.tsx` |
| `ModelRegistryView.tsx` | `src/features/model-registry/components/ModelRegistryView.tsx`  
`src/views/ModelRegistryView.tsx` |
| `models.ts` | `src/features/model-registry/config/models.ts`  
`src/shared/config/models.ts`  
`src/types/models.ts` |
| `SettingsView.tsx` | `src/features/settings/components/SettingsView.tsx`  
`src/views/SettingsView.tsx` |

---

## 7. Unused Exports (230)

A large number of exported types, interfaces, and functions are never referenced by any other file. This is typical of a rapidly-evolving codebase where exports were added speculatively. A few highlights (the full list is in the raw output above):

- `src/app/router.tsx` – `ChatSessionHookResult`
- `src/core/agents/DeveloperAgent.ts` – `DeveloperAgent`, `DeveloperAgentConfig`
- `src/core/agents/researchAgent.ts` – `ResearchAgent`, `ResearchAgentConfig`
- `src/core/stores/useModelStore.ts` – `useModelStore`
- `src/core/stores/useUsageStore.ts` – `ModelUsage`, `LimitReason`, `UsageState`
- `src/features/settings/CacheDashboard.tsx` – `CacheDashboard`
- `src/features/settings/McpSettings.tsx` – `McpSettings`
- `src/infrastructure/services/toolSystem.ts` – `TOOL_REGISTRY`, `toolExecutor`
- `src/infrastructure/types/agentTypes.ts` – ~50 exported types (e.g., `SafetyLevel`, `MessageRole`, `ContentBlock`, `ToolUseBlock`, etc.)
- `src/shared/store/apiKeyHelpers.ts` – ~15 exports (`ApiKeyEntry`, `retrieveKey`, `deleteApiKey`, `revalidateAllKeys`, etc.)
- `src/shared/store/useNyxStore.ts` – `ActiveMode`, `NyxState`
- `src/types/agent.ts` – `SubagentType`, `SubagentResult`, `SubagentPlan`, `HandoffSpecification`, `ISubagentOrchestrator`, `AgentPersona`, `CoderStreamEventType`, `CoderStreamEvent`, `FileProposal`
- `src/types/models.ts` – `LocalModelPreset`

**Recommendation:** Remove unused exports or convert them to non-exported declarations to reduce bundle size and API surface.

---

## 8. Missing Assets

### Real issues

| File | Line | Asset | Issue |
|---|---|---|---|
| `vite.config.ts` | 90 | `/icon-192.png` | **Missing** from `public/`. The PWA manifest references this icon, but `public/` only contains `nyx-icon.png`, `nyx-icon.jpg`, and `nyx-icon.ico`. |
| `vite.config.ts` | 95 | `/icon-512.png` | **Missing** from `public/`. Same as above. |

### False positives / build-time references

| File | Line | Asset | Note |
|---|---|---|---|
| `src/components/workspace/Canvas.tsx` | 13 | `reactflow/dist/style.css` | Valid package CSS import; resolved by Vite at build time. |
| `src/features/chat/components/ChatMessageList.tsx` | 17 | `katex/dist/katex.min.css` | Valid package CSS import; resolved by Vite at build time. |
| `src/sw.ts` | 6 | `/assets/index.css` | Build-time path. The service worker is generated by `vite-plugin-pwa`; these files exist only after `vite build`. |
| `src/features/git/GitView.tsx` | 49 | `package.json` | String literal (likely a file path in the UI), not an import. |
| `src/features/ide/IdeView.tsx` | 28 | `package.json` | String literal. |
| `src/features/ide/IdeView.tsx` | 28 | `tsconfig.json` | String literal. |
| `src/features/ide/IdeView.tsx` | 84 | `package.json` | String literal. |
| `src/features/plugins/McpView.tsx` | 63 | `file:///workspace/package.json` | String literal. |
| `src/features/plugins/McpView.tsx` | 63 | `package.json` | String literal. |
| `src/features/projects/ProjectsView.tsx` | 63 | `package.json` | String literal. |
| `vite.config.ts` | 190 | `**/config.json` | Glob pattern in `server.watch.ignored`, not a file import. |
| `vite.config.ts` | 191 | `**/conversations.json` | Glob pattern in `server.watch.ignored`, not a file import. |

### Additional asset check

- `index.html` references `https://yashas-30.github.io/NYX/assets/arena.png` for Open Graph / Twitter cards. The file **does exist** in `public/assets/arena.png`, so this is fine.
- `public/assets` also contains `analysis.png` and `coder.png`.

---

## 9. Entry Point & Main Flow

- **Entry:** `index.html` → `src/main.tsx` (line 71).
- `main.tsx` renders `App` from `src/app/App.tsx`.
- `App.tsx` renders `AppDashboard` from `src/features/dashboard`.
- `AppDashboard` renders `AppRouter` from `src/app/router.tsx`.
- `router.tsx` lazy-loads the major views (`ChatView`, `ModelRegistryView`, `SettingsView`, `PluginsView`, `ProjectsView`, `SwarmView`, `GitView`, `DocumentsView`, `ImagesView`, `McpView`, `TasksView`, `IdeView`, `MemoryView`).
- All lazy routes are wrapped in `Suspense` + `ErrorBoundary`.

---

## 10. `@nyx/ui` Check

- The `packages/ui` directory exists but is **empty** (only a `src/` subfolder with no files).
- **Zero references** to `@nyx/ui` were found anywhere in `apps/web/src/`.
- No action needed unless the package is intended to be used later.

---

## 11. Additional Observations

- **Package `xterm` is deprecated.** The official package is now `@xterm/xterm`. The installed `xterm@5.3.0` still works, but future updates should migrate.
- **Package `@sentry/replay` is redundant.** In Sentry v10 (`@sentry/react@10.57.0`), replay functionality is built-in. The separate `@sentry/replay` dependency can be removed.
- **Service worker (`src/sw.ts`)** caches `/assets/index.js` and `/assets/index.css`. These paths are generated by Vite during build. If the build output changes hash names, the hard-coded list in `sw.ts` may become stale. Consider using the `vite-plugin-pWA` auto-generated service worker instead.

---

*End of report.*
