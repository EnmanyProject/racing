import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['client/**', 'server/dist/**', 'node_modules/**']
  },
  {
    files: ['server/src/**/*.ts', 'server/tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './server/tsconfig.eslint.json',
        sourceType: 'module'
      },
      globals: globals.node
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  }
];
