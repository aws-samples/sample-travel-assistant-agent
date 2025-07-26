module.exports = {
  extends: ['plugin:@amzn/mlsl-medley/ts'],
  plugins: ['@amzn/mlsl-medley'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./infra/tsconfig.json'],
  },
  ignorePatterns: ['.eslintrc.js'],
};
