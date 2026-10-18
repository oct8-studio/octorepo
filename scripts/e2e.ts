/**
 * End-to-end check of a generated repo (Task 14 quality gate).
 *
 *   pnpm tsx scripts/e2e.ts <comboId | --fixture path> [--compose] [--keep]
 *
 * Generates the stack into a temp dir with install on, then runs lint, typecheck, test, build and a
 * `docker build` per app. With --compose it also boots docker compose and checks /health, the Next
 * page HTML and Vite CORS. runCreate is imported from src (not dist) until Task 15 fixes packaging (R6).
 */
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runCreate } from '../src/commands/create'
import { parseStackConfig, type StackConfig } from '../src/model/stack'
import { defaultRegistry } from '../src/plugins/registry'
import { validateStack } from '../src/rules'
import { findCombo } from './combos'

interface StepResult {
  step: string
  ok: boolean
  ms: number
  detail?: string
}

const REPO = resolve(import.meta.dirname, '..')
const results: StepResult[] = []

/** Quiet, non-interactive tooling inside the generated repo. */
const CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  NX_DAEMON: 'false',
  NX_NO_CLOUD: 'true',
  TURBO_TELEMETRY_DISABLED: '1',
  DO_NOT_TRACK: '1',
  NEXT_TELEMETRY_DISABLED: '1',
}

function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: CHILD_ENV })
    child.on('error', fail)
    child.on('close', (code) => done(code ?? 1))
  })
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  console.log(`\n=== ${name} ===`)
  try {
    await fn()
    const ms = Date.now() - start
    results.push({ step: name, ok: true, ms })
    console.log(`ok   ${name} (${(ms / 1000).toFixed(1)}s)`)
  } catch (e) {
    const ms = Date.now() - start
    const detail = (e as Error).message
    results.push({ step: name, ok: false, ms, detail })
    console.log(`FAIL ${name} (${(ms / 1000).toFixed(1)}s): ${detail}`)
    throw e
  }
}

async function sh(cmd: string, args: string[], cwd: string): Promise<void> {
  const code = await run(cmd, args, cwd)
  if (code !== 0) throw new Error(`\`${cmd} ${args.join(' ')}\` exited with ${code}`)
}

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await step(name, fn)
}

async function fetchText(
  url: string,
  init?: RequestInit,
): Promise<{ status: number; headers: Headers; body: string }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  return { status: res.status, headers: res.headers, body: await res.text() }
}

/** Retries until `fn` passes or the deadline expires (apps may still be warming up). */
async function eventually(fn: () => Promise<void>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await fn()
    } catch (e) {
      if (Date.now() > deadline) throw e
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
}

