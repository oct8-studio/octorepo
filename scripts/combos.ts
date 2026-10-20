import type { AppSpec, MonorepoTool, OrmId, StackConfig } from '../src/model/stack'

export interface Combo {
  id: string
  stack: StackConfig
  /** e2e flags CI passes for this combo: every combo runs `pnpm dev`; ORM combos also boot compose. */
  args: string
}

const FRONTENDS = ['next', 'react-vite'] as const
const BACKENDS = ['express', 'nest'] as const
const TOOLS: MonorepoTool[] = ['turbo', 'nx']
const NEW_FRONTENDS = [
  'vue-vite',
  'nuxt',
  'sveltekit',
  'astro',
  'tanstack-start',
  'react-router',
  'solid-start',
] as const
const NEW_BACKENDS = ['fastify', 'hono', 'koa'] as const

function stack(tool: MonorepoTool, apps: AppSpec[], services: string[]): StackConfig {
  return { name: 'e2e', monorepoTool: tool, packageManager: 'pnpm', apps, services }
}

/** One frontend using one backend, plus postgres (and an ORM when given). */
function pair(fe: string, be: string, tool: MonorepoTool, orm?: OrmId): Combo {
  const base = stack(
    tool,
    [
      { name: 'web', kind: 'frontend', framework: fe, uses: ['api'] },
      { name: 'api', kind: 'backend', framework: be },
    ],
    ['postgres'],
  )
  return {
    id: orm ? `${fe}-${be}-${orm}-${tool}` : `${fe}-${be}-${tool}`,
    stack: orm ? { ...base, orm } : base,
    // Migrations and the seed only run in compose (the one-shot migrate service).
    args: orm ? '--dev --compose' : '--dev',
  }
}

/**
 * Plan 1's full frontend × backend × tool grid plus react-vite alone; then each newer frontend with
 * hono on turbo and express on nx, and each newer backend behind react-vite on turbo and next on nx.
 */
export const COMBOS: Combo[] = [
  ...FRONTENDS.flatMap((fe) => BACKENDS.flatMap((be) => TOOLS.map((tool) => pair(fe, be, tool)))),
  ...TOOLS.map((tool) => ({
    id: `react-vite-${tool}`,
    stack: stack(tool, [{ name: 'web', kind: 'frontend', framework: 'react-vite' }], []),
    args: '--dev',
  })),
  ...NEW_FRONTENDS.flatMap((fe) => [pair(fe, 'hono', 'turbo'), pair(fe, 'express', 'nx')]),
  ...NEW_BACKENDS.flatMap((be) => [pair('react-vite', be, 'turbo'), pair('next', be, 'nx')]),
  // Both ORMs on both tools, behind SSR and SPA frontends.
  pair('next', 'express', 'turbo', 'drizzle'),
  pair('react-vite', 'nest', 'nx', 'prisma'),
  pair('nuxt', 'hono', 'nx', 'drizzle'),
  pair('sveltekit', 'fastify', 'turbo', 'prisma'),
]

export function findCombo(id: string): Combo | undefined {
  return COMBOS.find((c) => c.id === id)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'list') {
    console.log(COMBOS.map((c) => c.id).join('\n'))
  } else if (cmd === 'matrix') {
    // A GitHub Actions `strategy.matrix` object: one job per combo, named `e2e (<id>, <args>)`.
    console.log(JSON.stringify({ include: COMBOS.map(({ id, args }) => ({ combo: id, args })) }))
  } else if (cmd === 'show' && rest[0]) {
    console.log(JSON.stringify(findCombo(rest[0])?.stack ?? null, null, 2))
  } else {
    console.error('Usage: combos.ts list | matrix | show <id>')
    process.exit(1)
  }
}
