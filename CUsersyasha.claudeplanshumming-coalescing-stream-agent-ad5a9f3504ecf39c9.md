# Transition to Standard Node ESM

## Goal
Transition the backend from 'Bundler-style ESM' (using `.ts` extensions and `moduleResolution: bundler`) to 'Standard Node ESM' (using `.js` extensions and `moduleResolution: NodeNext`).

## Implementation Strategy

### 1. TypeScript Configuration
- **Base Configuration**: Create `packages/config/tsconfig.base.json` to centralize NodeNext settings.
- **Server Configuration**: Update `apps/server/tsconfig.json` to extend the new base config and remove bundler-specific overrides.

**`packages/config/tsconfig.base.json` content:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowJs": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

### 2. Build System Migration (`esbuild` -> `tsup`)
- **Config Creation**: Create `apps/server/tsup.config.ts` to replace the long `esbuild` CLI command.
- **Script Update**: Update `apps/server/package.json` to use `tsup`.

**`apps/server/tsup.config.ts` content:**
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts', 'server/worker.ts'],
  format: ['esm'],
  target: 'node22',
  minify: true,
  clean: true,
  outDir: 'dist-server',
  banner: {
    js: `import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);`,
  },
  external: [
    'better-sqlite3', 'onnxruntime-node', 'esbuild', 'sharp', 'lightningcss',
    'pino', 'pino-pretty', 'thread-stream', 'vite', 'swagger-ui-express',
    '@fastify/swagger-ui', 'keytar', '@opentelemetry/sdk-node',
    '@opentelemetry/auto-instrumentations-node', '@opentelemetry/exporter-trace-otlp-http'
  ],
});
```

### 3. Import Migration
- **Scope**: All files within `apps/server/`.
- **Action**: Replace `.ts` extensions in `import` statements with `.js`.
- **Pattern**: `import ... from '... .ts'` -> `import ... from '... .js'`.
- **Strategy**: 
  - Run a global search and replace across `apps/server/`.
  - Verify with `pnpm typecheck` (running `tsc --noEmit`).

### 4. CI/CD and Linting
- **Typecheck**: Add `"typecheck": "tsc --noEmit"` to `apps/server/package.json`.
- **CI Integration**: Update `.github/workflows/ci.yml` to ensure `npm run typecheck` is called.
- **Linting**: Add ESLint rule to enforce ESM extensions if possible, or rely on `tsc` with `NodeNext` which is strictly enforced.
- **Pre-commit**: Ensure `husky` and `lint-staged` run typecheck on changed files.

## Step-by-Step Execution Plan

1. [ ] **TS Setup**: 
   - Create `packages/config/tsconfig.base.json`.
   - Update `apps/server/tsconfig.json`.
2. [ ] **Build Setup**:
   - Create `apps/server/tsup.config.ts`.
   - Update `apps/server/package.json` scripts.
3. [ ] **Import Migration**:
   - Perform global replacement of `.ts` $\rightarrow$ `.js` imports in `apps/server/`.
4. [ ] **Validation**:
   - Run `pnpm typecheck` in `apps/server` and fix remaining errors.
   - Run `npm run build` and verify output.
5. [ ] **CI/CD & DX**:
   - Update `.github/workflows/ci.yml`.
   - Configure `lint-staged` for type-checking.

## Critical Files for Implementation
- `packages/config/tsconfig.base.json`
- `apps/server/tsconfig.json`
- `apps/server/tsup.config.ts`
- `apps/server/package.json`
- `.github/workflows/ci.yml`
EOF`
done
