# NYX Project Cleanup Plan

> Based on the complete codebase analysis, this plan targets the most critical organizational issues.

---

## Phase 0: BACKUP (Do This First)

Before making any changes, create a backup branch:

```bash
git stash -u
git checkout -b backup/cleanup-$(date +%Y%m%d)
git stash pop
```

If you want to be extra safe, also tag the current state:
```bash
git tag -a before-cleanup-$(date +%Y%m%d) -m "Backup before cleanup"
```

---

## Phase 1: Root Directory Debris (P0 - Critical)

### 1.1 Create Structured Directories

```bash
mkdir -p tools/one-off
mkdir -p tools/outputs
mkdir -p tools/scratch
mkdir -p archive/audits
mkdir -p archive/exports
mkdir -p tmp
```

### 1.2 Move One-Off Scripts (25 files)

```bash
mv analyze_clones.py tools/one-off/
mv extract_panel.py tools/one-off/
mv fix_dupes.py tools/one-off/
mv fix_server.py tools/one-off/
mv fix_server_2.py tools/one-off/
mv fix_ts.cjs tools/one-off/
mv fix_tsc_errors.js tools/one-off/
mv generate_pdf.cjs tools/one-off/
mv implement_features.cjs tools/one-off/
mv migrate_manual.cjs tools/one-off/
mv migrate_prompt.cjs tools/one-off/
mv migrate_prompt.js tools/one-off/
mv migrate_prompt.ts tools/one-off/
mv refactor_routers.cjs tools/one-off/
mv revert_extensions.cjs tools/one-off/
mv rewrite-port.cjs tools/one-off/
mv rewrite-unified.cjs tools/one-off/
mv rewrite-vram.cjs tools/one-off/
mv rewrite.cjs tools/one-off/
mv suppress_clones.cjs tools/one-off/
mv suppress_clones.py tools/one-off/
```

### 1.3 Move Tool Output Files (65+ files)

```bash
# Batch files
mv batch_*.json tools/outputs/

# Partition files
mv partition_*.json tools/outputs/

# Fallow outputs
mv fallow_*.json tools/outputs/

# Lint / typecheck outputs
mv lint_output*.txt tools/outputs/
mv typecheck_output*.txt tools/outputs/
mv typecheck_output2*.txt tools/outputs/
mv typescript_errors.txt tools/outputs/

# Other tool outputs
mv partition_clones.cjs tools/outputs/
mv payload.json tools/outputs/
```

### 1.4 Move Audit / Export Artifacts

```bash
mv nyx_audit.md archive/audits/
mv nyx_audit.pdf archive/audits/
mv nyx_codebase_audit.pdf archive/audits/
mv NYX_Codebase_For_AI_Studio.md archive/exports/
mv NYX_Project_For_AI_Studio.zip archive/exports/
```

### 1.5 Delete Temporary Files (Do NOT move these — they're trash)

```bash
rm temp.ts
rm temp_transcript.txt
rm test.txt
rm ddg.html
rm help.txt
rm panel.txt
rm diff.txt
rm server.ts.bak
rm scratch.py
rm "C:Usersyasha.claudeplanshumming-coalescing-stream-agent-ad5a9f3504ecf39c9.md"
```

### 1.6 Move Miscellaneous Files

```bash
# If you want to keep these PDF configs, move them; otherwise delete
mv pdf-config.json archive/ || rm pdf-config.json
mv pdf-style.css archive/ || rm pdf-style.css
```

---

## Phase 2: Extract Embedded Foreign Projects (P0 - Critical)

These are 4 separate projects embedded inside your monorepo. They should live in their own repos or in an `external/` folder.

### 2.1 Move to external/ Directory

```bash
mkdir -p external
mv animateicons_temp external/animateicons
mv claude-obsidian external/claude-obsidian
mv nyx-antigravity-extension external/nyx-antigravity-extension
mv test_genai_bin external/test_genai_bin
```

### 2.2 Add to .gitignore

Edit `.gitignore` and add:

```gitignore
# External projects (separate repos)
/external/

# Tool outputs
/tools/outputs/
/tools/outputs/*
/tools/scratch/*

# Archive (keep locally but don't commit)
/archive/audits/*
/archive/exports/*

# Temp files
tmp/
```

