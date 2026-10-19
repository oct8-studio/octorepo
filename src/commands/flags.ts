import { CliError } from '../model/errors'
import type { AppSpec } from '../model/stack'

/** Comma-separated app names (`--uses`, `uses=`), trimmed, empty entries dropped. */
export function parseUses(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** `kind:name:framework[:uses=a,b]` */
export function parseAppFlag(spec: string): AppSpec {
  const [kind, name, framework, ...rest] = spec.split(':')
  if (!kind || !name || !framework) {
    throw new CliError(`Invalid --app "${spec}". Expected kind:name:framework[:uses=a,b]`)
  }
  const app = { kind, name, framework } as AppSpec
  for (const part of rest) {
    const [key, value = ''] = part.split('=')
    if (key !== 'uses') throw new CliError(`Invalid --app option "${part}" in "${spec}"`)
    app.uses = parseUses(value)
  }
  return app
}
