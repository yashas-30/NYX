# Code Generation Rules — NYX

This project is a **TypeScript/React/Rust (Tauri)** monorepo. The following rules apply to all code generation.

## TypeScript / React

- Use functional components and hooks. No class components.
- Prefer explicit types over `any`. Use `unknown` when the type is truly unknown.
- Co-locate types with the code that uses them. Shared types live in `@src/infrastructure/types`.
- Use named exports. Avoid default exports except for page-level components.
- State management: Zustand stores only. No Redux, no Context for global state.
- Async: use `async/await`. No raw `.then()` chains.
- Error handling: surface errors explicitly. Never swallow with empty catch blocks.

## Rust (src-tauri)

- Use `Result<T, E>` for fallible operations. Never `unwrap()` in non-test code.
- Use structured error types, not string errors.
- Async: `tokio` runtime. Keep blocking work off the async executor.

## General

- Do not add dependencies for things the platform already provides.
- If you need a utility that already exists in the codebase, use it — don't rewrite it.
- All new files must have a brief doc comment explaining their purpose.
