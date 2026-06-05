# Monorepo Migration Baseline Snapshot

**Created:** 2026-06-05  
**Session:** Phase 0 — dirty inventory capture & stash  
**Branch:** `chore/monorepo-migration` (from clean `main`)

---

## Git State at Baseline

| Item | Value |
|------|-------|
| **HEAD commit** | `6da081735f4cc379ad2aff1f5336dca47134a210` (`feature addition`) |
| **Branch** | `chore/monorepo-migration` (new, based on `main`) |
| **Upstream** | `origin/main` @ `https://github.com/yashas-30/NYX.git` |
| **Stash reference** | `stash@{0}` — `WIP on main: 6da08173 feature addition` |

---

## Dirty Inventory Artifacts (External, Survives Stash)

| File | Path | Size | Lines | Purpose |
|------|------|------|-------|---------|
| **v2 inventory** | `C:\Users\yasha\AppData\Local\Temp\opencode\nyx-phase0-dirty-v2.txt` | 48,277 bytes | 886 | Clean porcelain + diffstat + untracked (markers at lines 643/886) |
| **Analysis script** | `C:\Users\yasha\AppData\Local\Temp\opencode\analyze-dirty-inventory.ps1` | 3,555 bytes | — | PowerShell analyzer (uses `$PSItem`) |
| **Analysis output** | `C:\Users\yasha\AppData\Local\Temp\opencode\analyze-dirty-inventory.out.txt` | 22,280 bytes | 240 | Script output (UTF-16 LE, read via `read-chunk.ps1`) |
| **Chunk reader** | `C:\Users\yasha\AppData\Local\Temp\opencode\read-chunk.ps1` | — | — | Reusable chunked reader for `.out.txt` |

