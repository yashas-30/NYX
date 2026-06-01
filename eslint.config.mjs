import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-desktop/**',
      'dist-electron/**',
      'dist-server/**',
      'node_modules/**',
      'scratch/**',
      '.agents/**',
      '.claude/**',
      '.github/**',
      '.opencode/**',
      '.nyx-state/**',
      '.nyx-cache/**',
      '.nyx-models/**',
      '.nyx-logs/**',
      '.nyx-keys/**',
      '.vscode/**',
      'release/**',
      'src-tauri/**',
      'scripts/**'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
        exports: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly'
      }
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off'
    },
    plugins: {
      boundaries,
      'react-hooks': {
        rules: {
          'exhaustive-deps': {
            create() { return {}; }
          }
        }
      }
    },
    settings: {
      'boundaries/elements': [
        { type: 'app',            pattern: 'src/app/**' },
        { type: 'core',           pattern: 'src/core/**' },
        { type: 'assets',         pattern: 'src/assets/**' },
        { type: 'dashboard',      pattern: 'src/features/dashboard/**' },
        { type: 'feature',        pattern: 'src/features/*/**', capture: ['featureName'] },
        { type: 'feature-index',  pattern: 'src/features/*/index.ts', capture: ['featureName'] },
        { type: 'shared',         pattern: 'src/shared/**' },
        { type: 'infrastructure', pattern: 'src/infrastructure/**' },
        { type: 'types',          pattern: 'src/types/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'preserve-caught-error': 'off',
      'no-console': 'off',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          rules: [
            {
              from: { type: 'core' },
              allow: { to: { type: ['shared', 'infrastructure', 'types'] } }
            },
            {
              from: { type: 'infrastructure' },
              allow: { to: { type: ['shared', 'types'] } }
            },
            {
              from: { type: 'shared' },
              allow: { to: { type: ['types', 'assets'] } }
            },
            {
              from: { type: 'feature' },
              allow: { to: { type: ['shared', 'infrastructure', 'types', 'core', 'feature-index'] } }
            },
            {
              from: { type: 'feature' },
              allow: { to: { type: 'feature', captured: { featureName: '{{from.captured.featureName}}' } } }
            },
            {
              from: { type: 'feature-index' },
              allow: { to: { type: ['shared', 'infrastructure', 'types', 'core'] } }
            },
            {
              from: { type: 'feature-index' },
              allow: { to: { type: 'feature', captured: { featureName: '{{from.captured.featureName}}' } } }
            },
            {
              from: { type: 'app' },
              allow: { to: { type: ['feature-index', 'dashboard', 'shared', 'infrastructure', 'types', 'core', 'assets'] } }
            }
          ]
        }
      ]
    }
  }
);
