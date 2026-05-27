import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app',            pattern: 'src/app/**' },
        { type: 'pages',          pattern: 'src/pages/**' },
        { type: 'dashboard',      pattern: 'src/features/dashboard/**' },
        { type: 'feature',        pattern: 'src/features/*/**', capture: ['feature'] },
        { type: 'feature-index',  pattern: 'src/features/*/index.ts' },
        { type: 'shared',         pattern: 'src/shared/**' },
        { type: 'infrastructure', pattern: 'src/infrastructure/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'boundaries/element-types': ['error', {
        default: 'disallow',
        rules: [
          // app layer: can import from anywhere except nothing (root bootstrap)
          { from: 'app',            allow: ['pages', 'feature-index', 'shared', 'infrastructure'] },
          // pages layer: thin re-exports only — import from feature barrels
          { from: 'pages',          allow: ['feature-index'] },
          // dashboard feature: can import from other feature barrels
          { from: 'dashboard',      allow: ['shared', 'infrastructure', 'feature-index'] },
          // all other features: no cross-feature imports except via barrels
          { from: 'feature',        allow: ['shared', 'infrastructure'] },
          // shared: bottom layer — no feature imports, no infrastructure imports upward
          { from: 'shared',         allow: [] },
          // infrastructure: no feature imports
          { from: 'infrastructure', allow: [] },
        ]
      }]
    },
    ignores: ['dist*/**', 'node_modules/**', 'scratch/**'],
  }
);
