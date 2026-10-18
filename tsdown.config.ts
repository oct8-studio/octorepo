import { cpSync, globSync } from 'node:fs'
import { defineConfig } from 'tsdown'

/**
 * Every plugin reads its templates from `<plugin dir>/files` at runtime
 * (readPluginFiles(new URL('./', import.meta.url))), so the build keeps the
 * module layout (unbundle) and copies each `files/` dir next to its compiled index.js.
 */
function copyPluginTemplates(): void {
  for (const f of globSync('plugins/*/*/files', { cwd: 'src' })) {
    cpSync(`src/${f}`, `dist/${f}`, { recursive: true })
  }
}

export default defineConfig({
  entry: ['src/cli.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  clean: true,
  unbundle: true,
  banner: '#!/usr/bin/env node',
  onSuccess: copyPluginTemplates,
})
