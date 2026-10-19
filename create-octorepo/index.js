#!/usr/bin/env node
// `npm create octorepo [dir] [flags]` → `octorepo create [dir] [flags]`
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pkgPath = require.resolve('octorepo/package.json')
const { bin } = require(pkgPath)
const cli = join(dirname(pkgPath), typeof bin === 'string' ? bin : bin.octorepo)

const result = spawnSync(process.execPath, [cli, 'create', ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
