import type { AppSpec, MonorepoTool, StackConfig } from '../src/model/stack'

export interface Combo {
  id: string
  stack: StackConfig
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

/** One frontend using one backend, plus postgres. */
function pair(fe: string, be: string, tool: MonorepoTool): Combo {
  return {
    id: `${fe}-${be}-${tool}`,
    stack: stack(
      tool,
      [
        { name: 'web', kind: 'frontend', framework: fe, uses: ['api'] },
        { name: 'api', kind: 'backend', framework: be },
      ],
      ['postgres'],
    ),
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
  })),
  ...NEW_FRONTENDS.flatMap((fe) => [pair(fe, 'hono', 'turbo'), pair(fe, 'express', 'nx')]),
  ...NEW_BACKENDS.flatMap((be) => [pair('react-vite', be, 'turbo'), pair('next', be, 'nx')]),
]

export function findCombo(id: string): Combo | undefined {
  return COMBOS.find((c) => c.id === id)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'list') {
    console.log(COMBOS.map((c) => c.id).join('\n'))
  } else if (cmd === 'matrix') {
    console.log(JSON.stringify(COMBOS.map((c) => c.id)))
  } else if (cmd === 'show' && rest[0]) {
    console.log(JSON.stringify(findCombo(rest[0])?.stack ?? null, null, 2))
  } else {
    console.error('Usage: combos.ts list | matrix | show <id>')
    process.exit(1)
  }
}
