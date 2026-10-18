import type { AppContext } from '../plugins/types'

/**
 * Multi-stage Dockerfile for a Node service in a pnpm workspace. Identical for Nx and Turbo
 * because it only uses pnpm. `startCmd` is the runtime CMD, e.g. ['node', 'dist/main.js'].
 */
export function nodeServiceDockerfile(ctx: AppContext, opts: { startCmd: string[] }): string {
  const pkg = `${ctx.scope}/${ctx.app.name}`
  const port = ctx.app.port
  return `FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter ${pkg}... build
RUN pnpm deploy --filter ${pkg} --prod --legacy /out

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=${port}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE ${port}
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ${JSON.stringify(opts.startCmd)}
`
}
