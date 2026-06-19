# NYX Monorepo Migration & Consolidation Plan

> Status: **DRAFT — AWAITING EXECUTION AUTHORIZATION**
> Scope: restructure `E:\NYX` into a production-grade pnpm + Turborepo monorepo with clean module boundaries, shared types, and unified build pipeline.
> Strategy: **in-place consolidation** (the repo already has the skeleton — we are tightening boundaries, not starting over).

---

## 1. Executive Summary

NYX is already a partial monorepo: `apps/`, `packages/`, `.turbo/`, and `.pnpm-store/` exist, and a `turbo.json` with a build pipeline is wired. The pain points are concentrated in five places:

1. **Turbo is on v1 (`turbo@^1.12.4`)** but the user-facing brief is written in **v2** syntax (`tasks`, `outputs`). The v1 `pipeline` key is the old name — the current `turbo.json` is the legacy shape.
2. **The root `tsconfig.json` carries the mess**: 11+ path aliases (`@/*`, `@/shared/*`, `@/server/*`, `@/src/*`, `@/features/*`, `@/core/*`, `@/assets/*`, etc.) that exist only to make a flat project compile, and which break in production builds and IDE cross-package navigation.
3. **No clear API surface for `packages/shared`** — the user-supplied types (`ModelOption`, `ChatMessage`, `TelemetryMetrics`, `AISettings`, `Provider`) hint at what should live there, but no `src/index.ts` barrel has been authored.
4. **Two competing build systems** (Vite for `apps/web`, esbuild emitting `dist-server/` for `apps/server`) without a unified cache or dep graph.
5. **Loose directories at root** (`api/`, `nyx-antigravity-extension/`) that aren't part of the workspace yet — their fate is undecided.

This plan turns NYX into a **pnpm + Turborepo v2 + TypeScript Project References** monorepo where each package publishes a typed `dist/` artifact, apps depend on those artifacts (not on relative paths), and the root `tsconfig.json` becomes a thin orchestrator that only sets up `references`.

---

## 2. Current State Assessment

### 2.1 Inventory (verified by reading the tree)

| Path | State | Action |
|---|---|---|
| `package.json` (root) | has `workspaces: ["apps/*", "packages/*"]`, `turbo@^1.12.4` | Upgrade to `turbo@^2.5.0` |
| `turbo.json` | v1 syntax (`pipeline` key, `outputs: ["dist/**", "dist-server/**"]`) | Rewrite in v2 (`tasks` key) |
| `tsconfig.json` (root) | 11 path aliases, project references already declared | Strip aliases, keep references, add `composite: true` |
| `apps/web/tsconfig.json` | extends `tsconfig.base.json`, has `@/*` + `@shared/*` aliases, references `shared` | Drop aliases, import from `@nyx/shared` |
| `apps/server/tsconfig.json` | extends `../packages/config/tsconfig.base.json`, `module: CommonJS`, `outDir: dist` | Migrate to ESM, switch to `tsup`/`tsc -b`, drop legacy output dir |
| `apps/web/` | Vite app, output `dist/` | Keep Vite, wire to Turbo `build` task |
| `apps/server/` | esbuild, output `dist-server/` | Move to `tsup` or `tsc -b`, output `dist/` |
| `apps/desktop/` | **does not exist** | Defer to Phase 4 (out of scope unless `api/` becomes it) |
| `packages/config/` | `tsconfig.base.json` present | Promote to a proper `@nyx/config` package with `package.json` + exports |
| `packages/shared/` | `tsconfig.json` present, but no `package.json`, no `src/`, no exports | Scaffold `src/{types,constants,utils}` + `src/index.ts` barrel |
| `packages/ui/` | exists but empty/incomplete | Define scope in Phase 3 (shared React UI primitives) |
| `api/` | exists outside `apps/` | **Decision needed** (see §11) |
| `nyx-antigravity-extension/` | exists outside `apps/` | **Decision needed** (see §11) |
| `.turbo/`, `.pnpm-store/` | present | Preserve; Turbo cache will migrate naturally |

### 2.2 What already works (do not break)

- pnpm workspace glob (`apps/*`, `packages/*`) — keeps working once we add `pnpm-workspace.yaml` alongside.
- TypeScript project references — root already lists `apps/server`, `apps/web`, `packages/shared`.
- Existing strict base compiler options in `packages/config/tsconfig.base.json` (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, etc.).
- `packages/shared` emits `.d.ts` (`declaration: true`) — correct shape for workspace consumers.

