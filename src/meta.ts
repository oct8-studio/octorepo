import pkg from '../package.json' with { type: 'json' }

export const CLI_NAME = 'octorepo' as const
export const CLI_VERSION: string = pkg.version
/** Manifest written at the root of every generated repo and read by `add`. */
export const MANIFEST_FILE = '.octorepo.json'
