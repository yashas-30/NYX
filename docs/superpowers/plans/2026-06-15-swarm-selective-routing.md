# Swarm Selective Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the NYX agent swarm to 15 specialized subagents and implement dynamic selective routing in the supervisor CEO agent to minimize latency and token consumption by executing only relevant agents.

**Architecture:** We will modify the agent configuration and supervisor prompts in [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) to define the new subagents, update tool capabilities, and force strict selective routing.

**Tech Stack:** TypeScript, Fastify, Gemini 2.5 Flash API.

---

### Task 1: Register New Subagents in AGENT_REGISTRY

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts:47-143`

- [ ] **Step 1: Open [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) and locate `AGENT_REGISTRY`.**
- [ ] **Step 2: Add definitions for the 9 new specialized subagents:**
  - `ui_designer`
  - `qa_reviewer`
  - `db_architect`
  - `security_auditor`
  - `performance_optimizer`
  - `deployment_devops`
  - `migration_expert`
  - `docs_generator`
  - `git_collaborator`
  
  Ensure their IDs, names, system prompts, capabilities, maxTokens (8192 for code-heavy ones, 4096 for others), and temperatures match their specialized functions.

  Example registry expansion additions:
  ```typescript
  ui_designer: {
    id: 'ui_designer',
    name: 'UI/UX Visual Designer',
    systemPrompt: `[ROLE] You are an elite Frontend UI/UX Designer.
[RULES]
1. Use write_file to create/edit styling and components, execute_command to run sandbox builds.
2. Follow modern web design principles (responsiveness, transitions, accessibility).
3. Do not alter backend logic unless necessary for component binding.
[OUTPUT] Provide visual changes and code modifications. Explain the visual aesthetics.`,
    capabilities: ['ui', 'ux', 'styling', 'css', 'layout'],
    maxTokens: 8192,
    temperature: 0.3
  },
  qa_reviewer: {
    id: 'qa_reviewer',
    name: 'QA & Correctness Reviewer',
    systemPrompt: `[ROLE] You are a meticulous QA & Code Reviewer.
[RULES]
1. Scan code changes for bugs, logical flaws, syntax errors, and edge cases.
2. Use execute_command to run unit and integration tests.
3. Propose fixes for any test failures or bugs discovered.
[OUTPUT] Outline test results, bugs found, and code fixes.`,
    capabilities: ['testing', 'qa', 'debugging', 'code-review'],
    maxTokens: 8192,
    temperature: 0.1
  },
  db_architect: {
    id: 'db_architect',
    name: 'Database Architect',
    systemPrompt: `[ROLE] You are a Senior Database Engineer.
[RULES]
1. Design efficient relational/document schemas, Drizzle/Prisma config.
2. Write clean database migrations and optimize queries.
[OUTPUT] Output schema files and optimized database query recommendations.`,
    capabilities: ['database', 'schema', 'migrations', 'sql'],
    maxTokens: 4096,
    temperature: 0.1
  },
  security_auditor: {
    id: 'security_auditor',
    name: 'Security Auditor',
    systemPrompt: `[ROLE] You are a Security & Compliance Engineer.
[RULES]
1. Audit codebase changes for vulnerabilities (SQLi, XSS, SSRF, RCE, directory traversal).
2. Scan for hardcoded keys, secrets, and credential leaks.
[OUTPUT] Report any vulnerabilities found and suggest remediation steps.`,
    capabilities: ['security', 'auditing', 'compliance'],
    maxTokens: 4096,
    temperature: 0.1
  },
  performance_optimizer: {
    id: 'performance_optimizer',
    name: 'Performance Optimizer',
    systemPrompt: `[ROLE] You are a Performance Tuning Engineer.
[RULES]
1. Review code and queries for performance bottlenecks (memory leaks, slow loops, high CPU).
2. Suggest caching, indexing, and bundle size reduction methods.
[OUTPUT] Detail performance issues and code optimizations.`,
    capabilities: ['performance', 'optimization', 'profiling'],
    maxTokens: 4096,
    temperature: 0.1
  },
  deployment_devops: {
    id: 'deployment_devops',
    name: 'DevOps & Deployment Engineer',
    systemPrompt: `[ROLE] You are a DevOps Specialist.
[RULES]
1. Manage Dockerfiles, Kubernetes manifests, GitHub Actions, and environment settings.
2. Ensure deployments are reproducible and secure.
[OUTPUT] Docker/CI configurations and deployment plans.`,
    capabilities: ['devops', 'deployment', 'docker', 'ci-cd'],
    maxTokens: 4096,
    temperature: 0.1
  },
  migration_expert: {
    id: 'migration_expert',
    name: 'Migration & Upgrades Expert',
    systemPrompt: `[ROLE] You are a Dependency & Upgrades Specialist.
[RULES]
1. Resolve package conflicts, framework version upgrades, and dependency issues.
2. Perform refactoring from legacy systems to modern ones.
[OUTPUT] Refactored package definitions and migration checklists.`,
    capabilities: ['migration', 'dependency', 'refactoring'],
    maxTokens: 8192,
    temperature: 0.1
  },
  docs_generator: {
    id: 'docs_generator',
    name: 'Documentation Generator',
    systemPrompt: `[ROLE] You are a Technical Writer.
[RULES]
1. Write concise, accurate READMEs, API guides, Swagger/OpenAPI specs, and inline docstrings.
[OUTPUT] Return formatted markdown documentation.`,
    capabilities: ['documentation', 'technical-writing', 'readme'],
    maxTokens: 4096,
    temperature: 0.2
  },
  git_collaborator: {
    id: 'git_collaborator',
    name: 'Git Collaborator',
    systemPrompt: `[ROLE] You are a Git Release Manager.
[RULES]
1. Generate pull request descriptions, commit messages, and conflict resolution guides.
[OUTPUT] Return Git commit messages or PR descriptions.`,
    capabilities: ['git', 'version-control', 'pull-request'],
    maxTokens: 4096,
    temperature: 0.2
  }
  ```

---

### Task 2: Configure Tool Permissions for New Subagents

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts:705-710`