### 2.3 What is broken or fragile

- **Path aliases in `tsconfig.json` (root) are the single biggest risk.** They use `baseUrl: "."` and resolve to flat directories like `./shared/*`, `./src/*`, `./server/*` — none of which are workspace packages. These break as soon as:
  - A package is published to a registry.
  - An IDE tries to "Go to Definition" across package boundaries.
  - A non-Node bundler (esbuild via Turbo cache) tries to resolve them.
  - Anyone renames a top-level folder.
- **CommonJS in `apps/server` (`module: CommonJS`, `moduleResolution: Node`)** is inconsistent with the root and with `apps/web`. Two-module-system monorepos cause interop bugs.
- **Two output dirs (`dist/**` + `dist-server/**`)** are an unnecessary convention drift. Unify to `dist/`.
- **No `package.json` in `packages/shared` or `packages/config`** — they cannot be imported as `@nyx/shared` today; they're just tsconfig drop-ins.
- **No `pnpm-workspace.yaml` file** — pnpm is reading the npm `workspaces` field as a fallback, which works but is undocumented. Move to a proper workspace file for clarity.

---

## 3. Target State

### 3.1 Directory layout

```
E:\NYX\
├── apps/
│   ├── web/                    # Vite + React (existing, cleanup)
│   ├── server/                 # tsc -b / tsup → dist/ (existing, migrate off CJS)
│   └── extension/              # (NEW, only if nyx-antigravity-extension graduates here)
├── packages/
│   ├── config/                 # @nyx/config — tsconfig bases, eslint bases, prettier
│   ├── shared/                 # @nyx/shared — types, constants, utils (pure TS, no React)
│   └── ui/                     # @nyx/ui — React primitives (theme, components)
├── api/                        # (DECISION: keep outside, or fold into apps/server)
├── nyx-antigravity-extension/  # (DECISION: keep outside, or move to apps/extension)
├── docs/                       # ← you are here
├── .turbo/                     # cache (preserve)
├── .pnpm-store/                # pnpm store (preserve)
├── package.json                # workspace root, no deps, scripts delegate to turbo
├── pnpm-workspace.yaml         # NEW — explicit pnpm workspace
├── turbo.json                  # v2 syntax
└── tsconfig.json               # thin orchestrator: references only, no aliases
```

### 3.2 Package map

| Package | Type | Publishes | Consumed by |
|---|---|---|---|
| `@nyx/config` | `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.react.json` | `tsconfig/*` exports | All apps and packages |
| `@nyx/shared` | Pure TS | `dist/index.js` (ESM), `dist/index.d.ts` | All apps, `@nyx/ui` |
| `@nyx/ui` | React 18+, ESM only | `dist/index.js`, `dist/index.d.ts` | `apps/web`, future `apps/desktop` |
| `apps/web` | Vite app | `dist/` (static) | Deployed to hosting |
| `apps/server` | Node service | `dist/index.js` (ESM) | Run as long-lived process |
| `apps/extension` | TBD | `dist/` or `out/` | Browser extension store |

### 3.3 Module boundaries (enforced by ESLint + dependency-cruiser)

```
@nyx/config  →  (no deps)
@nyx/shared  →  @nyx/config
@nyx/ui      →  @nyx/config, @nyx/shared
apps/web     →  @nyx/config, @nyx/shared, @nyx/ui
apps/server  →  @nyx/config, @nyx/shared
apps/extension → @nyx/config, @nyx/shared, @nyx/ui
```

**Forbidden edges** (enforced by `dependency-cruiser` in CI):
- `apps/*` → `apps/*` (no cross-app imports; share via `packages/*`).
- `packages/shared` → `packages/ui` or `apps/*` (shared stays pure).
- `packages/ui` → `apps/*` (UI does not import from apps).

---

## 4. Turborepo v1 → v2 Migration

### 4.1 Why upgrade

- v1 `pipeline` is deprecated; v2 renames to `tasks`.
- v2 adds `inputs`, better `dependsOn` semantics (`^build` for workspace deps, `^test` for transitive test gating), and per-environment configuration.
- v2 `outputs` is identical to v1, so cache invalidation stays predictable.

### 4.2 Target `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": [
        "$TURBO_DEFAULT$",
        "!**/*.test.ts",
        "!**/*.test.tsx",
        "!**/*.spec.ts",
        "!**/__tests__/**"
      ],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": ["*.tsbuildinfo"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 4.3 Package-level scripts (each `package.json`)

