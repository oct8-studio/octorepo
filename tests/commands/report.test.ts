import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addAppReport,
  addServiceReport,
  cdTarget,
  colorEnabled,
  createReport,
  displayPath,
  KBEE_TIP,
  nextSteps,
  numbered,
  stackSummary,
} from '../../src/commands/report'
import type { StackConfig } from '../../src/model/stack'
import type { Issue } from '../../src/rules'

const plain = { color: false }
const config: StackConfig = {
  name: 'demo',
  monorepoTool: 'turbo',
  packageManager: 'pnpm',
  apps: [
    { name: 'web', kind: 'frontend', framework: 'react-vite', uses: ['api'], port: 3000 },
    { name: 'api', kind: 'backend', framework: 'express', apiStyle: 'rest', port: 4000 },
  ],
  services: [],
}
const fix: Issue = { rule: 'assign-ports', level: 'fix', message: 'Assigned port 3000 to "web"' }
const warn: Issue = {
  rule: 'x',
  level: 'warning',
  message: 'Frontend "web" does not use any backend',
}

describe('nextSteps', () => {
  const s = { ...config, services: ['postgres'], orm: 'prisma' as const }
  it('groups services + migrate + seed, then pnpm dev with the full-stack alternative', () => {
    expect(nextSteps('x', ['pnpm install'], s)).toEqual([
      'cd x',
      'pnpm install',
      {
        label: 'Database & services:',
        cmds: [
          'docker compose up -d postgres',
          'pnpm --filter @demo/db db:migrate && pnpm --filter @demo/db db:seed',
        ],
      },
      {
        cmd: 'pnpm dev',
        note: 'or the full stack in Docker (migrations run automatically): docker compose up',
      },
    ])
  })
  it('is just cd and pnpm dev without services or ORM; no cd into the cwd itself', () => {
    expect(nextSteps('x', [], config)).toEqual(['cd x', 'pnpm dev'])
    expect(nextSteps(undefined, [], config)).toEqual(['pnpm dev'])
  })
  it('with kbee ends with the first commit, then /kbee init', () => {
    expect(nextSteps('x', [], { ...config, kbee: true })).toEqual([
      'cd x',
      'pnpm dev',
      {
        label: 'Build the kbee knowledge base:',
        cmds: ['git add -A && git commit -m init', 'In Claude Code / Codex: /kbee init'],
      },
    ])
  })
})

describe('numbered', () => {
  it('numbers steps and indents grouped commands and notes under the step text', () => {
    expect(
      numbered(
        ['cd x', { label: 'Group:', cmds: ['a', 'b'] }, { cmd: 'run', note: 'or c' }],
        plain,
      ),
    ).toEqual(['  1. cd x', '  2. Group:', '     a', '     b', '  3. run', '     or c'])
  })
  it('pads numbers when there are ten or more steps', () => {
    const rows = numbered(
      Array.from({ length: 10 }, (_, i) => `s${i}`),
      plain,
    )
    expect(rows[0]).toBe('   1. s0')
    expect(rows[9]).toBe('  10. s9')
  })
})

describe('displayPath / cdTarget', () => {
  const cwd = join('/', 'home', 'me', 'projects')
  it('is ./rel inside the cwd and absolute outside it', () => {
    expect(displayPath(join(cwd, 'shop'), cwd)).toMatch(/^\.[/\\]shop$/)
    expect(displayPath(join(cwd, 'a', 'b'), cwd)).toMatch(/^\.[/\\]a[/\\]b$/)
    expect(displayPath(join('/', 'tmp', 'shop'), cwd)).toBe(join('/', 'tmp', 'shop'))
    expect(displayPath(cwd, cwd)).toBe('.')
  })
  it('does not treat a sibling starting with .. as outside', () => {
    expect(displayPath(join(cwd, '..shop'), cwd)).toMatch(/^\.[/\\]\.\.shop$/)
  })
  it('cds into the relative path, the absolute one outside, nothing for the cwd', () => {
    expect(cdTarget(join(cwd, 'shop'), cwd)).toBe('shop')
    expect(cdTarget(join('/', 'tmp', 'shop'), cwd)).toBe(join('/', 'tmp', 'shop'))
    expect(cdTarget(cwd, cwd)).toBeUndefined()
  })
})