### 2.3 Alternative: Delete Instead of Move

If you don't need these projects, just delete them:

```bash
rm -rf animateicons_temp
rm -rf claude-obsidian
rm -rf nyx-antigravity-extension
rm -rf test_genai_bin
```

---

## Phase 3: Consolidate Test Directories (P1 - High)

### 3.1 Merge test/ into tests/

```bash
# Move the single test file from test/ into tests/
mv test/setup.ts tests/setup.ts
rmdir test  # Remove empty directory
```

### 3.2 Merge e2e/ into tests/e2e/

```bash
# Root e2e has one file: app.spec.ts
mv e2e/app.spec.ts tests/e2e/app.spec.ts
rmdir e2e  # Remove empty directory
```

### 3.3 Check apps/web/e2e/ for Duplicates

```bash
ls -la apps/web/e2e/
# If this contains redundant files, either delete them or merge into tests/e2e/
```

### 3.4 Delete Build Artifacts (if committed to git)

```bash
rm -rf playwright-report
rm -rf test-results
# Then add to .gitignore
```

Add to `.gitignore`:
```gitignore
playwright-report/
test-results/
```

---

## Phase 4: Consolidate AI Tool Configs (P1 - High)

You have AI agent configs scattered in 7+ locations. Consolidate them.

### 4.1 Create Unified Directory

```bash
mkdir -p .ai
mkdir -p .ai/agents
mkdir -p .ai/skills
mkdir -p .ai/workflows
mkdir -p .ai/rules
```

### 4.2 Move Configs

```bash
# Agents
mv .agents/rules/* .ai/rules/ 2>/dev/null || true
mv .agents/skills/* .ai/skills/ 2>/dev/null || true
mv .agents/workflows/* .ai/workflows/ 2>/dev/null || true
rm -rf .agents

# Claude
mv .claude/skills/* .ai/skills/ 2>/dev/null || true
rm -rf .claude

# CommandCode
mv .commandcode/skills/* .ai/skills/ 2>/dev/null || true
mv .commandcode/taste/* .ai/taste/ 2>/dev/null || true
rm -rf .commandcode

# Gemini
rm -rf .gemini  # or archive if needed

# GitHub agents/skills
mv .github/agents/* .ai/agents/ 2>/dev/null || true
mv .github/skills/* .ai/skills/ 2>/dev/null || true
rm -rf .github/agents
rm -rf .github/skills

# VS Code skills
mv .vscode/skills/* .ai/skills/ 2>/dev/null || true
rm -rf .vscode/skills
```

### 4.2 Update .cursorrules

`.cursorrules` is a Cursor-specific file. Either keep it at root (if Cursor needs it there) or move to `.ai/cursorrules` and create a symlink.

---

## Phase 5: Clean Build Artifacts & Generated Files (P1 - High)

### 5.1 Add to .gitignore (if not already there)

```bash
cat >> .gitignore << 'EOF'

# Build artifacts (root level)
/dist/
/dist-desktop/
/release/

# Generated data files
*.db
*.db-journal
*.db-wal
*.db-shm
nyx.db*
conversations.json
config.json

# Logs
*.log
server.log
server.err
EOF
```

### 5.2 Remove Committed Build Artifacts

```bash
# If these are tracked in git and should not be:
git rm -rf dist dist-desktop release 2>/dev/null || true
# If they're untracked, just delete:
rm -rf dist dist-desktop release
```

### 5.3 Clean Turbo Cache

```bash
rm -rf .turbo/cache
# Keep .turbo/daemon and .turbo/cookies if needed for dev
```

---

## Phase 6: Fix Orphaned Infrastructure (P1 - High)

Since the Fastify server is deleted, these files are stale. You have 2 choices:

### Option A: Delete All Server Infrastructure (Commit to Tauri-Only)

```bash
rm -f Dockerfile
rm -f docker-compose.yml
rm -f nginx.conf
rm -f kubernetes.yaml
rm -rf k8s/
rm -f scripts/build-server.js
rm -rf tests/integration/api.test.ts  # Broken test
rm -rf server/  # Only has data/ — likely dead
```

