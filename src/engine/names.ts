export function upperSnake(name: string): string {
  return name.replace(/-/g, '_').toUpperCase()
}

export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** `billing-api` → `BillingApi`; used after a prefix such as `create` or `load`. */
export function pascalCase(name: string): string {
  const c = camelCase(name)
  return c.charAt(0).toUpperCase() + c.slice(1)
}

/** A copy of `apps` sorted by name, so generated code does not depend on manifest order. */
export function byName<T extends { name: string }>(apps: readonly T[]): T[] {
  return [...apps].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
