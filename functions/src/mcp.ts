import './options.js'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { bearerFrom, routePath } from './mcpLogic.js'
import {
  OAuthError,
  authenticate,
  authorizationServerMetadata,
  decideAuthorization,
  exchangeToken,
  listConnections,
  protectedResourceMetadata,
  registerClient,
  resourceMetadataUrl,
  revokeConnection,
  startAuthorization,
} from './mcpOAuth.js'
import { handleRpc, type RpcMessage } from './mcpProtocol.js'
import { TOOLS } from './mcpTools.js'

const INSTRUCTIONS = [
  'Serwer aplikacji LOM.SGH (plan zajęć, materiały, podręczniki, zaliczenia i listy do nauki grupy studentów SGH).',
  'Działasz w imieniu jednego użytkownika; dane innych osób widzisz tak jak on w aplikacji.',
  'Daty podawaj jako RRRR-MM-DD. Nazwy przedmiotów sprawdź w list_subjects, jeśli nie jesteś pewien.',
  'Przed dodaniem czegokolwiek (materiał, termin, punkt do nauki) upewnij się, że użytkownik tego chce i ma komplet danych.',
].join(' ')

/**
 * Serwer MCP (Streamable HTTP, bezstanowy) z OAuth 2.1: Claude i ChatGPT same wykrywają logowanie (.well-known),
 * rejestrują się (/register), odsyłają użytkownika do /authorize (zgoda w aplikacji) i wymieniają kod na token (/token).
 * Firebase Hosting (firebase.json) przekierowuje te ścieżki na adres studia-pwa.web.app do tej funkcji.
 */
export const mcp = onRequest({ invoker: 'public', cors: false }, async (req, res) => {
  // CORS dla klientów w przeglądarce (np. MCP Inspector); dostęp i tak wymaga tokenu w nagłówku, bez ciasteczek
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
    'Cache-Control': 'no-store',
  })
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  const path = routePath(req.path)
  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>

  try {
    if (path.startsWith('/.well-known/')) {
      if (path.includes('oauth-protected-resource')) res.json(protectedResourceMetadata())
      else if (path.includes('oauth-authorization-server') || path.includes('openid-configuration')) res.json(authorizationServerMetadata())
      else res.status(404).json({ error: 'not_found' })
      return
    }
    if (path === '/register' && req.method === 'POST') {
      res.status(201).json(await registerClient(body))
      return
    }
    if (path === '/authorize' && req.method === 'GET') {
      res.redirect(302, await startAuthorization(req.query))
      return
    }
    if (path === '/token' && req.method === 'POST') {
      res.json(await exchangeToken(body))
      return
    }
    if (path !== '/') {
      res.status(404).json({ error: 'not_found' })
      return
    }

    // --- sam serwer MCP ---
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ error: 'Ten serwer MCP przyjmuje tylko POST.' })
      return
    }
    const token = bearerFrom(req.headers)
    const user = token ? await authenticate(token) : null
    if (!user) {
      // wg specyfikacji MCP: 401 ze wskazaniem metadanych, z których klient dowie się, jak się zalogować
      res
        .set('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl()}"`)
        .status(401)
        .json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Wymagane logowanie.' } })
      return
    }
    const info = { name: 'lom-sgh', version: '1.1.0', instructions: INSTRUCTIONS }
    const msg = req.body as RpcMessage | RpcMessage[]
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map((m) => handleRpc(m, TOOLS, user, info)))).filter((r) => r !== null)
      if (out.length === 0) res.status(202).end()
      else res.json(out)
      return
    }
    const out = await handleRpc(msg, TOOLS, user, info)
    if (out === null) res.status(202).end()
    else res.json(out)
  } catch (e) {
    if (e instanceof OAuthError) {
      res.status(e.status).json({ error: e.code, error_description: e.message })
      return
    }
    logger.error('MCP: błąd', e)
    res.status(500).json({ error: 'server_error' })
  }
})

async function approved(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  return { uid, name: String(me.get('username') ?? me.get('displayName') ?? ''), isAdmin: me.get('role') === 'admin' }
}

const asHttps = (e: unknown) =>
  e instanceof OAuthError ? new HttpsError(e.code === 'not_found' ? 'not-found' : 'failed-precondition', e.message) : e

/** Ekran zgody w aplikacji: info o kliencie, zatwierdzenie albo odmowa (zwraca adres powrotu do klienta). */
export const mcpAuthorize = onCall(async (req) => {
  const user = await approved(req.auth?.uid)
  try {
    return await decideAuthorization(user, req.data?.id, req.data?.action)
  } catch (e) {
    throw asHttps(e)
  }
})

/** Ustawienia: lista połączonych aplikacji (Claude, ChatGPT…) i odłączanie. */
export const mcpConnections = onCall(async (req) => {
  const user = await approved(req.auth?.uid)
  try {
    if (req.data?.action === 'revoke') {
      await revokeConnection(user.uid, req.data?.id)
      return { ok: true }
    }
    return { connections: await listConnections(user.uid) }
  } catch (e) {
    throw asHttps(e)
  }
})
