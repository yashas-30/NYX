# AGENTS.md

Unified instruction file for all AI agents (Antigravity, Claude, Gemini, Cursor, etc.) working in the NYX codebase.

---

## 1. Zero Overfitting & Clean Architecture (Critical Rule)

- **NEVER HARDCODE SPECIFIC DATA**: Never hardcode topic-specific strings, sample text, prompt phrases, or ad-hoc regex matches to pass a test or fix a single run.
- **Grammar & AST-Driven Logic**: Parsers, compilers, and processors must operate purely on structural syntax and grammar (e.g. delimiters, frontmatter blocks, Markdown AST, token streams).
- **Domain-Agnostic Code**: Core logic must handle any arbitrary user prompt or document structure cleanly without brittle string keyword filters.
- **No Speculative or Ad-Hoc Patches**: Fix the underlying architectural root cause instead of patching surface symptoms.

---

## 2. Skill & MCP Tool Utilization

Before designing or modifying complex features, agents MUST consult and apply the relevant specialized skills and MCP tools:

| Domain                              | Mandatory Skills / MCPs                                               | Core Responsibility                                                                                                           |
| ----------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frontend & UI Systems**           | `emil-design-eng`, `impeccable`, `design-taste-frontend`, `StitchMCP` | Enforce True Black Minimalist design system (`DESIGN.md`), eliminate AI-default UI, ensure smooth motion.                     |
| **Code Architecture & Refactoring** | `systematic-debugging`, `tdd-workflow`, `clean-code`                  | Isolate root causes, implement RED-GREEN-REFACTOR cycles, keep code minimal and clean.                                        |
| **Knowledge Graph & Navigation**    | `graphify` (CLI or MCP `query_graph`)                                 | Query code relationships and architecture before making cross-file changes. Update graph after changes (`graphify update .`). |
| **Agent Behavior & Tone**           | `claude-persona`                                                      | Warm, concise, direct, zero sycophancy, no conversational fluff.                                                              |

---

## 3. Presentation & Slidev Engine Standards

1. **Slidev Grammar Contract**:
   - Documents start with YAML headmatter delimited by `---`.
   - Slides are delimited by `---` surrounded by newlines outside code blocks.
   - Layout directives (`layout: cover`, `two-cols`, `default`, `fact`, `quote`, `section`, `end`) determine rendering structure.
   - Slot syntax: `::right::` partitions two-column content.
   - Presenter notes: `<!-- note: ... -->` at the bottom of each slide.
2. **Parser Boundaries**:
   - The parser must cleanly separate pre-deck noise/scratchpad from actual Slidev frontmatter using structural boundaries.
   - Never drop intermediate slides. Enforce full $N$-slide sequence compilation without premature truncation.
3. **No Externalized Thinking / Word Counts**:
   - Prompts must strictly forbid outputting scratchpads, word-count verifications (`Count: word1...`), or self-checks outside designated `<think>` tags.

---

## 4. Behavioral & Engineering Rules

### Minimal, Surgical Changes

- Write the minimum clean code that solves the problem.
- Touch only what the task requires. Do not touch adjacent code unless directly related.
- Match existing repository patterns and TypeScript/Rust idioms.
- Remove any unused imports/variables introduced by your edits.

### No Sycophancy & Direct Engineering

- Never open with flattering remarks ("Great question!", "Certainly!").
- If a proposed direction is inefficient, fragile, or an anti-pattern, explain why and propose the superior technical approach.
- State assumptions explicitly. If requirements are ambiguous, clarify before executing.

### Verify, Don't Assume

- Never declare a bug fixed or a task complete without running automated tests (`vitest`, `cargo test`, `typecheck`).
- Write comprehensive, domain-agnostic unit tests covering edge cases.
- If a verification step fails, stop, diagnose systematically, and fix the root cause.

---

## 5. UI & Design System

All frontend work must strictly follow the **Premium Minimalist True Black** design system in [`DESIGN.md`](./DESIGN.md):

- **Canvas Background**: `#000000` (True Black).
- **Surface Cards**: `#09090b` (Primary Surface) / `#121214` (Elevated Card).
- **Borders**: `border-white/10` (Subtle Obsidian).
- **Typography & Accents**: Monospaced metadata badges, zinc/white scale, no unstyled default elements.
