import { cancel, confirm, intro, isCancel, multiselect, note, select, text } from '@clack/prompts'
import { CLI_NAME } from '../meta'
import { CancelledError, CliError } from '../model/errors'
import type { AppKind, AppSpec, MonorepoTool, StackConfig } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { appNameProblem, type Issue, validateStack } from '../rules'

const NAME_RE = /^[a-z][a-z0-9-]*$/

/** Unwraps a prompt result; on cancel prints "Cancelled." once and throws a silent CancelledError. */
export function answer<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel('Cancelled.')
    throw new CancelledError()
  }
  return value as Exclude<T, symbol>
}

/** Inline validator for an app-name prompt: the same name rules validateStack applies. */
export function appNameValidator(
  kind: AppKind,
  existing: Pick<AppSpec, 'name' | 'kind'>[],
): (value: string | undefined) => string | undefined {
  return (value) => {
    const name = value ?? ''
    const problem = appNameProblem({ name, kind }, existing)
    return problem ? `"${name}" ${problem}` : undefined
  }
}

function describeApp(app: AppSpec): string {
  const extra = [
    app.apiStyle,
    app.port !== undefined ? `port ${app.port}` : undefined,
    app.uses?.length ? `uses ${app.uses.join(', ')}` : undefined,
  ].filter(Boolean)
  return `${app.kind} ${app.name}: ${app.framework}${extra.length ? ` (${extra.join(', ')})` : ''}`
}

function list(title: string, issues: Issue[]): string[] {
  return issues.length ? [`${title}:`, ...issues.map((i) => `  - ${i.message}`)] : []
}

/** Interactive create flow (spec §5.1): name, tool, apps loop, frontend links, services, review. */
export async function promptForStack(
  reg: Registry,
  opts: { defaultName?: string } = {},
): Promise<StackConfig> {
  intro(CLI_NAME)
  const name = answer(
    await text({
      message: 'Project name',
      placeholder: 'acme',
      ...(opts.defaultName ? { initialValue: opts.defaultName } : {}),
      validate: (v) => (NAME_RE.test(v ?? '') ? undefined : 'Use lowercase letters, digits and -'),
    }),
  )
  const monorepoTool = answer(
    await select<MonorepoTool>({
      message: 'Monorepo tool',
      options: [...reg.monorepo.values()].map((m) => ({ value: m.id, label: m.label })),
    }),
  )

  const apps: AppSpec[] = []
  for (;;) {
    const kind = answer(
      await select<AppKind | 'done'>({
        message: apps.length ? 'Add another app?' : 'Add an app',
        options: [
          { value: 'backend', label: 'Backend' },
          { value: 'frontend', label: 'Frontend' },
          ...(apps.length ? [{ value: 'done' as const, label: 'Done adding apps' }] : []),
        ],
      }),
    )
    if (kind === 'done') break
    const appName = answer(
      await text({
        message: `${kind === 'backend' ? 'Backend' : 'Frontend'} name`,
        placeholder: kind === 'backend' ? 'api' : 'web',
        validate: appNameValidator(kind, apps),
      }),
    )
    const plugins = reg.frameworksOf(kind)
    const framework = answer(
      await select<string>({
        message: 'Framework',
        options: plugins.map((p) => ({ value: p.id, label: p.label })),
      }),
    )
    const app: AppSpec = { name: appName, kind, framework }
    const styles = reg.framework(framework, kind)?.apiStyles ?? []
    if (kind === 'backend' && styles.length > 1) {
      app.apiStyle = answer(
        await select<string>({
          message: 'API style',
          options: styles.map((s) => ({ value: s })),
        }),
      )
    }
    apps.push(app)
  }

  // Asked after the loop so frontends can use backends added in any order.
  const backends = apps.filter((a) => a.kind === 'backend')
  for (const fe of apps.filter((a) => a.kind === 'frontend')) {
    fe.uses = backends.length
      ? answer(
          await multiselect<string>({
            message: `Which backends does ${fe.name} use?`,
            options: backends.map((b) => ({ value: b.name })),
            initialValues: backends.map((b) => b.name),
            required: false,
          }),
        )
      : []
  }

  const services = reg.services.size
    ? answer(
        await multiselect<string>({
          message: 'Compose services',
          options: [...reg.services.values()].map((s) => ({ value: s.id, label: s.label })),
          required: false,
        }),
      )
    : []

  const stack: StackConfig = { name, monorepoTool, packageManager: 'pnpm', apps, services }
  const v = validateStack(stack, reg)
  note(
    [
      `${name} (${monorepoTool}, pnpm)`,
      ...v.stack.apps.map((a) => `  ${describeApp(a)}`),
      `services: ${services.length ? services.join(', ') : 'none'}`,
      ...list('Auto-fixes', v.fixes),
      ...list('Warnings', v.warnings),
      ...list('Errors', v.errors),
    ].join('\n'),
    'Review',
  )
  if (v.errors.length) throw new CliError(v.errors.map((e) => e.message).join('\n'))
  if (!answer(await confirm({ message: 'Generate this project?' }))) {
    cancel('Cancelled.')
    throw new CancelledError()
  }
  return stack
}
