import { solidStart } from '@solidjs/start/config'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

// nitro builds the Node production server into .output/ (run with `node .output/server/index.mjs`).
export default defineConfig({
  plugins: [solidStart(), nitro()],
})
