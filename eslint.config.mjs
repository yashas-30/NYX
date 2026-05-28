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
      '.nyx-cache/**',
      '.nyx-models/**',
      '.nyx-logs/**',
      '.nyx-keys/**',
      '.vscode/**'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
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
        { type: 'pages',          pattern: 'src/pages/**' },
        { type: 'dashboard',      pattern: 'src/features/dashboard/**' },
        { type: 'feature',        pattern: 'src/features/*/**' },
        { type: 'feature-index',  pattern: 'src/features/*/index.ts' },
        { type: 'shared',         pattern: 'src/shared/**' },
        { type: 'infrastructure', pattern: 'src/infrastructure/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'preserve-caught-error': 'off',
      'no-console': 'off',
      'boundaries/element-types': 'off'
    }
  }
);
