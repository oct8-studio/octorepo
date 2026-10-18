export function upperSnake(name: string): string {
  return name.replace(/-/g, '_').toUpperCase()
}

export function camelCase(name: string): string {
  return name.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}