describe('colorEnabled', () => {
  it('only on a TTY without NO_COLOR or TERM=dumb', () => {
    expect(colorEnabled({ isTTY: true }, {})).toBe(true)
    expect(colorEnabled({ isTTY: false }, {})).toBe(false)
    expect(colorEnabled({}, {})).toBe(false)
    expect(colorEnabled({ isTTY: true }, { NO_COLOR: '1' })).toBe(false)
    expect(colorEnabled({ isTTY: true }, { TERM: 'dumb' })).toBe(false)
  })
})

describe('stackSummary', () => {
  it('names the stack, counts apps, lists tool, ORM, services and ports', () => {
    const s = { ...config, orm: 'drizzle' as const, services: ['postgres', 'valkey'] }
    expect(stackSummary(s, plain)).toEqual([
      '✓ demo: 2 apps · turbo · drizzle · postgres, valkey',
      '  ports  web 3000 · api 4000',
    ])
  })
  it('singular app, no ORM or services, no ports row without ports', () => {
    const one = { ...config, apps: [{ name: 'api', kind: 'backend' as const, framework: 'hono' }] }
    expect(stackSummary(one, plain)).toEqual(['✓ demo: 1 app · turbo'])
  })
})

describe('createReport', () => {
  const base = {
    root: '/p/demo',
    cwd: '/p',
    stack: config,
    fixes: [fix],
    warnings: [],
    manual: ['pnpm install'],
  }
  it('hides fixes, ends with the kbee tip', () => {
    const out = createReport(base, plain)
    expect(out.join('\n')).not.toContain('fix:')
    expect(out).toContain('Created ./demo')
    expect(out).toContain('Next steps:')
    expect(out).toContain('  1. cd demo')
    expect(out.at(-1)).toBe(KBEE_TIP)
  })
  it('--verbose lists each fix first', () => {
    expect(createReport(base, { ...plain, verbose: true })[0]).toBe(`fix: ${fix.message}`)
  })
  it('keeps warnings visible, after the summary', () => {
    const out = createReport({ ...base, warnings: [warn] }, plain)
    expect(out.slice(0, 3)).toEqual([
      '✓ demo: 2 apps · turbo',
      '  ports  web 3000 · api 4000',
      `▲ warning: ${warn.message}`,
    ])
  })
  it('colors warnings yellow and the check green only when color is on', () => {
    const out = createReport({ ...base, warnings: [warn] }, { color: true }).join('\n')
    expect(out).toContain(`\x1b[33m▲ warning: ${warn.message}\x1b[39m`)
    expect(out).toContain('\x1b[32m✓\x1b[39m')
    expect(createReport({ ...base, warnings: [warn] }, plain).join('\n')).not.toContain('\x1b[')
  })
  it('with kbee: no tip, the kbee step closes the list', () => {
    const out = createReport({ ...base, stack: { ...config, kbee: true } }, plain)
    expect(out.join('\n')).not.toContain('Tip:')
    expect(out.at(-1)).toBe('     In Claude Code / Codex: /kbee init')
  })
})

describe('add reports', () => {
  it('add app: one line with kind, framework, port and file count, then numbered steps', () => {
    const app = { name: 'store', kind: 'frontend' as const, framework: 'nuxt', port: 3002 }
    const out = addAppReport(
      { app, written: 38, fixes: [fix], warnings: [], manual: ['pnpm install'] },
      plain,
    )
    expect(out).toEqual([
      '✓ Added frontend store (nuxt) · port 3002 · 38 files',
      '',
      'Next steps:',
      '  1. pnpm install',
      '  2. pnpm dev',
    ])
  })
  it('add service: one line, then docker compose up for it', () => {
    const r = { service: 'redis', label: 'Redis', written: 7, fixes: [], warnings: [], message: '' }
    expect(addServiceReport(r, plain)).toEqual([
      '✓ Added service redis (Redis) · 7 files',
      '',
      'Next steps:',
      '  1. docker compose up -d redis',
    ])
  })
  it('add service no-op: just the message', () => {
    const r = { service: 'redis', written: 0, fixes: [], warnings: [], message: 'already there' }
    expect(addServiceReport(r, plain)).toEqual(['already there'])
  })
})
