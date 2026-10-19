import { expect, test } from 'vitest'
import { CLI_NAME, MANIFEST_FILE } from '../src/meta'
import { VERSIONS } from '../src/versions'

test('meta', () => {
  expect(CLI_NAME).toBe('octorepo')
  expect(MANIFEST_FILE).toBe('.octorepo.json')
})
test('versions are exact', () => {
  // Exact pins; a prerelease is allowed only where the package has no stable release (nitro 3).
  for (const [pkg, v] of Object.entries(VERSIONS)) {
    expect(v, pkg).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/)
  }
})
test('versions cover every Plan 2 framework dependency', () => {
  const keys = [
    'fastify',
    '@fastify/cors',
    '@fastify/swagger',
    'hono',
    '@hono/node-server',
    '@hono/zod-openapi',
    'koa',
    '@koa/router',
    '@types/koa',
    '@types/koa__router',
    'vue',
    '@vitejs/plugin-vue',
    'vue-tsc',
    '@vue/test-utils',
    '@vue/compiler-dom',
    'vue-router',
    'nuxt',
    'rolldown',
    'svelte',
    '@sveltejs/kit',
    '@sveltejs/adapter-node',
    '@sveltejs/vite-plugin-svelte',
    '@sveltejs/package',
    'svelte-check',
    '@testing-library/svelte',
    'astro',
    '@astrojs/node',
    '@astrojs/check',
    '@tanstack/react-start',
    '@tanstack/react-router',
    'nitro',
    'react-router',
    '@react-router/dev',
    '@react-router/node',
    '@react-router/serve',
    'isbot',
    'solid-js',
    '@solidjs/start',
    '@solidjs/router',
    '@solidjs/meta',
    'vinxi',
    'vite-plugin-solid',
    '@solidjs/testing-library',
  ]
  for (const k of keys) expect(VERSIONS[k], k).toBeDefined()
})
