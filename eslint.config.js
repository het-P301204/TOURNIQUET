import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      // Imports Playwright, which is not a dependency. See tsconfig.json.
      'scripts/screenshots.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'off',

      // `any` defeats the point of the domain model. An unavoidable cast is
      // written as `unknown` and narrowed.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // The CLI runs these sources under Node's type stripping, which cannot
      // emit the runtime objects these constructs need.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'No enum: the CLI runs this source under type stripping.',
        },
        {
          selector: 'TSModuleDeclaration',
          message: 'No namespace: the CLI runs this source under type stripping.',
        },
        {
          selector: 'TSParameterProperty',
          message:
            'No constructor parameter properties: the CLI runs this source under type stripping. Assign in the body.',
        },
      ],

      eqeqeq: ['error', 'always'],
      'no-console': 'off',
    },
  },
  {
    // The engine is shared with the CLI, where there is no DOM and no fetch.
    files: ['src/engine/**/*.ts', 'src/domain/**/*.ts', 'src/data/**/*.ts'],
    ignores: [
      'src/**/*.test.ts',
      // The one place allowed to touch `Date`, and only to parse and format an
      // instant it was handed. See the file header.
      'src/domain/time.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'The engine runs under Node too.' },
        { name: 'window', message: 'The engine runs under Node too.' },
        { name: 'localStorage', message: 'The engine runs under Node too.' },
        { name: 'fetch', message: 'TOURNIQUET makes no network requests.' },
        {
          name: 'Date',
          message:
            'A plan analysed twice must read the same. Take the instant as an argument and convert it through src/domain/time.ts.',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'bin/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
)
