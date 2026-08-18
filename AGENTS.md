# AGENTS.md

Unified instruction file for all AI agents (Claude, Gemini, Cursor, Antigravity, etc.) working in this repository.

---

## 1. Codebase Navigation

This project uses a **Graphify knowledge graph** at `graphify-out/`.

- Before making architectural changes, run `graphify query "<question>"` (or use the `query_graph` MCP tool) to understand structure. Do not blindly grep a large codebase.
- Use `graphify path "<A>" "<B>"` for cross-file relationships.
- Use `graphify explain "<concept>"` for focused concept breakdowns.
- If `graphify-out/wiki/index.md` exists, navigate it for broad orientation.
- After modifying files, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Skip graphify only if the task explicitly concerns stale graph output or the user says not to use it.

---

## 2. Behavioral Rules

### Think Before Coding
- State assumptions explicitly. If uncertain, ask — do not guess and implement.
- If multiple interpretations exist, name them and ask. Do not silently pick one.
- If a simpler approach exists, say so.

### Minimal, Surgical Changes
- Write the minimum code that solves the problem. Nothing speculative.
- Touch only what the task requires. Do not "improve" adjacent code unless asked.
- Match the existing code style, even if you'd write it differently.
- If your changes make imports/variables/functions unused, remove them. Leave pre-existing dead code alone unless asked.
- Every changed line should trace directly to the user's request.

### No Sycophancy
- Do not open with "Great question!" or agree reflexively.
- If a proposed approach is insecure, inefficient, or an anti-pattern, push back. State the risk and propose a better alternative. Base it on technical merit, not opinion.
- If something is too ambiguous, stop and ask instead of guessing.

### Verify, Don't Assume
- Do not claim a bug is fixed or a feature is complete without empirical proof.
- Run tests, compile, or execute to verify before marking anything done.
- If an atomic step fails 3 times, stop and escalate — don't keep pushing forward.

---

## 3. Working Memory

At the start of any non-trivial request, read these files if they exist:
- `task_plan.md` — current goal, phases, pending items
- `progress.md` — completed steps, decisions made, files modified
- `findings.md` — discovered constraints, research results, lessons learned

Update them automatically during work. Do not ask for permission to update them.

For complex tasks, write a brief technical spec in `task_plan.md` (architecture, data flow, constraints) **before writing any code**.

---

## 4. Multi-File & Parallel Tasks

- Break large tasks into atomic steps in `task_plan.md` — never modify more than 2–3 files in an unverified sweep.
- Use `invoke_subagent` to dispatch independent tasks to parallel agents.
- Integrate subagent output and summarize in `progress.md`.
- For major refactors or new features, branch first: `git checkout -b feature/<name>`. Never commit large changes directly to `main`.

---

## 5. Code Review Gates

For every non-trivial change:
1. Run the test suite or compilation before marking done.
2. For security-sensitive or architectural changes, spawn a Critic subagent to review the diff before proceeding.
3. Only merge to `main` after all atomic steps are verified and tests are green.

---

## 6. UI & Design System

All frontend work in this project must follow the **Premium Minimalist True Black** design system defined in [`DESIGN.md`](./DESIGN.md).

When making any frontend changes, creating UI components, or implementing design features, apply these skills:
1. `emil-design-eng`
2. `impeccable`
3. `design-taste-frontend`

Do not generate basic or generic AI-default UI. Every interface must feel intentional, premium, and motion-aware.
