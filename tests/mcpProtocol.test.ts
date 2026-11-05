import { describe, expect, it } from 'vitest'
import { handleRpc, SUPPORTED_VERSIONS, type Tool } from '../functions/src/mcpProtocol'

const info = { name: 't', version: '1', instructions: 'i' }
const tools: Tool<{ uid: string }>[] = [
  { name: 'echo', description: 'd', readOnly: true, inputSchema: { type: 'object' }, run: async (a, c) => ({ a, uid: c.uid }) },
  { name: 'boom', description: 'd', readOnly: false, inputSchema: { type: 'object' }, run: async () => { throw new Error('zły termin') } },
]
const rpc = (method: string, params?: unknown, id: unknown = 1) => handleRpc({ jsonrpc: '2.0', id, method, params }, tools, { uid: 'u1' }, info)

describe('MCP', () => {
  it('initialize zwraca wersję klienta, a nieznaną zastępuje najnowszą', async () => {
    expect((await rpc('initialize', { protocolVersion: '2025-03-26' }))?.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} } })
    expect((await rpc('initialize', { protocolVersion: '1999' }))?.result).toMatchObject({ protocolVersion: SUPPORTED_VERSIONS[0] })
  })
  it('powiadomienia (bez id) nie dostają odpowiedzi', async () => {
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, { uid: 'u' }, info)).toBeNull()
  })
  it('tools/list opisuje narzędzia z podpowiedzią tylko-do-odczytu', async () => {
    const r = (await rpc('tools/list'))?.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }
    expect(r.tools.map((t) => [t.name, t.annotations.readOnlyHint])).toEqual([['echo', true], ['boom', false]])
  })
  it('tools/call przekazuje argumenty i kontekst', async () => {
    const r = (await rpc('tools/call', { name: 'echo', arguments: { x: 1 } }))?.result as { content: { text: string }[] }
    expect(JSON.parse(r.content[0].text)).toEqual({ a: { x: 1 }, uid: 'u1' })
  })
  it('błąd narzędzia to isError, a nie błąd protokołu', async () => {
    const r = await rpc('tools/call', { name: 'boom' })
    expect(r?.error).toBeUndefined()
    expect(r?.result).toMatchObject({ isError: true, content: [{ text: 'zły termin' }] })
  })
  it('nieznane narzędzie i metoda oraz zły format', async () => {
    expect((await rpc('tools/call', { name: 'nie-ma' }))?.error?.code).toBe(-32602)
    expect((await rpc('resources/list'))?.error?.code).toBe(-32601)
    expect((await handleRpc({ jsonrpc: '1.0', id: 1, method: 'x' }, tools, { uid: 'u' }, info))?.error?.code).toBe(-32600)
  })
  it('ping', async () => {
    expect((await rpc('ping'))?.result).toEqual({})
  })
})
