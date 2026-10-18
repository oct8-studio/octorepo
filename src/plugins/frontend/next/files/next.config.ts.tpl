import path from 'node:path'
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  // Trace files from the monorepo root so workspace packages are included in the standalone output.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['{{scope}}/ui-react'],
}

export default config
