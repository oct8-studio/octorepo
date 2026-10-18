import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildOpenApiDocument } from './openapi'

async function main(): Promise<void> {
  const out = resolve(__dirname, '../openapi.json')
  writeFileSync(out, `${JSON.stringify(await buildOpenApiDocument(), null, 2)}\n`)
  console.log(`wrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
