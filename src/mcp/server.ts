import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CLI_NAME, CLI_VERSION } from '../meta'
import { formatError } from '../model/errors'
import { StackConfigSchema } from '../model/stack'
import type { Registry } from '../plugins/registry'
import { addAppInput, createInput, readManifestInput, toolHandlers } from './tools'

const INSTRUCTIONS = `Scaffolds and extends pnpm monorepos (Turborepo or Nx) with frontends, backends, typed API clients and Docker Compose services.
Call list_options first, then validate_stack until it has no errors, then create. Use read_manifest and add_app on an existing repo.`

/** The tool's result as JSON text, the same JSON the CLI's `--json` mode prints. */
async function reply(fn: () => unknown): Promise<CallToolResult> {
  try {
    const result = await fn()
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e) {
    return { content: [{ type: 'text', text: formatError(e, false).text }], isError: true }
  }
}

export function createMcpServer(reg: Registry, opts: { cwd?: string } = {}): McpServer {
  const tools = toolHandlers(reg, opts.cwd ?? process.cwd())
  const server = new McpServer(
    { name: CLI_NAME, version: CLI_VERSION },
    { instructions: INSTRUCTIONS },
  )

  server.registerTool(
    'list_options',
    {
      description:
        'List the monorepo tools, frameworks, services, ORMs and presets a stack can use.',
      annotations: { readOnlyHint: true },
    },
    () => reply(tools.list_options),
  )
  server.registerTool(
    'validate_stack',
    {
      description:
        'Check a stack config without writing anything. Returns the normalized stack (ports assigned), errors, warnings and the fixes that were applied.',
      inputSchema: StackConfigSchema,
      annotations: { readOnlyHint: true },
    },
    (input) => reply(() => tools.validate_stack(input)),
  )
  server.registerTool(
    'create',
    {
      description:
        'Create a new monorepo in dir (must be empty or missing). Returns { root, warnings, fixes, manual }.',
      inputSchema: createInput,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => reply(() => tools.create(input)),
  )
  server.registerTool(
    'add_app',
    {
      description:
        'Add a frontend or backend app to the generated repo at cwd. Rewrites only tool-owned files. Returns { written, warnings, fixes, manual }.',
      inputSchema: addAppInput,
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    (input) => reply(() => tools.add_app(input)),
  )
  server.registerTool(
    'read_manifest',
    {
      description: 'Read the .octorepo.json manifest (the stack) of the generated repo at cwd.',
      inputSchema: readManifestInput,
      annotations: { readOnlyHint: true },
    },
    (input) => reply(() => tools.read_manifest(input)),
  )
  return server
}

/** `octorepo mcp`: serve on stdio. stdout carries protocol messages only. */
export async function runMcpServer(reg: Registry): Promise<void> {
  await createMcpServer(reg).connect(new StdioServerTransport())
}