> **Note:** All scratch files live in `C:\Users\yasha\AppData\Local\Temp\opencode\` — outside the repo — so they survive `git stash -u` and branch operations.

---

## Quantitative Summary (from v2 inventory)

| Metric | Count | Notes |
|--------|-------|-------|
| **Porcelain entries** | 642 | Lines 1–642 of v2 |
| Deleted (D) | 245 | Bulk legacy pruning |
| Modified (M) | 63 | Core configs + web features |
| Untracked (??) | **25** | See full list below |
| **`apps/server/*` overlap** | **172** | 3 M + 169 D — Phase 6 focal point |
| **`api/*` overlap** | **0** | Root `E:\NYX\api/` not in porcelain |
| **Diffstat magnitude** | 8 files changed, 524 insertions, **45,636 deletions** | Confirms migration-scale pruning |

---

## 25 Untracked Files (`??` in porcelain)

| # | Path | Type | Disposition |
|---|------|------|-------------|
| 1 | `.turbo/daemon/a050603fdb176ea2-turbo.log.2026-06-05` | log | `.gitignore` (build artifact) |
| 2 | `agent.ts.old` | backup | `.gitignore` |
| 3 | `apps/server/refactor_index.py` | script | Review — migration helper? |
| 4 | `apps/server/refactor_routers.py` | script | Review — migration helper? |
| 5 | `apps/server/src/` | dir | **New source root** — keep |
| 6 | `apps/web/src/features/chat/agents/` | dir | New feature — keep |
| 7 | `apps/web/src/features/chat/prompts/` | dir | New feature — keep |
| 8 | `apps/web/src/features/coder/agents/` | dir | New feature — keep |
| 9 | `apps/web/src/features/coder/prompts/` | dir | New feature — keep |
| 10 | `apps/web/src/features/shared/` | dir | New feature — keep |
| 11 | `apps/web/src/infrastructure/api/ai.service.ts` | src | New — keep |
| 12 | `apps/web/src/infrastructure/types/agent.ts` | types | New — keep |
| 13 | `apps/web/src/infrastructure/types/inference.ts` | types | New — keep |
| 14 | `apps/web/src/infrastructure/types/models.ts` | types | New — keep |
| 15 | `apps/web/src/infrastructure/types/shared.ts` | types | New — keep |
| 16 | `apps/web/src/infrastructure/utils/DebugLogger.ts` | util | New — keep |
| 17 | `apps/web/src/infrastructure/utils/format.ts` | util | New — keep |
| 18 | `apps/web/src/infrastructure/utils/index.ts` | util | New — keep |
| 19 | `apps/web/src/infrastructure/utils/modelIcons.tsx` | util | New — keep |
| 20 | `apps/web/src/infrastructure/utils/promptClassifier.ts` | util | New — keep |
| 21 | `apps/web/src/pages/` | dir | New — keep |
| 22 | `apps/web/src/stores/` | dir | New — keep |
| 23 | `apps/web/src/styles/` | dir | New — keep |
| 24 | `docs/MONOREPO_MIGRATION_PLAN.md` | doc | **Already in repo** (added this session) |
| 25 | `src/` | dir | **Root-level `src/`** — legacy? Review |

**Action needed post-stash-pop:** Items 1–2 → `.gitignore`; 3–4 → review/cleanup; 5, 6–23 → keep; 24 → tracked; 25 → investigate.

---

## `apps/server/*` Overlap Detail (172 entries — Phase 6)

### Modified (3)
- `apps/server/drizzle.config.ts`
- `apps/server/package.json`
- `apps/server/server.ts`

### Deleted (169) — Legacy `server/` Subtree
- `server/api/routes.ts`
- `server/config/{constants,env}.ts`
- `server/db/{backup,client,dbHealth,migrator,schema}.ts`
- `server/db/migrations/0000–0009_*.sql` (10)
- `server/db/migrations/meta/0000–0009_snapshot.json` + `_journal.json` (11)
- `server/docs/openapi.ts`
- `server/fastify/*` (8 adapters, server, services)
- `server/features/*` (~60 files: admin, agents, ai-providers, assistant, auth, cache, chat, conversations, files, graphql, local-models, model-proxy, nyx, prompt-templates, system, terminal, tools, upload, vault, workspace)
- `server/lib/*` (25+ core libs)
- `server/middleware/*` (8)
- `server/python/*` (4)
- `server/repositories/*` (6)
- `server/routes/*` (5)
- `server/worker.ts`

### Untracked (3)
- `apps/server/refactor_index.py`
- `apps/server/refactor_routers.py`
- `apps/server/src/`

---

## Phase 0 Verification Checklist

- [x] Repo on `main` @ `6da08173`, up to date with `origin/main`
- [x] Toolchain: Node `v24.16.0`, pnpm `11.5.1`, turbo `1.13.4`, corepack `0.35.0`
- [x] `pnpm-workspace.yaml` exists (Phase 1: verify/adjust)
- [x] Cache dirs `.turbo/`, `.pnpm-store/` present
- [x] Dirty inventory captured to external temp (v2, 48277 bytes, clean)
- [x] Analysis script written & executed (`.ps1` + output-to-file pattern)
- [x] Full analysis output chunked-read (240 lines)
- [x] 25 untracked files enumerated
- [x] `git stash -u` executed → `stash@{0}` saved
- [x] Working tree clean (except `.worktrees/` — benign)
- [x] Branch `chore/monorepo-migration` created from clean HEAD
- [x] Baseline doc written to `docs/MONOREPO_MIGRATION_BASELINE.md`

---

## Next: Phase 1 — Workspace Config

1. Verify/adjust `pnpm-workspace.yaml`
2. Remove `workspaces` from root `package.json`
3. Add `packageManager` field to root `package.json`
4. Commit → Phase 2 (Turbo v2 upgrade)

---

## Recovery Instructions

If migration needs rollback:
```bash
git checkout main
git stash pop  # restores all 642 tracked + 25 untracked changes
```

To resume migration:
```bash
git checkout chore/monorepo-migration
# Continue from Phase 1
```