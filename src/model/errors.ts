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
