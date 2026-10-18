import { readFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { select, text } from '@clack/prompts'
import { Command } from 'commander'
import { runAddApp } from './commands/add-app'
import { runCreate } from './commands/create'
import { CLI_NAME, CLI_VERSION } from './meta'
import { CliError } from './model/errors'
import { type AppKind, type AppSpec, parseStackConfig, type StackConfig } from './model/stack'
import { defaultRegistry } from './plugins/registry'

interface CreateFlags {
  config?: string
  tool?: string
  app: string[]
  service: string[]
  install: boolean
  git: boolean
  force?: boolean
  json?: boolean
  yes?: boolean
}

const collect = (value: string, prev: string[]) => [...prev, value]

/** `kind:name:framework[:uses=a,b]` */
function parseAppFlag(spec: string): AppSpec {
  const [kind, name, framework, ...rest] = spec.split(':')
  if (!kind || !name || !framework) {
    throw new CliError(`Invalid --app "${spec}". Expected kind:name:framework[:uses=a,b]`)
  }
  const app = { kind, name, framework } as AppSpec
  for (const part of rest) {
    const [key, value = ''] = part.split('=')
    if (key !== 'uses') throw new CliError(`Invalid --app option "${part}" in "${spec}"`)
    app.uses = value.split(',').filter(Boolean)
  }
  return app
}

async function stackFromFlags(dir: string | undefined, flags: CreateFlags): Promise<StackConfig> {
  let base: Partial<StackConfig> = {}
  if (flags.config) {
    try {
      base = JSON.parse(await readFile(resolve(flags.config), 'utf8'))
    } catch (e) {
      throw new CliError(`Cannot read --config ${flags.config}: ${(e as Error).message}`)
    }
  }
  const tool = flags.tool ?? base.monorepoTool
  if (!tool) throw new CliError('Missing --tool <turbo|nx> (or monorepoTool in --config)')
  return parseStackConfig({
    ...base,
    name: base.name ?? basename(resolve(dir ?? '.')),
    monorepoTool: tool,
    apps: [...(base.apps ?? []), ...flags.app.map(parseAppFlag)],
    services: [...(base.services ?? []), ...flags.service],
  })
}

async function create(dir: string | undefined, flags: CreateFlags): Promise<void> {
  const hasStackFlags = Boolean(
    flags.config || flags.tool || flags.app.length || flags.service.length,
  )
  const interactive = !hasStackFlags && !flags.yes && !flags.json && process.stdin.isTTY
  if (!hasStackFlags && !interactive) {
    throw new CliError('No stack given. Pass --tool and --app (or --config), or run in a terminal.')
  }
  const config = interactive ? undefined : await stackFromFlags(dir, flags)
  const result = await runCreate(
    {
      config,
      cwd: process.cwd(),
      dir,
      install: flags.install,
      git: flags.git,
      force: Boolean(flags.force),
      json: Boolean(flags.json),
      yes: Boolean(flags.yes),
    },
    defaultRegistry(),
  )
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  for (const f of result.fixes) console.log(`fix: ${f.message}`)
  for (const w of result.warnings) console.log(`warning: ${w.message}`)
  const rel = relative(process.cwd(), result.root)
  const cd = rel && !rel.startsWith('..') ? rel : result.root
  console.log(`\nCreated ${result.root}\n\nNext steps:`)
  for (const cmd of [`cd ${cd}`, ...result.manual, 'pnpm dev']) console.log(`  ${cmd}`)
}

interface AddAppFlags {
  uses?: string
  apiStyle?: string
  install: boolean
  json?: boolean
}

function ask<T>(value: T): Exclude<T, symbol> {
  if (typeof value === 'symbol') throw new CliError('Cancelled')
  return value as Exclude<T, symbol>
}

async function addApp(
  kindArg: string | undefined,
  nameArg: string | undefined,
  frameworkArg: string | undefined,
  flags: AddAppFlags,
): Promise<void> {
  const reg = defaultRegistry()
  const interactive = Boolean(process.stdin.isTTY) && !flags.json
  if ((!kindArg || !nameArg || !frameworkArg) && !interactive) {
    throw new CliError('Usage: add app <kind> <name> <framework>')
  }
  const kind = (kindArg ??
    ask(
      await select<AppKind>({
        message: 'App kind',
        options: [{ value: 'backend' }, { value: 'frontend' }],
      }),
    )) as AppKind
  if (kind !== 'frontend' && kind !== 'backend') {
    throw new CliError(`Invalid kind "${kind}". Expected frontend or backend`)
  }
  const name = nameArg ?? ask(await text({ message: 'App name', placeholder: 'api' }))
  const framework =
    frameworkArg ??
    ask(
      await select<string>({
        message: 'Framework',
        options: reg.frameworksOf(kind).map((p) => ({ value: p.id, label: p.label })),
      }),
    )
  const app: AppSpec = { name, kind, framework }
  if (flags.apiStyle) app.apiStyle = flags.apiStyle
  let uses = flags.uses
  if (kind === 'frontend' && uses === undefined && interactive) {
    uses = ask(await text({ message: 'Backends to use (comma-separated)', defaultValue: '' }))
  }
  if (uses !== undefined) app.uses = uses.split(',').filter(Boolean)
  const result = await runAddApp(
    { cwd: process.cwd(), app, json: Boolean(flags.json), install: flags.install },
    reg,
  )
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  for (const f of result.fixes) console.log(`fix: ${f.message}`)
  for (const w of result.warnings) console.log(`warning: ${w.message}`)
  console.log(`\nAdded ${kind} "${name}" (${result.written.length} files written)`)
  for (const cmd of result.manual ?? []) console.log(`  ${cmd}`)
}

const program = new Command()
program.name(CLI_NAME).version(CLI_VERSION)
program
  .command('create [dir]')
  .description('Create a new monorepo')
  .option('--config <file>', 'stack config JSON file')
  .option('--tool <tool>', 'monorepo tool: turbo | nx')
  .option('--app <spec>', 'kind:name:framework[:uses=a,b] (repeatable)', collect, [])
  .option('--service <id>', 'compose service (repeatable)', collect, [])
  .option('--no-install', 'skip pnpm install')
  .option('--no-git', 'skip git init')
  .option('--force', 'write into a non-empty directory')
  .option('--json', 'print machine-readable result only')
  .option('--yes', 'never prompt')
  .action(create)

program
  .command('add')
  .description('Add to an existing monorepo')
  .command('app [kind] [name] [framework]')
  .description('Add an app: add app <kind> <name> <framework>')
  .option('--uses <names>', 'comma-separated backends a frontend uses')
  .option('--api-style <style>', 'backend API style (e.g. rest)')
  .option('--no-install', 'skip pnpm install')
  .option('--json', 'print machine-readable result only')
  .action(addApp)

try {
  await program.parseAsync()
} catch (e) {
  if (!(e instanceof CliError)) throw e
  process.stderr.write(`${e.message}\n`)
  process.exitCode = e.exitCode
}
