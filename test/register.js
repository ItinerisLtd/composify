import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Type-checking runs in `pretest` (`tsc -p test`), so ts-node only needs to transpile.
process.env.TS_NODE_TRANSPILE_ONLY = 'true'

register('ts-node/esm', pathToFileURL('./'))
