export class CliError extends Error {
  exitCode = 1

  constructor(message: string) {
    super(message)
    this.name = 'CliError'
  }
}

/**
 * The user cancelled a prompt. The prompt already said so, so the CLI prints nothing more and
 * exits 0: cancelling is a choice, not a failure (npm/pnpm exec then add no error of their own).
 */
export class CancelledError extends CliError {
  constructor() {
    super('Cancelled')
    this.exitCode = 0
    this.name = 'CancelledError'
  }
}

export type ManifestErrorReason = 'missing' | 'unsupported-schema' | 'invalid'

export class ManifestError extends CliError {
  reason: ManifestErrorReason

  constructor(reason: ManifestErrorReason, message: string) {
    super(message)
    this.name = 'ManifestError'
    this.reason = reason
  }
}

/** What the CLI prints for a failure: the message only, plus the stack when debugging (OCTOREPO_DEBUG=1). */
export function formatError(e: unknown, debug: boolean): { text: string; exitCode: number } {
  const exitCode = e instanceof CliError ? e.exitCode : 1
  if (e instanceof CancelledError) return { text: '', exitCode }
  if (!(e instanceof Error)) return { text: String(e), exitCode }
  return { text: debug && e.stack ? e.stack : e.message, exitCode }
}