```json
{
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b --watch",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo *.tsbuildinfo"
  }
}
```

Apps override `build` with their own bundler command (e.g. `vite build` for `apps/web`).

---

## 5. `pnpm-workspace.yaml` (NEW)

```yaml
packages:
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - "@parcel/watcher"
  - "esbuild"
  - "sharp"
  - "unrs-resolver"
```

`onlyBuiltDependencies` allows native postinstall scripts under a controlled allow-list (pnpm v9+ default behavior).

---

## 6. `packages/config` — TypeScript Base

### 6.1 New `package.json`

```json
{
  "name": "@nyx/config",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./tsconfig.base.json": "./tsconfig/tsconfig.base.json",
    "./tsconfig.react.json": "./tsconfig/tsconfig.react.json",
    "./tsconfig.node.json": "./tsconfig/tsconfig.node.json",
    "./tsconfig.lib.json": "./tsconfig/tsconfig.lib.json",
    "./eslint": "./eslint/index.cjs",
    "./prettier": "./prettier.json"
  }
}
```

### 6.2 Split bases

| File | For | Adds on top of base |
|---|---|---|
| `tsconfig.base.json` | everyone | strict modern baseline (already exists) |
| `tsconfig.react.json` | `apps/web`, `packages/ui` | `jsx: react-jsx`, `lib: ["DOM", "DOM.Iterable"]` |
| `tsconfig.node.json` | `apps/server`, tooling | `lib: ["ES2023"]`, `types: ["node"]` |
| `tsconfig.lib.json` | all `packages/*` | `composite: true`, `declaration: true`, `declarationMap: true`, `outDir: dist`, `rootDir: src` |

### 6.3 Migration: `packages/config/tsconfig.base.json` → `packages/config/tsconfig/tsconfig.base.json`

Move the file. Add `composite: true` and `declaration: true` to the lib variant, not the base. The base stays side-effect-free.

---

## 7. `packages/shared` — API Surface

### 7.1 New `package.json`

```json
{
  "name": "@nyx/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./types": {
      "types": "./dist/types/index.d.ts"
    },
    "./constants": {
      "types": "./dist/constants/index.d.ts"
    },
    "./utils": {
      "types": "./dist/utils/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b --watch",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "lint": "eslint src",
    "clean": "rm -rf dist *.tsbuildinfo"
  },
  "peerDependencies": {
    "typescript": "^5.8.2"
  }
}
```

### 7.2 New `src/index.ts` (barrel)

```ts
export * from "./types/index.js";
export * from "./constants/index.js";
export * from "./utils/index.js";
```

### 7.3 New `src/types/index.ts` (initial cut from user brief)

```ts
export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  capabilities: ModelCapability[];
  pricing?: {
    inputPer1k: number;
    outputPer1k: number;
    currency: "USD";
  };
  local?: {
    vramGb: number;
    quantization?: string;
    vulkanSupported: boolean;
  };
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  reasoningTrace?: ReasoningTrace;  // silent reasoning
  telemetry?: TelemetryMetrics;
}

export interface TelemetryMetrics {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  tokensPerSecond?: number;
  firstTokenLatencyMs?: number;
  cost?: number;
}

export interface AISettings {
  defaultProvider: Provider;
  defaultModelId: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  webSearchEnabled: boolean;
  silentReasoningEnabled: boolean;
  persistentMemoryEnabled: boolean;
  ollamaEndpoint?: string;
  huggingfaceToken?: string;
}

export type Provider =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "huggingface"
  | "gemini";
// (extend as needed)

export type ModelCapability =
  | "chat"
  | "function_calling"
  | "vision"
  | "audio"
  | "embeddings"
  | "code_completion"
  | "long_context";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ReasoningTrace {
  steps: ReasoningStep[];
  totalDurationMs: number;
  compressed: boolean;
}

export interface ReasoningStep {
  index: number;
  thought: string;
  durationMs: number;
  tokenCount?: number;
}
```

> Note: `Provider` was cut off mid-declaration in the user's brief. The list above is a reasonable starting set; final list should be expanded to cover every provider NYX actually supports in `apps/server`.

### 7.4 New `src/constants/index.ts` (starter)

