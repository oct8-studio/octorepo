import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  server: { port: {{port}} },
  // React's plugin must come after Start's; nitro builds the Node server into .output/.
  plugins: [tanstackStart(), nitro(), react()],
})
