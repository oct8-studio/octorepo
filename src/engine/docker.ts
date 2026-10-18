import type { AppContext } from '../plugins/types'

/**
 * Build stage up to `pnpm install`. pnpm (pinned by the root packageManager) is fetched in its own
 * layer keyed on the root package.json only, so source edits don't re-download it on every build.
 */
export const PNPM_BUILD_STAGE = `FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json ./
RUN pnpm --version
COPY . .
RUN pnpm install --frozen-lockfile
`

/**
 * Multi-stage Dockerfile for a Node service in a pnpm workspace. Identical for Nx and Turbo
 * because it only uses pnpm. `startCmd` is the runtime CMD, e.g. ['node', 'dist/main.js'].
 */
export function nodeServiceDockerfile(ctx: AppContext, opts: { startCmd: string[] }): string {
  const pkg = `${ctx.scope}/${ctx.app.name}`
  const port = ctx.app.port
  return `${PNPM_BUILD_STAGE}RUN pnpm --filter ${pkg}... build
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
