import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'node_modules', 'e2e/artifacts'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // A variable called t hides the translation function t(...) and breaks the texts in its scope.
      'no-restricted-syntax': ['error',
        { selector: ":function > Identifier.params[name='t']", message: 'Do not name a parameter t: it hides the translation function.' },
        { selector: "VariableDeclarator > Identifier.id[name='t']", message: 'Do not name a variable t: it hides the translation function.' },
      ],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_|^[A-Z]|^motion$', ignoreRestSiblings: true }],
    },
  },
]
