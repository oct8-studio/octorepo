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
