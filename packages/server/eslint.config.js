import baseConfig from '@nyx/config/eslint';

export default [
  ...baseConfig,
  {
    ignores: ['dist-server', 'dist', '.turbo'],
  },
];