Update `README.md` and `CONTRIBUTING.md` to remove Fastify server references.

### Option B: Restore Server from Worktree

```bash
# Copy server from worktree back to working tree
cp -r .worktrees/monorepo-consolidation/apps/server apps/server
# Then fix infrastructure files to match
```

> **Recommendation**: If you intend to keep the Tauri desktop app as the primary distribution, go with **Option A**. If you want a browser-based web app that works without installing Tauri, you need the server — go with **Option B**.

---

## Phase 7: Delete Abandoned Packages (P2 - Medium)

### 7.1 Delete Empty @nyx/uploads

```bash
rm -rf packages/uploads
```

Update `pnpm-workspace.yaml` to remove it:
```yaml
packages:
  - "apps/*"
  - "packages/*"
# Remove uploads from anywhere if explicitly listed
```

### 7.2 Delete or Fix @nyx/ui

This package is incomplete and unused. Either:

**Delete it:**
```bash
rm -rf packages/ui
```

**Or fix it** (create missing files):
```bash
# Create package.json
cat > packages/ui/package.json << 'EOF'
{
  "name": "@nyx/ui",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@nyx/config": "workspace:*",
    "tsup": "^8.5.1",
    "typescript": "~6.0.3"
  }
}
EOF

# Create missing utils/cn.ts
cat > packages/ui/src/utils/cn.ts << 'EOF'
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
EOF

# Create index.ts export
cat > packages/ui/src/index.ts << 'EOF'
export { Button } from './components/Button';
export { Input } from './components/Input';
export * from './tokens/animations';
export * from './tokens/colors';
export * from './tokens/spacing';
export * from './tokens/typography';
export { cn } from './utils/cn';
EOF
```

> **Recommendation**: Delete it unless you have a concrete plan to build a design system. The web app doesn't use it anyway.

### 7.3 Delete Dead apps/web-legacy

```bash
rm -rf apps/web-legacy
```

Update `pnpm-workspace.yaml` if needed (it uses `apps/*` glob, so this should be automatic).

---

## Phase 8: Consolidate Documentation (P2 - Medium)

### 8.1 Merge Architecture Docs

You have competing architecture docs:
- `ARCHITECTURE.md` (25 lines, generic)
- `architecture_overview.md` (34KB, detailed)

```bash
# Keep the detailed one, archive the short one
mv ARCHITECTURE.md archive/ARCHITECTURE_legacy.md
mv architecture_overview.md ARCHITECTURE.md
```

### 8.2 Archive or Delete Duplicate Context Files

```bash
# These are AI-specific context files that may be outdated
mv CLAUDE.md archive/ || rm CLAUDE.md
mv GEMINI.md archive/ || rm GEMINI.md
mv CHAT_INITIALIZATION_ANALYSIS.md archive/ || rm CHAT_INITIALIZATION_ANALYSIS.md
```

### 8.3 Update README.md

The README currently references deleted server code. Key fixes needed:
- Remove or update `apps/server/` references
- Update `pnpm run dev` to reflect current behavior (starts Vite only, not Fastify)
- Update architecture diagram to show Tauri, not Fastify
- Remove or update Docker/deployment sections

### 8.4 Update CONTRIBUTING.md

```bash
# Update to reflect Tauri-only development
# Change: "Run pnpm run dev to start both the Vite frontend and Fastify backend"
# To:     "Run pnpm run dev to start the Vite frontend (Tauri backend runs separately via pnpm tauri dev)"
```

---

## Phase 9: Graphify Cache Cleanup (P2 - Medium)

### 9.1 Decide on graphify-out/

```bash
# If graphify is still used and the graph is current, keep it but add to .gitignore
cat >> .gitignore << 'EOF'

# Graphify cache (large, can be regenerated)
graphify-out/cache/
graphify-out/2026-*/
graphify-out/graph.json
graphify-out/manifest.json
graphify-out/GRAPH_REPORT.md
EOF

# Keep only the essential config files
# .graphify_analysis.json, .graphify_labels.json, .graphify_root, .graphify_python
```

---

## Phase 10: Git Cleanup (P2 - Medium)

