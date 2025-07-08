import {includeIgnoreFile} from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

const ourRules = [
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'perfectionist/sort-objects': 'off',
    },
  },
];

const finalConfig = [includeIgnoreFile(gitignorePath), ...oclif, ...ourRules, prettier]

export default finalConfig
