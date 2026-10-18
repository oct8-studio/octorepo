export class CliError extends Error {
  exitCode = 1

  constructor(message: string) {
    super(message)
    this.name = 'CliError'
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
  if (!(e instanceof Error)) return { text: String(e), exitCode }
  return { text: debug && e.stack ? e.stack : e.message, exitCode }
}
