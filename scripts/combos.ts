import type { AppSpec, MonorepoTool, StackConfig } from '../src/model/stack'

export interface Combo {
  id: string
  stack: StackConfig
}

const FRONTENDS = ['next', 'react-vite'] as const
const BACKENDS = ['express', 'nest'] as const
const TOOLS: MonorepoTool[] = ['turbo', 'nx']

function stack(tool: MonorepoTool, apps: AppSpec[], services: string[]): StackConfig {
  return { name: 'e2e', monorepoTool: tool, packageManager: 'pnpm', apps, services }
}

/** Every frontend × backend × tool (one frontend using one backend + postgres), plus react-vite alone. */
export const COMBOS: Combo[] = [
  ...FRONTENDS.flatMap((fe) =>
    BACKENDS.flatMap((be) =>
      TOOLS.map((tool) => ({
        id: `${fe}-${be}-${tool}`,
        stack: stack(
          tool,
          [
            { name: 'web', kind: 'frontend', framework: fe, uses: ['api'] },
            { name: 'api', kind: 'backend', framework: be },
          ],
          ['postgres'],
        ),
      })),
    ),
  ),
  ...TOOLS.map((tool) => ({
    id: `react-vite-${tool}`,
    stack: stack(tool, [{ name: 'web', kind: 'frontend', framework: 'react-vite' }], []),
  })),
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
