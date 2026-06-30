# Research & Findings Log

This file is a persistent repository for any deep research, architectural discoveries, system constraints, or environment configurations discovered during problem-solving sessions.

## 2026-06-29: Agent Capabilities Upgrade
- **Research Topic**: Upgrading Antigravity's capabilities.
- **Key Findings**: 
  - Elite AI coding relies on Verification-First execution (ensuring bugs are proven fixed via tests/compilation before closing the task).
  - Deep web research should be offloaded to subagents to preserve the main context window.
  - Using an explicit `findings.md` prevents knowledge loss between sessions.
  - Integrating AST-based code search (Graphify) prevents blind modifications and limits hallucinated code assumptions.