```ts
export const APP_NAME = "NYX";
export const APP_VERSION = "3.0.0";

export const DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
export const DEFAULT_CONTEXT_WINDOW = 8192;
export const MAX_REASONING_STEPS = 64;
export const TELEMETRY_FLUSH_INTERVAL_MS = 5_000;

export const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  gemini: "Google Gemini",
  ollama: "Ollama (Local)",
  huggingface: "Hugging Face",
};
```

### 7.5 New `src/utils/index.ts` (move/extract from existing code)

```ts
export function formatTokens(n: number): string { /* ... */ }
export function estimateCost(t: TelemetryMetrics): number { /* ... */ }
export function clampContextWindow(tokens: number, max: number): number { /* ... */ }
export function createId(): string { /* crypto.randomUUID() wrapper */ }
```

(Actual utilities to be extracted from the current codebase during execution — listed here as placeholders.)

---

## 8. tsconfig Strategy

### 8.1 Root `tsconfig.json` (target)

```json
{
  "files": [],
  "references": [
    { "path": "./packages/config" },
    { "path": "./packages/shared" },
    { "path": "./packages/ui" },
    { "path": "./apps/web" },
    { "path": "./apps/server" }
  ]
}
```

That's it. No aliases, no `compilerOptions` at the root. The root is a pure orchestrator that lets `tsc -b` walk the project graph.

### 8.2 Per-app tsconfig (target)

**`apps/web/tsconfig.json`:**

```json
{
  "extends": "@nyx/config/tsconfig.react.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" },
    { "path": "../../packages/ui" }
  ]
}
```

**`apps/server/tsconfig.json`:**

