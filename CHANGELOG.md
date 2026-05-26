# Changelog

All notable changes to NYX will be documented in this file.

## [3.0.0] — 2026-05-27

### Added
- Helmet security headers with comprehensive CSP
- General rate limiter (200 req/min) on all API routes
- AMD GPU detection via rocm-smi + systeminformation fallback
- Per-provider Zod request body validation on all 6 provider routes
- Download queue serialization via p-queue (concurrency: 1)
- ESLint flat config + Prettier + Husky pre-commit hooks
- Linux build targets (AppImage + deb)
- CHANGELOG.md

### Changed
- Bumped inference rate limiter from 20 → 30 req/min
- Upgraded admin log watcher from fs.watch → chokidar
- Replaced manual security headers with helmet
- Session auth whitelist now uses Set + req.path (handles trailing slashes)
- manualChunks references updated: framer-motion → motion
- All frontend imports updated: framer-motion → motion/react
- electron-builder asarUnpack narrowed to only binaries, dist-server, better-sqlite3, electron-store

### Removed
- @vercel/analytics (Electron desktop app, not a Vercel web app)
- next-themes (Next.js specific, wrong framework)
- DNS override (breaks enterprise VPNs and split-horizon DNS)
- Broad node_modules asarUnpack wildcard
