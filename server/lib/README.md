# Server Library

## SSE Helpers

Use `injectSSEMetadata(res, data)` from `sseHelpers.ts`. Never monkey-patch `res.write`.

## Cache

CacheServer uses file locking via `proper-lockfile`. Always use `get()`/`set()` — never read cache files directly.
