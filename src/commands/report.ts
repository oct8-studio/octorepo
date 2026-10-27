import { isAbsolute, relative, sep } from 'node:path'
import { styleText } from 'node:util'
import { databaseSteps } from '../engine/agents'
import type { AppSpec, StackConfig } from '../model/stack'
import type { Issue } from '../rules'

/**
 * Human output of create / add app / add service. Pure: every function returns lines, the CLI
 * prints them. `--json` and MCP never come through here, so their shape is untouched.
 */

export const KBEE_URL = 'https://github.com/oct8-studio/kbee'
export const KBEE_TIP = `Tip: add an AI knowledge base with --kbee (${KBEE_URL})`

/** Commit first: kbee's in-repo citations point at the code committed alongside the KB. */
export const KBEE_NEXT_STEPS = [
  'git add -A && git commit -m init',
  'In Claude Code / Codex: /kbee init',
]

/** Color only on a terminal, and never when NO_COLOR is set (https://no-color.org). */
export function colorEnabled(
  stream: { isTTY?: boolean } = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return stream.isTTY === true && !env.NO_COLOR && env.TERM !== 'dumb'
}

type Tone = 'green' | 'yellow' | 'dim' | 'bold'

export interface Style {
  color: boolean
  verbose?: boolean
}

function paint(tone: Tone, s: string, style: Style): string {
  return style.color ? styleText(tone, s, { validateStream: false }) : s
}

/**
 * A step: one command; a label with its commands below it; or a command with a note below it
 * (an alternative, say).
 */
export type Step = string | { label: string; cmds: string[] } | { cmd: string; note: string }

/** `1. cmd` rows; a step's commands or note go indented under its first line. */
export function numbered(steps: Step[], style: Style): string[] {
  const width = String(steps.length).length
  return steps.flatMap((step, i) => {
    const n = `${String(i + 1).padStart(width)}.`
    const pad = ' '.repeat(n.length + 3)
    if (typeof step === 'string') return [`  ${n} ${step}`]
    if ('cmd' in step) return [`  ${n} ${step.cmd}`, `${pad}${paint('dim', step.note, style)}`]
    return [`  ${n} ${paint('dim', step.label, style)}`, ...step.cmds.map((c) => `${pad}${c}`)]
  })
}

/**
 * `./shop` for a target inside `cwd`, the absolute path otherwise; `.` for `cwd` itself. The
 * `./` keeps a relative target recognisable as a path.
 */
export function displayPath(target: string, cwd: string): string {
  const rel = relative(cwd, target)
  if (rel === '') return '.'
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return target
  return `.${sep}${rel}`
}

/** What to `cd` into: the relative path inside `cwd`, else absolute; undefined for `cwd` itself. */
export function cdTarget(target: string, cwd: string): string | undefined {
  const shown = displayPath(target, cwd)
  if (shown === '.') return undefined
  return shown.startsWith(`.${sep}`) ? shown.slice(2) : shown
}

/**
 * Human next steps after create: cd, pending post-steps, services + database, then dev (the
 * full stack in Docker as its alternative); with kbee, the first commit and `/kbee init`.
 */
export function nextSteps(cd: string | undefined, manual: string[], stack: StackConfig): Step[] {
  const [up, ...rest] = databaseSteps(stack)
  const full = rest.pop()
  return [
    ...(cd ? [`cd ${cd}`] : []),
    ...manual,
    ...(up ? [{ label: 'Database & services:', cmds: [up.cmd, ...rest.map((s) => s.cmd)] }] : []),
    full
      ? {
          cmd: 'pnpm dev',
          note: `or the full stack in Docker${stack.orm ? ' (migrations run automatically)' : ''}: ${full.cmd}`,
        }
      : 'pnpm dev',
    ...(stack.kbee ? [{ label: 'Build the kbee knowledge base:', cmds: KBEE_NEXT_STEPS }] : []),
  ]
}

/** `shop: 4 apps · turbo · drizzle · postgres, valkey` and the ports row. */
export function stackSummary(stack: StackConfig, style: Style): string[] {
  const n = stack.apps.length
  const parts = [
    `${n} app${n === 1 ? '' : 's'}`,
    stack.monorepoTool,
    stack.orm,
    stack.services.length ? stack.services.join(', ') : undefined,
  ].filter(Boolean)
  const ports = stack.apps.filter((a) => a.port !== undefined).map((a) => `${a.name} ${a.port}`)
  return [
    `${paint('green', '✓', style)} ${paint('bold', stack.name, style)}: ${parts.join(' · ')}`,
    ...(ports.length ? [`  ${paint('dim', 'ports', style)}  ${ports.join(' · ')}`] : []),
  ]
}

/**
 * Auto-fixes are routine defaults (ports, API styles, a required postgres) that the summary
 * already shows, so they're listed only with --verbose. Warnings always show.
 */
export function fixLines(fixes: Issue[], style: Style): string[] {
  return style.verbose ? fixes.map((f) => paint('dim', `fix: ${f.message}`, style)) : []
}

export function warningLines(warnings: Issue[], style: Style): string[] {
  return warnings.map((w) => paint('yellow', `▲ warning: ${w.message}`, style))
}

function nextStepsBlock(steps: Step[], style: Style): string[] {
  return steps.length ? ['', paint('bold', 'Next steps:', style), ...numbered(steps, style)] : []
}

export function createReport(
  r: {
    root: string
    cwd: string
    stack: StackConfig
    fixes: Issue[]
    warnings: Issue[]
    manual: string[]
  },
  style: Style,
): string[] {
  return [
    ...fixLines(r.fixes, style),
    ...stackSummary(r.stack, style),
    ...warningLines(r.warnings, style),
    '',
    `Created ${displayPath(r.root, r.cwd)}`,
    ...nextStepsBlock(nextSteps(cdTarget(r.root, r.cwd), r.manual, r.stack), style),
    // With kbee the next steps already say how to build the knowledge base.
    ...(r.stack.kbee ? [] : ['', paint('dim', KBEE_TIP, style)]),
  ]
}

export function addAppReport(
  r: { app: AppSpec; written: number; fixes: Issue[]; warnings: Issue[]; manual?: string[] },
  style: Style,
): string[] {
  const { app } = r
  const parts = [
    `Added ${app.kind} ${paint('bold', app.name, style)} (${app.framework})`,
    ...(app.port !== undefined ? [`port ${app.port}`] : []),
    `${r.written} files`,
  ]
  return [
    ...fixLines(r.fixes, style),
    `${paint('green', '✓', style)} ${parts.join(' · ')}`,
    ...warningLines(r.warnings, style),
    ...nextStepsBlock([...(r.manual ?? []), 'pnpm dev'], style),
  ]
}

export function addServiceReport(
  r: {
    service: string
    label?: string
    written: number
    fixes: Issue[]
    warnings: Issue[]
    message: string
  },
  style: Style,
): string[] {
  // A service the repo already has is a no-op: say so, nothing to do next.
  if (r.written === 0)
    return [...fixLines(r.fixes, style), r.message, ...warningLines(r.warnings, style)]
  const name = `${paint('bold', r.service, style)}${r.label ? ` (${r.label})` : ''}`
  return [
    ...fixLines(r.fixes, style),
    `${paint('green', '✓', style)} Added service ${name} · ${r.written} files`,
    ...warningLines(r.warnings, style),
    ...nextStepsBlock([`docker compose up -d ${r.service}`], style),
  ]
}
