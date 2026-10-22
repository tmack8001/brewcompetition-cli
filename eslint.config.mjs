import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

const config = [
  includeIgnoreFile(gitignorePath),
  ...oclif,
  prettier,
  {ignores: ['dist/**', 'tmp/**']},
  {
    // Ordering and spacing rules that would reshuffle code (switch cases, object keys,
    // union members) for no behavioural reason. Formatting is not enforced here.
    rules: {
      '@stylistic/lines-between-class-members': 'off',
      '@stylistic/padding-line-between-statements': 'off',
      'perfectionist/sort-imports': 'off',
      'perfectionist/sort-named-imports': 'off',
      'perfectionist/sort-objects': 'off',
      'perfectionist/sort-switch-case': 'off',
      'perfectionist/sort-union-types': 'off',
      // Newer stylistic and type-safety packs that the previous config never enabled.
      // They flag JSON-from-fixture `any`s and stylistic preferences, not defects.
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-shadow': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      'require-unicode-regexp': 'off',
      'unicorn/consistent-boolean-name': 'off',
      'unicorn/consistent-class-member-order': 'off',
      'unicorn/max-nested-calls': 'off',
      'unicorn/no-break-in-nested-loop': 'off',
      'unicorn/prefer-iterator-to-array': 'off',
      'unicorn/prefer-iterator-to-array-at-end': 'off',
      'unicorn/prefer-simple-condition-first': 'off',
      'unicorn/prefer-unicode-code-point-escapes': 'off',
      // Further rules from the newer packs. They flag preferences (iterator and loop
      // style, assertion style, URL/string helpers), not defects, and the code base
      // predates them.
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-loop-func': 'off',
      '@typescript-eslint/no-restricted-types': 'off',
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      'unicorn/logical-assignment-operators': 'off',
      'unicorn/no-array-sort': 'off',
      'unicorn/no-computed-property-existence-check': 'off',
      'unicorn/no-duplicate-loops': 'off',
      'unicorn/no-negated-array-predicate': 'off',
      'unicorn/no-unsafe-string-replacement': 'off',
      'unicorn/no-useless-else': 'off',
      'unicorn/no-useless-iterator-to-array': 'off',
      'unicorn/prefer-continue': 'off',
      'unicorn/prefer-https': 'off',
      'unicorn/prefer-minimal-ternary': 'off',
      'unicorn/prefer-number-coercion': 'off',
      'unicorn/prefer-split-limit': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prefer-url-href': 'off',
    },
  },
  {
    // The test files use chai property assertions (`expect(x).to.be.true`), and
    // several files hold more than one top-level suite.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      'mocha/consistent-spacing-between-blocks': 'off',
      'mocha/max-top-level-suites': 'off',
    },
  },
  {
    // bin/ is published through package.json "files"; the rule misreads it.
    files: ['bin/run.js'],
    rules: {'n/no-unpublished-bin': 'off'},
  },
]

export default config
