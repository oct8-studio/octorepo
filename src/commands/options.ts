import type { Registry } from '../plugins/registry'
import type { UiFamily } from '../plugins/types'
import { PRESETS } from '../presets'

export interface Option {
  id: string
  label: string
}

/** Everything a stack can be built from: what `options --json` prints and `list_options` returns. */
export interface OptionsList {
  monorepoTools: Option[]
  frameworks: {
    frontend: (Option & { rendering?: 'ssr' | 'spa'; uiFamily?: UiFamily })[]
    backend: (Option & { apiStyles: string[] })[]
  }
  services: Option[]
  orms: Option[]
  presets: { id: string; description: string }[]
}

export function listOptions(reg: Registry): OptionsList {
  return {
    monorepoTools: [...reg.monorepo.values()].map(({ id, label }) => ({ id, label })),
    frameworks: {
      frontend: reg.frameworksOf('frontend').map(({ id, label, rendering, uiFamily }) => ({
        id,
        label,
        ...(rendering ? { rendering } : {}),
        ...(uiFamily ? { uiFamily } : {}),
      })),
      backend: reg
        .frameworksOf('backend')
        .map(({ id, label, apiStyles }) => ({ id, label, apiStyles })),
    },
    services: [...reg.services.values()].map(({ id, label }) => ({ id, label })),
    orms: [...reg.orms.values()].map(({ id, label }) => ({ id, label })),
    presets: PRESETS.map(({ id, description }) => ({ id, description })),
  }
}

/** Human-readable table: one row per category. */
export function formatOptions(o: OptionsList): string {
  const ids = (xs: { id: string }[]) => (xs.length ? xs.map((x) => x.id).join(', ') : '(none)')
  const rows: [string, string][] = [
    ['Monorepo tools', ids(o.monorepoTools)],
    ['Frontend frameworks', ids(o.frameworks.frontend)],
    ['Backend frameworks', ids(o.frameworks.backend)],
    ['Services', ids(o.services)],
    ['ORMs', ids(o.orms)],
    ['Presets', ids(o.presets)],
  ]
  const width = Math.max(...rows.map(([k]) => k.length))
  return rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join('\n')
}
