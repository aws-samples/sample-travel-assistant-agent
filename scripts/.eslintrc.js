module.exports = {
  extends: ['plugin:@amzn/mlsl-medley/ts', 'plugin:@amzn/mlsl-medley/react'],
  plugins: ['@amzn/mlsl-medley'],
  parser: '@typescript-eslint/parser',
  settings: {
    react: { version: 'detect' },
  },
  parserOptions: {
    project: ['./scripts/tsconfig.json'],
  },
  ignorePatterns: ['.eslintrc.js', 'vite.config.ts'],
};
