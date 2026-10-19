import { readFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { select, text } from '@clack/prompts'
import { Command } from 'commander'
import { readManifest, runAddApp } from './commands/add-app'
import { runAddService } from './commands/add-service'
import { runCreate } from './commands/create'
import { parseAppFlag, parseUses } from './commands/flags'
import { formatOptions, listOptions } from './commands/options'
import { answer, appNameValidator } from './commands/prompts'
import { runMcpServer } from './mcp/server'
import { CLI_NAME, CLI_VERSION } from './meta'
import { CliError, formatError } from './model/errors'
import { type AppKind, type AppSpec, parseStackConfig, type StackConfig } from './model/stack'
import { defaultRegistry } from './plugins/registry'
import { applyPreset } from './presets'

interface CreateFlags {
  config?: string
  tool?: string
  app: string[]
  service: string[]
  orm?: string
  preset?: string
  install: boolean
  git: boolean
  force?: boolean
  json?: boolean
  yes?: boolean
}

const collect = (value: string, prev: string[]) => [...prev, value]

async function stackFromFlags(dir: string | undefined, flags: CreateFlags): Promise<StackConfig> {
  let base: Partial<StackConfig> = {}
  if (flags.config) {
    try {
      base = JSON.parse(await readFile(resolve(flags.config), 'utf8'))
    } catch (e) {
      throw new CliError(`Cannot read --config ${flags.config}: ${(e as Error).message}`)
    }
  }
  // A preset alone is a complete stack, so the tool falls back to turbo.
  const tool = flags.tool ?? base.monorepoTool ?? (flags.preset ? 'turbo' : undefined)
  if (!tool) throw new CliError('Missing --tool <turbo|nx> (or monorepoTool in --config)')
  const stack = parseStackConfig({
    ...base,
    name: base.name ?? basename(resolve(dir ?? '.')),
    monorepoTool: tool,
    apps: [...(base.apps ?? []), ...flags.app.map(parseAppFlag)],
    services: [...(base.services ?? []), ...flags.service],
    ...((flags.orm ?? base.orm) ? { orm: flags.orm ?? base.orm } : {}),
  })
  return flags.preset ? applyPreset(flags.preset, stack) : stack
}

async function create(dir: string | undefined, flags: CreateFlags): Promise<void> {
  const hasStackFlags = Boolean(
    flags.config ||
      flags.tool ||
      flags.app.length ||
      flags.service.length ||
      flags.orm ||
      flags.preset,
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
    answer(
      await select<AppKind>({
        message: 'App kind',
        options: [{ value: 'backend' }, { value: 'frontend' }],
      }),
    )) as AppKind
  if (kind !== 'frontend' && kind !== 'backend') {
    throw new CliError(`Invalid kind "${kind}". Expected frontend or backend`)
  }
  let name = nameArg
  if (name === undefined) {
    // Validate inline against the repo's apps; runAddApp reports a missing manifest itself.
    const existing = await readManifest(process.cwd()).then(
      (m) => m,
      () => undefined,
    )
    name = answer(
      await text({
        message: 'App name',
        placeholder: 'api',
        validate: appNameValidator(kind, existing?.apps ?? [], existing?.orm),
      }),
    )
  }
  const framework =
    frameworkArg ??
    answer(
      await select<string>({
        message: 'Framework',
        options: reg.frameworksOf(kind).map((p) => ({ value: p.id, label: p.label })),
      }),
    )
  const app: AppSpec = { name, kind, framework }
  if (flags.apiStyle) app.apiStyle = flags.apiStyle
  let uses = flags.uses
  if (kind === 'frontend' && uses === undefined && interactive) {
    uses = answer(await text({ message: 'Backends to use (comma-separated)', defaultValue: '' }))
  }
  if (uses !== undefined) app.uses = parseUses(uses)
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

async function addService(
  serviceArg: string | undefined,
  flags: { json?: boolean },
): Promise<void> {
  const reg = defaultRegistry()
  const interactive = Boolean(process.stdin.isTTY) && !flags.json
  if (!serviceArg && !interactive) throw new CliError('Usage: add service <name>')
  const service =
    serviceArg ??
    answer(
      await select<string>({
        message: 'Service',
        options: [...reg.services.values()].map((s) => ({ value: s.id, label: s.label })),
      }),
    )
  const result = await runAddService(
    { cwd: process.cwd(), service, json: Boolean(flags.json) },
    reg,
  )
  if (flags.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  for (const f of result.fixes) console.log(`fix: ${f.message}`)
  for (const w of result.warnings) console.log(`warning: ${w.message}`)
  console.log(`\n${result.message} (${result.written.length} files written)`)
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
  .option('--orm <id>', 'ORM for packages/db: drizzle | prisma (adds postgres)')
  .option(
    '--preset <id>',
    'start from a preset: saas | api-platform (extra --app flags are appended)',
  )
  .option('--no-install', 'skip pnpm install')
  .option('--no-git', 'skip git init')
  .option('--force', 'write into a non-empty directory')
  .option('--json', 'print machine-readable result only')
  .option('--yes', 'never prompt')
  .action(create)

const add = program.command('add').description('Add to an existing monorepo')
add
  .command('app [kind] [name] [framework]')
  .description('Add an app: add app <kind> <name> <framework>')
  .option('--uses <names>', 'comma-separated backends a frontend uses')
  .option('--api-style <style>', 'backend API style (e.g. rest)')
  .option('--no-install', 'skip pnpm install')
  .option('--json', 'print machine-readable result only')
  .action(addApp)
add
  .command('service [name]')
  .description('Add a docker compose service: add service <name>')
  .option('--json', 'print machine-readable result only')
  .action(addService)

program
  .command('options')
  .description('List the tools, frameworks and services a stack can use')
  .option('--json', 'print machine-readable result only')
  .action((flags: { json?: boolean }) => {
    const options = listOptions(defaultRegistry())
    process.stdout.write(
      flags.json ? `${JSON.stringify(options, null, 2)}\n` : `${formatOptions(options)}\n`,
    )
  })

program
  .command('mcp')
  .description('Run the MCP server on stdio (for AI agents)')
  .action(() => runMcpServer(defaultRegistry()))

try {
  await program.parseAsync()
} catch (e) {
  const { text, exitCode } = formatError(e, process.env.OCTOREPO_DEBUG === '1')
  if (text) process.stderr.write(`${text}\n`)
  process.exitCode = exitCode
}