### 10.1 Clean Git Worktrees

```bash
# Check if .worktrees/ is still needed
git worktree list
# If monorepo-consolidation is not needed:
git worktree remove .worktrees/monorepo-consolidation
rm -rf .worktrees
```

### 10.2 Update .gitignore for New Directories

```bash
cat >> .gitignore << 'EOF'

# Tools (keep source, ignore outputs)
/tools/outputs/*
!/tools/outputs/.gitkeep
/tools/scratch/*
!/tools/scratch/.gitkeep

# Archive (keep structure, ignore large files)
/archive/audits/*
/archive/exports/*

# External projects
/external/
EOF

# Create .gitkeep files so directories are tracked even if empty
touch tools/outputs/.gitkeep
touch tools/scratch/.gitkeep
```

---

## Phase 11: Verification Checklist

After all cleanup, verify:

```bash
# 1. Count root files (should drop from ~140 to ~40)
ls -1 | grep -v '^\.' | grep -v '^node_modules' | wc -l
# Target: < 50 items at root

# 2. Verify no orphaned files remain
find . -maxdepth 1 -name '*.json' ! -name 'package.json' ! -name 'pnpm-lock.yaml' ! -name 'tsconfig.json' ! -name 'turbo.json' ! -name 'pnpm-workspace.yaml' ! -name 'metadata.json' ! -name 'skills-lock.json' ! -name 'vercel.json' ! -name 'ecosystem.config.cjs' ! -name 'vitest.config.ts' ! -name 'playwright.config.ts' ! -name 'eslint.config.mjs' ! -name 'docker-compose.yml' ! -name 'kubernetes.yaml' ! -name 'nginx.conf' ! -name 'fallow.toml' ! -name 'pdf-config.json' ! -name 'models.json' ! -name 'CHANGELOG.md' ! -name 'DESIGN.md' ! -name 'PRODUCT.md' ! -name 'CONTRIBUTING.md' ! -name 'README.md' ! -name 'AGENTS.md' ! -name 'ARCHITECTURE.md' ! -name 'DESIGN.md'

# 3. Verify no temp files
find . -maxdepth 1 -name 'temp*' -o -name 'scratch*' -o -name 'test.txt' -o -name 'help.txt' -o -name 'panel.txt' -o -name 'diff.txt'

# 4. Verify pnpm workspace still works
cd /c/NYX && pnpm install

# 5. Verify builds still work
pnpm run build

# 6. Check git status for deleted files
git status
```

---

## Phase 12: Git Commit

After all cleanup is done and verified:

```bash
# Stage all changes
git add -A

# Commit with a clear message
git commit -m "chore: massive repository cleanup

- Moved 25 one-off scripts to tools/one-off/
- Moved 65+ tool output files to tools/outputs/
- Archived audit/exports to archive/
- Deleted 10+ temp and scratch files
- Extracted 4 embedded foreign projects to external/
- Consolidated test directories into tests/
- Consolidated AI configs into .ai/
- Removed orphaned server infrastructure (Dockerfile, nginx, k8s, docker-compose)
- Deleted empty/abandoned packages (@nyx/uploads, @nyx/ui, apps/web-legacy)
- Merged architecture docs into single ARCHITECTURE.md
- Updated .gitignore for build artifacts, outputs, and external projects
- Added .gitkeep files for tracked empty directories

Refs: cleanup-plan-$(date +%Y%m%d)"
```

---

## Expected Result

| Metric | Before | After |
|--------|--------|-------|
| Root files (non-hidden) | ~140 | ~40 |
| Embedded projects | 4 inside repo | 0 inside repo |
| Test directories | 5 scattered | 1 unified |
| AI config locations | 7+ | 1 (`/.ai/`) |
| Orphaned infra files | 6+ | 0 (or restored) |
| Empty/abandoned packages | 2 | 0 |
| Temp files | 10+ | 0 |

---

## Optional: Script to Automate Most of This

If you want to run this as a single script, I can generate one. However, **I strongly recommend doing this manually and reviewing each step**, especially for Phase 6 (server infrastructure) — you need to decide whether to restore the Fastify server or commit to Tauri-only.

