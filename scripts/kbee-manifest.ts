/**
 * Port of `validateManifest` from kbee's shared/scripts/kbee-tool.mjs (github.com/oct8-studio/kbee
 * @ b4b8343, unchanged on fix/skeleton-kb-and-docs @ f51d90a). The unit tests and the e2e gate use
 * it to check a generated `kb/manifest.json` against kbee's own rules without a network fetch; the
 * e2e also runs the real kbee-tool when the skills install put it in the repo.
 */
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/

const isRelPath = (p: unknown) =>
  typeof p === 'string' &&
  p !== '' &&
  !p.startsWith('/') &&
  !/^[a-zA-Z]:/.test(p) &&
  !p.split(/[\\/]/).includes('..')

export function validateKbeeManifest(obj: unknown): string[] {
  const errors: string[] = []
  if (!obj || typeof obj !== 'object' || Array.isArray(obj))
    return ['manifest must be a JSON object']
  const m = obj as Record<string, unknown>
  if (m.kbeeVersion !== 1) errors.push('kbeeVersion must be 1')
  const rv = m.rulesVersion
  if (rv !== undefined && !(Number.isInteger(rv) && (rv as number) >= 1)) {
    errors.push('rulesVersion must be a positive integer')
  }
  if (m.mode !== undefined && m.mode !== 'direct' && m.mode !== 'pr') {
    errors.push("mode must be 'direct' or 'pr'")
  }
  if (m.location !== undefined && m.location !== 'in-repo' && m.location !== 'separate') {
    errors.push("location must be 'in-repo' or 'separate'")
  }
  if (m.teamDocs !== undefined && !(Array.isArray(m.teamDocs) && m.teamDocs.every(isRelPath))) {
    errors.push('teamDocs must be an array of relative paths')
  }
  if (!Array.isArray(m.repos)) return [...errors, 'repos must be an array']
  const seen = new Set<string>()
  m.repos.forEach((entry: unknown, i: number) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`repos[${i}] must be an object`)
      return
    }
    const r = entry as Record<string, unknown>
    const name = r.name
    if (!name) errors.push(`repos[${i}].name is required`)
    else if (typeof name !== 'string' || !NAME_RE.test(name))
      errors.push(`repos[${i}].name must match ${NAME_RE}`)
    else if (seen.has(name)) errors.push(`duplicate repo name: ${name}`)
    else seen.add(name)
    for (const key of ['defaultBranch', 'pathHint']) {
      if (typeof r[key] !== 'string' || !r[key]) errors.push(`repos[${i}].${key} is required`)
    }
    const sha = r.syncedSha
    if (sha != null && !(typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha))) {
      errors.push(`repos[${i}].syncedSha must be a hex commit SHA or null`)
    }
  })
  return errors
}

/** kbee-tool's pointer-block regex (`findKb` step 3): captures the KB path. */
export const KBEE_POINTER_RE =
  /<!-- kbee:start -->[\s\S]*?kbee-kb-path:\s*(\S+)[\s\S]*?<!-- kbee:end -->/
