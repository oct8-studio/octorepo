import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildOpenApiDocument } from '../src/app.js'

const out = resolve(import.meta.dirname, '../openapi.json')
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
console.log(`wrote ${out}`)
