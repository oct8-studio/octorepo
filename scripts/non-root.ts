/** Whether a docker image's `Config.User` means the container runs as root (empty counts as root). */
export function runsAsRoot(user: string): boolean {
  return (
    user === '' ||
    user === 'root' ||
    user.startsWith('root:') ||
    user === '0' ||
    user.startsWith('0:')
  )
}
