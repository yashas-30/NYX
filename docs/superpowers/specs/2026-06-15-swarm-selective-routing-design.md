# Design Specification: Selective Swarm Routing with 15 Specialized Subagents

**Date:** 2026-06-15  
**Status:** Approved  

This document specifies the architecture and implementation details for expanding the NYX agent swarm to 15 specialized subagents and implementing a highly selective, dynamic routing mechanism to prevent unnecessary token overhead and execution latency.

---

## 1. Core Objectives
1. **Bridge Performance Gaps:** Equip NYX with 15 specialized subagents covering coding, UI/UX, databases, security, performance, devops, git, migrations, documentation, and research.
2. **Minimize Token Usage & Latency:** Ensure the Supervisor CEO agent selectively schedules only the absolute minimum required agents for any given request.
3. **Robust Tool Routing:** Ensure new agents have correct semantic and fallback tool capabilities in `AgentOrchestrator.ts`.

---

## 2. Specialized Subagents Registry

The following 15 agents will be defined in `AGENT_REGISTRY` in `AgentOrchestrator.ts`:

*   **`deep_planner`**: Complex planning and task decomposition.
*   **`deep_research`**: Comprehensive research, parallel searches, and source synthesis.
*   **`web_explorer`**: Fast single-query web search.
*   **`doc_cruncher`**: High-context code and file reading.
*   **`code_interpreter`**: Coding, scripting, executing commands in sandbox.
*   **`ui_designer`**: Styling, layouts, CSS, component aesthetics.
*   **`qa_reviewer`**: Code correctness, tests, syntax and type checking.
*   **`db_architect`**: Database schemas, ORMs, queries, migrations.
*   **`security_auditor`**: OWASP security scans, injection defense, credentials checking.
*   **`performance_optimizer`**: Execution speed, profiling, bundle size, database optimization.
*   **`deployment_devops`**: CI/CD, Docker, Kubernetes, env config.
*   **`migration_expert`**: Dependency management, version upgrades, refactoring.
*   **`docs_generator`**: Creating READMEs, inline comments (JSDoc/TSDoc), API specs.
*   **`git_collaborator`**: Git branch strategies, commit messages, PR descriptions, diff review.
*   **`persona_polisher`**: Final conversation synthesis and formatting.

---

## 3. Dynamic Selective Routing Logic

### CEO Routing Prompt Rules
We will update the `supervisorPrompt` to explicitly guide the LLM:
1. **Strict Minimization:** Routing must be selective. If a request only needs a single specialized agent (e.g. "style this page" -> `ui_designer`), only schedule that agent and `persona_polisher`.
2. **Bypass Planner:** Do not schedule `deep_planner` unless there is actual multi-step complexity.
3. **No Unrelated Runs:** Never execute agents whose specialty is unrelated to the request.

### JSON Schema Verification
We enforce strict JSON output formatting on the routing response using the Gemini 2.5 Flash structured output mode.

---

## 4. Verification Plan
- **Type Checking:** Run `npx tsc --noEmit` in `apps/server` and `apps/web`.
- **Unit Tests:** Execute `npx vitest run` to ensure routing changes do not break server tests.
- **Routing Efficacy:** Verify that a simple coding question schedules only `code_interpreter` + `persona_polisher` without invoking the web searcher or planner.
