// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      // Request input is loosely typed (Record<string, any>) by design, like Laravel's $request.
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
);
