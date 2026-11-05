// Pełny przebieg OAuth dla MCP na emulatorze Firestore: rejestracja → zgoda → kod → token → odświeżenie → odłączenie.
import { createHash } from 'node:crypto'
import { initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js'
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { authenticate, decideAuthorization, exchangeToken, listConnections, OAuthError, registerClient, revokeConnection, startAuthorization } from '../functions/src/mcpOAuth'

const user = { uid: 'u1', name: 'filip', isAdmin: false }
const verifier = 'v'.repeat(50)
const challenge = createHash('sha256').update(verifier).digest('base64url')
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
let db: FirebaseFirestore.Firestore

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  initializeApp({ projectId: 'studia-pwa-test' })
  db = getFirestore()
})
beforeEach(async () => {
  for (const c of ['users', 'mcpClients', 'mcpAuthRequests', 'mcpCodes', 'mcpGrants', 'mcpTokens']) {
    const snap = await db.collection(c).get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  }
  await db.doc('users/u1').set({ status: 'approved', role: 'user', username: 'filip' })
})

const register = () => registerClient({ client_name: 'Claude', redirect_uris: [REDIRECT] })
async function authorize(clientId: string, extra: Record<string, unknown> = {}) {
  const url = await startAuthorization({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, state: 'st', code_challenge: challenge, code_challenge_method: 'S256', ...extra })
  return new URL(url)
}
async function fullFlow() {
  const { client_id } = await register()
  const app = await authorize(client_id)
  const id = app.searchParams.get('mcp_authorize')!
  const { redirect } = await decideAuthorization(user, id, 'approve')
  const back = new URL(redirect!)
  const tokens = await exchangeToken({ grant_type: 'authorization_code', client_id, code: back.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: verifier })
  return { client_id, back, tokens }
}

describe('OAuth MCP', () => {
  it('rejestracja odrzuca niebezpieczne adresy powrotne', async () => {
    await expect(registerClient({ redirect_uris: ['http://evil.com/cb'] })).rejects.toBeInstanceOf(OAuthError)
    await expect(registerClient({ redirect_uris: [] })).rejects.toBeInstanceOf(OAuthError)
    expect((await register()).token_endpoint_auth_method).toBe('none')
  })

  it('pełny przebieg: kod, token, wywołanie jako użytkownik, odświeżenie, odłączenie', async () => {
    const { client_id, back, tokens } = await fullFlow()
    expect(back.origin + back.pathname).toBe(REDIRECT)
    expect(back.searchParams.get('state')).toBe('st')
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 })
    expect(await authenticate(tokens.access_token)).toEqual(user)
    expect(await authenticate('zly')).toBeNull()

    const list = await listConnections('u1')
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Claude')

    const next = await exchangeToken({ grant_type: 'refresh_token', client_id, refresh_token: tokens.refresh_token })
    expect(await authenticate(next.access_token)).toEqual(user)
    // rotacja: stary refresh_token przestaje działać
    await expect(exchangeToken({ grant_type: 'refresh_token', client_id, refresh_token: tokens.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' })

    await revokeConnection('u1', list[0].id)
    expect(await authenticate(next.access_token)).toBeNull()
    expect(await authenticate(tokens.access_token)).toBeNull()
    expect(await listConnections('u1')).toEqual([])
    await expect(exchangeToken({ grant_type: 'refresh_token', client_id, refresh_token: next.refresh_token })).rejects.toMatchObject({ code: 'invalid_grant' })
  })

  it('kod jest jednorazowy i wymaga właściwego PKCE, klienta i adresu', async () => {
    const { client_id } = await register()
    const mk = async () => {
      const id = (await authorize(client_id)).searchParams.get('mcp_authorize')!
      return new URL((await decideAuthorization(user, id, 'approve')).redirect!).searchParams.get('code')!
    }
    const base = { grant_type: 'authorization_code', client_id, redirect_uri: REDIRECT, code_verifier: verifier }
    const code = await mk()
    await exchangeToken({ ...base, code })
    await expect(exchangeToken({ ...base, code })).rejects.toMatchObject({ code: 'invalid_grant' }) // ponowne użycie
    await expect(exchangeToken({ ...base, code: await mk(), code_verifier: 'x'.repeat(50) })).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(exchangeToken({ ...base, code: await mk(), client_id: 'inny' })).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(exchangeToken({ ...base, code: await mk(), redirect_uri: 'https://evil.com/cb' })).rejects.toMatchObject({ code: 'invalid_grant' })
    await expect(exchangeToken({ grant_type: 'password' })).rejects.toMatchObject({ code: 'unsupported_grant_type' })
  })

  it('authorize: nieznany klient/adres bez przekierowania, brak PKCE z błędem do klienta', async () => {
    const { client_id } = await register()
    await expect(startAuthorization({ client_id: 'brak', redirect_uri: REDIRECT })).rejects.toMatchObject({ code: 'invalid_client' })
    await expect(startAuthorization({ client_id, redirect_uri: 'https://evil.com/cb', response_type: 'code' })).rejects.toMatchObject({ code: 'invalid_request' })
    const noPkce = new URL(await startAuthorization({ response_type: 'code', client_id, redirect_uri: REDIRECT, state: 'st' }))
    expect(noPkce.origin + noPkce.pathname).toBe(REDIRECT)
    expect(noPkce.searchParams.get('error')).toBe('invalid_request')
    expect(noPkce.searchParams.get('state')).toBe('st')
  })

  it('odmowa odsyła access_denied, a wygasłe żądanie jest odrzucane', async () => {
    const { client_id } = await register()
    const id = (await authorize(client_id)).searchParams.get('mcp_authorize')!
    expect(await decideAuthorization(user, id, 'info')).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai' })
    const denied = new URL((await decideAuthorization(user, id, 'deny')).redirect!)
    expect(denied.searchParams.get('error')).toBe('access_denied')
    await expect(decideAuthorization(user, id, 'approve')).rejects.toMatchObject({ code: 'expired' }) // żądanie zużyte

    const id2 = (await authorize(client_id)).searchParams.get('mcp_authorize')!
    await db.doc(`mcpAuthRequests/${id2}`).update({ expiresAt: new Date(Date.now() - 1000) })
    await expect(decideAuthorization(user, id2, 'approve')).rejects.toMatchObject({ code: 'expired' })
  })

  it('wygasły token dostępu i niezatwierdzone konto nie przechodzą; cudzego połączenia nie odłączysz', async () => {
    const { tokens } = await fullFlow()
    await db.doc('users/u1').update({ status: 'rejected' })
    expect(await authenticate(tokens.access_token)).toBeNull()
    await db.doc('users/u1').update({ status: 'approved' })
    expect(await authenticate(tokens.access_token)).toEqual(user)
    const [grant] = await listConnections('u1')
    await expect(revokeConnection('u2', grant.id)).rejects.toMatchObject({ code: 'not_found' })
    const tok = await db.collection('mcpTokens').get()
    await tok.docs[0].ref.update({ expiresAt: new Date(Date.now() - 1000) })
    expect(await authenticate(tokens.access_token)).toBeNull()
  })
})
