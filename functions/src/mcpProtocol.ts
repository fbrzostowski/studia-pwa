// Minimalna, bezstanowa obsługa MCP (Streamable HTTP, odpowiedzi JSON): initialize, ping, tools/list, tools/call.
// Czysta logika bez usług Google — testowana w tests/mcpProtocol.test.ts.

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

export interface Tool<C> {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  run: (args: Record<string, unknown>, ctx: C) => Promise<unknown>
}

export interface RpcMessage {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

type Reply = { jsonrpc: '2.0'; id: unknown; result?: unknown; error?: { code: number; message: string } }

const ok = (id: unknown, result: unknown): Reply => ({ jsonrpc: '2.0', id, result })
const fail = (id: unknown, code: number, message: string): Reply => ({ jsonrpc: '2.0', id, error: { code, message } })

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Odpowiedź na jedną wiadomość; null dla powiadomień (bez `id`), na które się nie odpowiada. */
export async function handleRpc<C>(
  msg: RpcMessage,
  tools: Tool<C>[],
  ctx: C,
  info: { name: string; version: string; instructions: string },
): Promise<Reply | null> {
  if (!isObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(null, -32600, 'Nieprawidłowe żądanie.')
  const isNotification = msg.id === undefined || msg.id === null
  const params = isObject(msg.params) ? msg.params : {}
  if (isNotification) return null

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return ok(msg.id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: info.name, version: info.version },
        instructions: info.instructions,
      })
    }
    case 'ping':
      return ok(msg.id, {})
    case 'tools/list':
      return ok(msg.id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly, openWorldHint: false },
        })),
      })
    case 'tools/call': {
      const tool = tools.find((t) => t.name === params.name)
      if (!tool) return fail(msg.id, -32602, `Nieznane narzędzie: ${String(params.name)}`)
      const args = isObject(params.arguments) ? params.arguments : {}
      try {
        const out = await tool.run(args, ctx)
        return ok(msg.id, { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 1) }] })
      } catch (e) {
        // błąd narzędzia widzi model (żeby mógł poprawić wywołanie), nie jest to błąd protokołu
        return ok(msg.id, { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] })
      }
    }
    default:
      return fail(msg.id, -32601, `Nieobsługiwana metoda: ${msg.method}`)
  }
}