function parseArgs(argv: string[]): {
  label: string
  load: () => Promise<StackConfig>
  compose: boolean
  keep: boolean
} {
  const compose = argv.includes('--compose')
  const keep = argv.includes('--keep')
  const fixtureIdx = argv.indexOf('--fixture')
  if (fixtureIdx !== -1) {
    const path = argv[fixtureIdx + 1]
    if (!path) throw new Error('--fixture needs a path')
    return {
      label: `fixture:${path}`,
      load: async () => parseStackConfig(JSON.parse(await readFile(resolve(path), 'utf8'))),
      compose,
      keep,
    }
  }
  const id = argv.find((a) => !a.startsWith('--'))
  const combo = id ? findCombo(id) : undefined
  if (!combo)
    throw new Error(
      `Usage: e2e.ts <comboId | --fixture path> [--compose] [--keep] (got "${id ?? ''}")`,
    )
  return { label: combo.id, load: async () => structuredClone(combo.stack), compose, keep }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  const reg = defaultRegistry()
  const config = await args.load()
  const { stack, errors } = validateStack(config, reg)
  if (errors.length) throw new Error(`Invalid stack: ${errors.map((e) => e.message).join('; ')}`)

  const tmp = await mkdtemp(join(tmpdir(), 'octorepo-e2e-'))
  const root = join(tmp, stack.name)
  const project = `octorepo-e2e-${Date.now()}`
  const images: string[] = []
  let composeUp = false
  console.log(`e2e ${args.label} → ${root}`)

  try {
    await step('cli build', () => sh('pnpm', ['build'], REPO))
    await step('create', async () => {
      const result = await runCreate(
        {
          config,
          cwd: tmp,
          dir: stack.name,
          install: true,
          git: false,
          force: false,
          json: false,
          yes: true,
        },
        reg,
      )
      if (result.manual.length) throw new Error(`manual steps left: ${result.manual.join(', ')}`)
    })
    for (const task of ['lint', 'typecheck', 'test', 'build']) {
      await step(task, () => sh('pnpm', [task], root))
    }
    for (const app of stack.apps) {
      const tag = `${project}-${app.name}`
      await step(`docker build ${app.name}`, async () => {
        await sh('docker', ['build', '-f', `apps/${app.name}/Dockerfile`, '-t', tag, '.'], root)
        images.push(tag)
      })
    }

    if (args.compose) {
      composeUp = true
      await step('compose up', () =>
        sh(
          'docker',
          ['compose', '-p', project, 'up', '-d', '--build', '--wait', '--wait-timeout', '240'],
          root,
        ),
      )
      const backends = stack.apps.filter((a) => a.kind === 'backend')
      for (const b of backends) {
        await check(`health ${b.name}`, () =>
          eventually(async () => {
            const res = await fetchText(`http://localhost:${b.port}/health`)
            if (res.status !== 200) throw new Error(`GET /health → ${res.status}`)
          }),
        )
      }
      for (const fe of stack.apps.filter((a) => a.kind === 'frontend')) {
        const uses = backends.filter((b) => fe.uses?.includes(b.name))
        if (fe.framework === 'next') {
          await check(`page ${fe.name}`, () =>
            eventually(async () => {
              const res = await fetchText(`http://localhost:${fe.port}/`)
              if (res.status !== 200) throw new Error(`GET / → ${res.status}`)
              for (const b of uses) {
                if (!res.body.includes(`Hello from ${b.name}`)) {
                  throw new Error(`page HTML lacks "Hello from ${b.name}"`)
                }
              }
            }),
          )
        } else {
          const origin = `http://localhost:${fe.port}`
          for (const b of uses) {
            await check(`cors ${fe.name}→${b.name}`, () =>
              eventually(async () => {
                const res = await fetchText(`http://localhost:${b.port}/hello`, {
                  headers: { Origin: origin },
                })
                const allow = res.headers.get('access-control-allow-origin')
                if (res.status !== 200) throw new Error(`GET /hello → ${res.status}`)
                if (allow !== origin) throw new Error(`access-control-allow-origin=${allow}`)
              }),
            )
          }
        }
      }
    }
    return 0
  } catch {
    return 1
  } finally {
    // Image tags match compose's `<project>-<service>` names, so `--rmi local` removes them too.
    if (composeUp) {
      await run('docker', ['compose', '-p', project, 'down', '-v', '--rmi', 'local'], root)
    } else if (images.length) {
      await run('docker', ['image', 'rm', '-f', ...images], root)
    }
    if (args.keep) console.log(`kept ${root}`)
    else await rm(tmp, { recursive: true, force: true })
    summarize(args.label)
  }
}

function summarize(label: string): void {
  const ok = results.every((r) => r.ok)
  console.log(`\n--- e2e ${label}: ${ok ? 'PASS' : 'FAIL'} ---`)
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.step.padEnd(28)} ${(r.ms / 1000).toFixed(1)}s`)
  }
  const out = process.env.E2E_RESULTS
  if (out) appendFileSync(out, `${JSON.stringify({ label, ok, results })}\n`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error((e as Error).message)
      process.exit(1)
    },
  )
}
