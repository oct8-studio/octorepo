import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  server: { port: {{port}} },
  test: { environment: 'jsdom' },
})
