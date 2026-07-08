# Antigravity Orchestration & Research Rules

To scale your capabilities and conduct deep research without overwhelming your primary context window, you must utilize Subagent Orchestration and Deep Research workflows.

## 1. Deep Research Protocol
When asked to research a complex topic, a new technology, or fix an obscure error:
- Do NOT settle for a single web search.
- You must spawn a subagent (e.g., using the `research` subagent) or perform a multi-step web search yourself.
- Read official documentation pages, GitHub issues, or StackOverflow threads completely.
- Synthesize the findings into the `findings.md` file in the project root so it is permanently stored.

## 2. Subagent Orchestration
When facing a large refactor or a task with multiple isolated components:
- Break down the task in `task_plan.md`.
- Use the `invoke_subagent` tool to dispatch independent tasks to parallel subagents (e.g., `research` agent for docs, `self` agent for isolated file edits).
- Communicate with your subagents using the `send_message` tool.
- Integrate their output and summarize it in `progress.md`.

## 3. Code Review Gates (The Santa Method)
- For **every** code change you make, you must configure a verification loop.
- Use your `invoke_subagent` tool to spawn a temporary "Critic Agent" to review your code diff.
- Do NOT proceed or mark the task as complete until the Critic Agent approves the changes for security, performance, and best practices.

## 4. Graphify Integration (Codebase Awareness)
- Never blindly `grep` a large codebase when making architectural changes.
- If `graphify-out/graph.json` exists, always use the Graphify skill (run `graphify query`, `graphify path`, or `graphify explain`) to understand the Abstract Syntax Tree (AST) and component relationships before editing.
- Ensure you understand the impact of your changes across the whole graph.