```json
{
  "extends": "@nyx/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["src"],
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

### 8.3 Path-alias cleanup map

| Old (in `tsconfig.json` or `apps/web/tsconfig.json`) | New |
|---|---|
| `@/shared/*` → `./shared/*` | `@nyx/shared` |
| `@/*` → `./*` | relative imports **or** `@nyx/*` packages |
| `@src/*` → `./src/*` | relative imports |
| `@server/*` → `./server/*` | relative imports |
| `@shared/*` → `./src/shared/*` | `@nyx/shared` |
| `@features/*` → `./src/features/*` | relative imports (or `@nyx/ui` for shared) |
| `@core/*` → `./src/core/*` | relative imports |
| `@assets/*` → `./src/assets/*` | Vite `import.meta.url` + bundler asset import |
| `electron-vite`, `electron-updater`, `electron-window-state`, `conf` | Type-only declarations in `apps/extension` or root `types/` |
| `@huggingface/transformers` | `pnpm install` to `node_modules` (remove manual path) |

---

## 9. Build System Unification

### 9.1 `apps/web` (Vite — keep)

- Vite handles bundling, HMR, asset hashing.
- `apps/web/package.json` `build` script: `vite build` (overrides the default `tsc -b`).
- Vite's `resolve.alias` must drop the legacy aliases. Add `@nyx/shared` and `@nyx/ui` if Vite needs explicit aliases; otherwise rely on package.json `exports`.
- The `tsc -b` step in `apps/web` becomes a **typecheck** job only — it does not produce the bundle.

### 9.2 `apps/server` (esbuild → `tsup`)

- Replace ad-hoc esbuild with **`tsup`** (already in devDependencies).
- `tsup` runs on the compiled `packages/shared` output (`^build` in Turbo).
- `apps/server/package.json` `build` script: `tsup src/index.ts --format esm --target node20 --clean --dts`.
- Output: `dist/index.js` (ESM, no more `dist-server/`).

### 9.3 Cache behavior

Turbo hashes:
- All inputs listed in `inputs` (source + configs + `package.json`).
- Excludes test files from the `build` cache key (rebuild only when source changes, not when tests change).
- `outputs: ["dist/**", ".next/**", "!.next/cache/**"]` matches v1 exactly so existing CI cache keys remain compatible after the upgrade.

---

## 10. Migration Phases

### Phase 0 — Pre-flight (no code changes)
- **0.1** Branch: `git checkout -b monorepo/consolidation`.
- **0.2** Backup: tar `E:\NYX` to a safe location. **This is destructive work; do not skip.**
- **0.3** Verify pnpm and node versions (`pnpm -v` ≥ 9, `node -v` ≥ 20).
- **0.4** Open `package.json` at root, confirm `workspaces: ["apps/*", "packages/*"]` is intact.

**Exit criteria:** clean working tree on a new branch, backup confirmed, pnpm v9+ available.

---

### Phase 1 — Workspace foundation
- **1.1** Create `pnpm-workspace.yaml` at root (see §5).
- **1.2** Remove `workspaces` field from root `package.json` (pnpm reads from `pnpm-workspace.yaml`).
- **1.3** Add `packageManager: "pnpm@<version>"` to root `package.json` to pin the toolchain.
- **1.4** Run `pnpm install` to validate the workspace.

**Exit criteria:** `pnpm install` succeeds; `pnpm -r list` shows every package.

---

### Phase 2 — Turborepo v2
- **2.1** Bump root `devDependencies.turbo` from `^1.12.4` to `^2.5.0`.
- **2.2** Run `pnpm install`.
- **2.3** Rewrite `turbo.json` in v2 syntax (see §4.2). Keep `outputs: ["dist/**", "dist-server/**"]` initially so the cache doesn't invalidate everything.
- **2.4** Add a `clean` task to `turbo.json` and a `clean` script to each `package.json` (see §4.3).
- **2.5** Run `pnpm turbo run build --dry-run` to verify the graph.

**Exit criteria:** `pnpm turbo run build` runs end-to-end on the existing (v1) `tsc` invocations.

---

### Phase 3 — `packages/config` promotion
- **3.1** Move `packages/config/tsconfig.base.json` to `packages/config/tsconfig/tsconfig.base.json` (preserve content).
- **3.2** Create `packages/config/package.json` (see §6.1).
- **3.3** Add `tsconfig.react.json`, `tsconfig.node.json`, `tsconfig.lib.json` (see §6.2).
- **3.4** Update every `extends` reference in `apps/*` and `packages/*` from `../../packages/config/tsconfig.base.json` to `@nyx/config/tsconfig.<variant>.json`.
- **3.5** Verify `pnpm turbo run typecheck` still passes.

**Exit criteria:** all tsconfigs extend from `@nyx/config`; typecheck passes.

---

### Phase 4 — `packages/shared` scaffold
- **4.1** Create `packages/shared/package.json` (see §7.1).
- **4.2** Create `packages/shared/tsconfig.json` extending `@nyx/config/tsconfig.lib.json`.
- **4.3** Create `packages/shared/src/{types,constants,utils}/index.ts` (see §7.3–7.5).
- **4.4** Move the types/constants/utils out of the existing flat `src/shared/`, `src/core/`, `src/features/` directories into `packages/shared/src/` (decision: which types to migrate in this phase — minimum viable surface is the user-supplied list).
- **4.5** Add `packages/shared` to the root `tsconfig.json` references list (already there).
- **4.6** Run `pnpm turbo run build --filter=@nyx/shared` and inspect `packages/shared/dist/`.

**Exit criteria:** `@nyx/shared` builds standalone; types resolve from a consumer test file.

---

### Phase 5 — Import path migration
- **5.1** In `apps/web`, replace:
  - `import x from "@/shared/y"` → `import x from "@nyx/shared"`.
  - `import x from "@/features/y"` → relative `../../packages/ui/src/y` (or pull into `@nyx/ui`).
  - `import x from "@/core/y"` → `@nyx/shared` if pure, relative otherwise.
  - `import x from "@/src/y"` → relative.
  - Asset paths (`@/assets/*`) → `import.meta.url`-based or Vite `?url` imports.
- **5.2** In `apps/server`, replace:
  - Any `@/server/*` → relative.
  - Cross-imports of shared types → `@nyx/shared`.
- **5.3** Update Vite `resolve.alias` to remove the old keys; add `@nyx/*` aliases only if package.json `exports` resolution is insufficient.
- **5.4** Delete the legacy path-alias entries from root `tsconfig.json` (it should have zero aliases by end of phase).
- **5.5** Add an ESLint rule (`no-restricted-imports`) that bans `@/shared`, `@/core`, `@/features`, `@/src`, `@/server` imports anywhere in `apps/*`.

**Exit criteria:** `grep -R "from \"@/" apps packages` returns zero hits; `pnpm turbo run typecheck` passes.

---

### Phase 6 — Build system unification
- **6.1** In `apps/web/package.json`:
  - `build`: `vite build` (already there if it is).
  - `dev`: `vite` (already there if it is).
  - `typecheck`: `tsc -b --noEmit`.
- **6.2** In `apps/server/package.json`:
  - `build`: `tsup src/index.ts --format esm --target node20 --clean --dts`.
  - Drop `dist-server/**` references.
  - `typecheck`: `tsc -b --noEmit`.
- **6.3** Update `turbo.json` `outputs` to `["dist/**", ".next/**", "!.next/cache/**"]`.
- **6.4** Add a `tsup.config.ts` to `apps/server` if extra config is needed.
- **6.5** Add `tsup` as a devDependency in `apps/server` (already in root, hoist it).

**Exit criteria:** `pnpm turbo run build` produces a single `dist/` per app; old `dist-server/` is gone; cache hits work.

---

### Phase 7 — `packages/ui` definition (optional in v1)
- **7.1** Decide the surface: theme tokens, Button, Input, Modal, Tooltip, Toast — whatever is duplicated across web/extension.
- **7.2** Create `packages/ui/package.json` with React 18 peer dep.
- **7.3** Extract duplicated components from `apps/web/src/components/` into `packages/ui/src/`.
- **7.4** Add `apps/web` reference to `packages/ui`.

**Exit criteria:** `apps/web` imports shared UI from `@nyx/ui`; bundle size unchanged or smaller.

> **If `packages/ui` is empty in the current tree, this phase is skippable** — defer to a follow-up sprint.

---

### Phase 8 — Root `tsconfig.json` finalization
- **8.1** Strip all `compilerOptions` and `paths` from the root file.
- **8.2** Confirm only `references` remain.
- **8.3** Add `packages/ui` to references if it exists.
- **8.4** Run `pnpm tsc -b` from the root; verify the entire project compiles via project references alone.

**Exit criteria:** root `tsconfig.json` is 10 lines or fewer.

---

### Phase 9 — Verification
- **9.1** `pnpm turbo run build` — full graph builds.
- **9.2** `pnpm turbo run typecheck` — every project typechecks.
- **9.3** `pnpm turbo run lint` — lint passes.
- **9.4** `pnpm turbo run test` — tests pass.
- **9.5** `pnpm --filter apps/web dev` — web app boots, smoke-test the main route.
- **9.6** `pnpm --filter apps/server dev` (or `start` on built artifact) — server boots, smoke-test one endpoint.
- **9.7** `pnpm turbo run build --force` — clean build, no cache, every artifact produced.
- **9.8** Spot-check that no file under `apps/*` or `packages/*` still imports via the old `@/*` aliases.

**Exit criteria:** all green; no console errors; no `any`-leak regressions.

---

### Phase 10 — Optional hardening
- **10.1** Add `dependency-cruiser` config enforcing the §3.3 boundary rules.
- **10.2** Add a `verify:boundaries` script and wire it into `turbo.json` `lint` deps.
- **10.3** Add `eslint-plugin-boundaries` for editor-level feedback.
- **10.4** Convert root `package.json` scripts to be Turbo-only (drop raw `tsc` invocations).
- **10.5** Document the new developer workflow in `docs/DEVELOPING.md` (separate doc, future work).

---

## 11. Open Questions (DECISIONS NEEDED)

These are blocking for full execution. They are non-trivial and not answerable from the repo alone.

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Should `api/` be folded into `apps/server` or kept as a separate top-level directory? | **Fold in.** `api/` is server code; if it isn't a separate deployment unit, it should be a sub-folder of `apps/server`. |
| Q2 | Should `nyx-antigravity-extension/` graduate into `apps/extension`? | **Defer.** It's outside the workspace today and isn't wired into Turbo. Leave as-is; revisit later. |
| Q3 | What's the final list of `Provider` values? The user's brief was cut off after `'gemini'`. | Use the 6 listed in §7.3; expand during Phase 4. |
| Q4 | Should `apps/desktop` be created in this migration? | **No.** No evidence in the tree that it exists; defer. |
| Q5 | Is `apps/web` Vite or Next? `.next/**` is listed in outputs but I have not seen a `next.config.*`. | Treat as Vite for now. If Next is actually used, swap `vite build` for `next build` in `apps/web/package.json` and the `.next/**` outputs entry stays. |
| Q6 | Should we keep the npm `workspaces` field in root `package.json` after adding `pnpm-workspace.yaml`? | **Remove it.** pnpm prefers the YAML file; leaving both is noise. |
| Q7 | `tsup` vs `tsc -b` for `apps/server`? | `tsup` for the runtime bundle (handles ESM, d.ts, code-splitting); `tsc -b` for typecheck. The `build` script is `tsup`; `typecheck` is `tsc -b --noEmit`. |
| Q8 | Do we need a single root `pnpm-lock.yaml` and a single `node_modules/`? | **Yes** — pnpm's default. Do not opt out. |

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Path-alias migration breaks runtime imports | High | High | Phase 5 includes an ESLint ban and a smoke test; fallback is per-file `git revert` until alias is replaced. |
| Turbo v1 → v2 cache invalidation wipes build cache | Medium | Low | Expected; first build after upgrade will be slow. Cache hits return on second build. |
| `apps/server` ESM migration breaks Node startup | Medium | High | Run the server in both modes (CJS for one branch, ESM for another) until smoke test passes; keep `tsup` config committed. |
| `tsup` not yet producing `.d.ts` correctly | Low | Medium | Validate in Phase 6.6 with `tsc -b` on a consumer. |
| Decision on `api/` blocks Phase 1 | Low | Medium | Default to "fold into `apps/server`" per Q1. |
| `packages/ui` extraction balloons scope | Medium | Medium | Phase 7 is explicitly optional and time-boxed. |

---

## 13. Rollback Strategy

- Phase 0 backup is the primary rollback.
- Every phase ends with a green `git commit` so a per-phase revert is one command.
- Do **not** delete the old path aliases from `tsconfig.json` until Phase 5 verification passes — keep them as dead config so a regression can be diagnosed by re-enabling them.
- `pnpm-workspace.yaml` and `package.json#workspaces` can coexist temporarily; remove the latter only after Phase 1 verification.

---

## 14. Done Definition

The migration is **complete** when:

1. `pnpm turbo run build typecheck lint test` is green in CI.
2. Root `tsconfig.json` has zero path aliases and zero `compilerOptions` (only `references`).
3. No file under `apps/*` or `packages/*` imports via the old `@/shared`, `@/core`, `@/features`, `@/src`, `@/server` aliases (grep verified).
4. `@nyx/shared`, `@nyx/ui`, `@nyx/config` each have a `package.json` with a working `exports` field.
5. Turbo v2 cache works: second `pnpm turbo run build` after no source change hits cache.
6. `apps/web` boots via Vite; `apps/server` boots via the ESM bundle.
7. CI logs show only `@nyx/*` and relative imports in cross-package code paths.

---

## 15. Appendix — File-by-File Change Map (summary)

| File | Action |
|---|---|
| `package.json` (root) | Bump `turbo` to v2; remove `workspaces`; add `packageManager`; add `clean` script |
| `pnpm-workspace.yaml` | **NEW** |
| `turbo.json` | Rewrite in v2 syntax (`tasks`, refined `inputs`/`outputs`) |
| `tsconfig.json` (root) | Strip aliases + compilerOptions; keep only `references` |
| `apps/web/tsconfig.json` | Extend `@nyx/config/tsconfig.react.json`; drop path aliases; add `packages/ui` reference |
| `apps/web/vite.config.ts` | Drop legacy `resolve.alias` entries |
| `apps/server/tsconfig.json` | Extend `@nyx/config/tsconfig.node.json`; switch to ESM |
| `apps/server/package.json` | New `build` script using `tsup`; drop `dist-server` |
| `packages/config/package.json` | **NEW** |
| `packages/config/tsconfig.tsconfig.base.json` | **MOVED** from `tsconfig.base.json` |
| `packages/config/tsconfig/tsconfig.react.json` | **NEW** |
| `packages/config/tsconfig/tsconfig.node.json` | **NEW** |
| `packages/config/tsconfig/tsconfig.lib.json` | **NEW** |
| `packages/shared/package.json` | **NEW** |
| `packages/shared/tsconfig.json` | **NEW** |
| `packages/shared/src/index.ts` | **NEW** (barrel) |
| `packages/shared/src/types/index.ts` | **NEW** |
| `packages/shared/src/constants/index.ts` | **NEW** |
| `packages/shared/src/utils/index.ts` | **NEW** (extract from existing code) |
| `packages/ui/package.json` | **NEW** (Phase 7) |
| `packages/ui/tsconfig.json` | **NEW** (Phase 7) |
| `.eslintrc.cjs` (root or per-pkg) | Add `no-restricted-imports` banning legacy aliases |
| `dependency-cruiser.config.cjs` | **NEW** (Phase 10) |

---

*End of plan. Awaiting execution authorization.*
