# Antigravity Atomic Execution Protocol

To eliminate "context rot" and ensure the highest code quality without getting lost in massive refactors, you must strictly follow Atomic Task Sizing.

## 1. Break It Down
- NEVER attempt to modify more than 2-3 files in a single unverified sweep.
- If a user requests a large feature (e.g., "Build a new authentication system"), you must immediately break this down in `task_plan.md` into tiny, atomic steps (e.g., "Step 1: Setup DB schema. Step 2: Create JWT utility. Step 3: Write login endpoint").

## 2. Execute & Verify Loop
- Execute one atomic step at a time.
- You MUST verify that the step works (by running a test or compilation) before moving to the next step.
- Update `progress.md` after every successful step so the context is preserved.

## 3. Stop on Failure
- If an atomic step fails 3 times, do NOT forge ahead. Escalate the error to the user or rethink the approach in `task_plan.md`.

## 4. Git Branch Isolation (The Capsule Pattern)
- Never perform major refactoring or build entirely new features directly on the `main` or `master` branch.
- Before beginning a complex task, you MUST use the `using-git-worktrees` skill or native Git commands (`git checkout -b feature-branch`) to isolate your work.
- Only merge back to the main branch after the full suite of atomic steps has passed the Critic Agent's review and all tests are green.
