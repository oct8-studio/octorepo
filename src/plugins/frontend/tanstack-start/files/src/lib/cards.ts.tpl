export interface BackendResult {
  name: string
  data?: { message: string }
  error?: unknown
}

export interface CardProps {
  title: string
  body: string
  ok: boolean
}

/** Maps a backend /hello result to the props of a card; failures become an "unreachable" card. */
export function toCard(result: BackendResult): CardProps {
  if (result.data) return { title: result.name, body: result.data.message, ok: true }
  return { title: result.name, body: 'unreachable', ok: false }
}