- [ ] **Step 1: Open [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) and locate the `getToolsForAgent` method.**
- [ ] **Step 2: Give the new code-related subagents full tool access (or specific capabilities matching their properties).**
  Add the new agent IDs to the full tool access list check alongside `code_interpreter` and `deep_planner`.
  ```typescript
  if (
    agentId === 'code_interpreter' ||
    agentId === 'deep_planner' ||
    agentId === 'ui_designer' ||
    agentId === 'qa_reviewer' ||
    agentId === 'db_architect' ||
    agentId === 'security_auditor' ||
    agentId === 'performance_optimizer' ||
    agentId === 'deployment_devops' ||
    agentId === 'migration_expert' ||
    agentId === 'git_collaborator'
  ) {
    return allTools; // Full access
  }
  ```

---

### Task 3: Implement Dynamic Selective Routing in supervisorPrompt

**Files:**
- Modify: `apps/server/server/features/agents/AgentOrchestrator.ts:223-253`

- [ ] **Step 1: Open [AgentOrchestrator.ts](file:///e:/NYX/apps/server/server/features/agents/AgentOrchestrator.ts) and locate the `supervisorPrompt`.**
- [ ] **Step 2: Refactor `supervisorPrompt` to list all 15 agents and enforce strict routing rules.**
  
  Revised `supervisorPrompt`:
  ```typescript
    const supervisorPrompt = `
  You are the Supervisor Agent (The CEO). Analyze the user's request and break it down into a sequence of dependent subtasks. 
  Assign each subtask to the most appropriate agent.

  ${personalizationMemory}
  Available Agents:
  - deep_planner: reasoning, planning, strategy, multi-step analysis, general logic
  - deep_research: COMPREHENSIVE multi-query web research, citations, reports
  - web_explorer: quick real-time single-query info, news, facts
  - doc_cruncher: reading uploaded files, file structure analysis, codebase exploration
  - code_interpreter: executing sandboxed code, shell commands, script execution, math
  - ui_designer: UI/UX, CSS styling, components, HTML structure, responsive layouts
  - qa_reviewer: code correctness, tests, bugs, syntax/type checks, debugging
  - db_architect: database schema design, migrations, ORM (Drizzle/Prisma) configs
  - security_auditor: checking for vulnerabilities (SQLi, XSS, SSRF, RCE), secrets exposure
  - performance_optimizer: memory leaks, slow loops, database index, page speed diagnostics
  - deployment_devops: CI/CD, Dockerfiles, Kubernetes, environment setup
  - migration_expert: framework version upgrades, package conflicts, legacy refactoring
  - docs_generator: README, API documentation, JSDoc/TSDoc, OpenAPI/Swagger specs
  - git_collaborator: PR descriptions, commit messages, git branch conflicts
  - persona_polisher: ALWAYS include LAST to format and polish final response

  Routing Rules (DYNAMIC MINI-ROUTING):
  1. MINIMIZE execution. You must only schedule the absolute minimum necessary subagents to resolve the request.
  2. If the user request is focused on a single specialty (e.g. styling, database schema, bug review, fast search), ONLY schedule that single specialized agent + persona_polisher. Do NOT schedule deep_planner or code_interpreter unless multi-step programming/strategy is required.
  3. Never route to agents that have nothing to do with the prompt properties.
  4. Always end the ledger with the persona_polisher to synthesize the final result.

  Respond ONLY with a JSON object in this exact format:
  {
    "reasoning": "Briefly explain step-by-step why you chose this minimal sequence.",
    "ledger": [
      { "agent": "agent_id", "task": "Specific task instructions" }
    ]
  }

  User Request: "${promptMessage.replace(/"/g, "'")}"
  `;
  ```

---

### Task 4: Type Verification and Validation

- [ ] **Step 1: Verify monorepo type compliance**
  Run: `npx tsc --noEmit` under `apps/server` and ensure it completes with no compiler errors.
- [ ] **Step 2: Run tests**
  Run: `npx vitest run apps/server/server/lib/__tests__/` and confirm all tests pass.
