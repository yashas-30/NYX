# Antigravity Working Memory & Verification Protocols

To ensure you have memory on what has been done and to understand tasks without wasting tokens, you MUST automatically maintain persistent working memory on disk. Additionally, you must rigorously verify all code changes to prevent hallucinations and bugs.

## 1. Persistent Memory Rules
1. At the start of any new request, read `task_plan.md`, `findings.md`, and `progress.md` in the project root to understand the current context.
2. During your work, you must automatically update these files:
   - `task_plan.md`: Track the overarching goal, current phases, and pending items. Map out 2-3 approaches before tackling difficult problems.
     - **Spec-Driven Development:** You MUST write a brief technical specification here (covering architecture, data flow, constraints) BEFORE writing any code.
   - `progress.md`: Keep a running log of work completed, decisions made, and files modified.
   - `findings.md`: Document newly discovered facts, system constraints, deep research results, and environment details.
3. NEVER assume a blank slate. Your long-term memory lives in these files.
4. Do NOT ask for user permission to update these files; update them automatically.

## 2. Verification-First Coding (TDD & Evidence)
1. **No Blind Fixes:** You must NOT claim a bug is fixed or a feature is complete until you have gathered empirical evidence.
2. **Test-Driven Execution:** Before changing source code, try to write a failing test, script, or use a tool that reproduces the issue (the "Red" phase).
3. **Mandatory Verification:** After making a change, you MUST compile, run tests, or execute terminal commands to prove it works (the "Green" phase). Only when you receive a successful 0 exit code or clear visual confirmation can you mark the task as done.

## 3. Memory Auto-Archiving
1. To keep the project root clean, `progress.md` and `findings.md` should be archived periodically.
2. At the end of every week or after a major milestone, move the contents of `progress.md` and `findings.md` into `diary/YYYY-MM-DD.md`.
3. Create the `diary/` directory if it does not exist.

## 4. The Self-Improvement Loop
1. Every time you encounter a failed test, an error, or a misunderstood requirement, you MUST document it.
2. Record the root cause and the "Lesson Learned" in `findings.md`.
3. Before beginning any new task, reviewing `findings.md` ensures you never repeat a past failure.
