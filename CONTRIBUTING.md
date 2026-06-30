# Contributing to NYX

Thank you for your interest in contributing to NYX!

## Development Environment
1. Node.js >= 20
2. `pnpm` workspace enabled
3. Run `pnpm install` at root
4. Run `pnpm run dev:desktop` to start the NYX desktop application (Vite + Tauri Rust backend).

## Pull Requests
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)
- Ensure all tests pass (`pnpm test:unit`, `pnpm test:e2e`)
- Include unit tests for all new core features.
- If modifying the backend (`src-tauri`), ensure Rust code passes `cargo check` and `cargo clippy`.

## Code Style
- Prettier + ESLint configuration applies to all files.
- We prefer explicit types over implicit `any`.
- Keep the bundle size minimal. Do not add heavy dependencies unless strictly necessary.
