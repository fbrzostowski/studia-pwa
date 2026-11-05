import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { APP_URL, MCP_BASE } from './config.js'
import {
  ACCESS_TTL_S,
  CODE_TTL_S,
  REFRESH_TTL_S,
  REQUEST_TTL_S,
  hashToken,
  pkceOk,
  randomToken,
  redirectWith,
  validRedirectUri,
} from './mcpLogic.js'
import type { McpUser } from './mcpTools.js'

const db = () => getFirestore()
const inSeconds = (s: number) => Timestamp.fromMillis(Date.now() + s * 1000)
const expired = (t: unknown) => !(t instanceof Timestamp) || t.toMillis() < Date.now()
const str = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : '')

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

// --- metadane (RFC 9728 i RFC 8414) ---

export const protectedResourceMetadata = () => ({
  resource: `${MCP_BASE}/mcp`,
  authorization_servers: [MCP_BASE],
  bearer_methods_supported: ['header'],
  scopes_supported: ['mcp'],
})

export const authorizationServerMetadata = () => ({
  issuer: MCP_BASE,
  authorization_endpoint: `${MCP_BASE}/authorize`,
  token_endpoint: `${MCP_BASE}/token`,
  registration_endpoint: `${MCP_BASE}/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['mcp'],
})

export const resourceMetadataUrl = () => `${MCP_BASE}/.well-known/oauth-protected-resource/mcp`

// --- rejestracja klienta (RFC 7591) ---

export async function registerClient(body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
  if (uris.length < 1 || uris.length > 5 || !uris.every(validRedirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris: od 1 do 5 adresów https (albo http://localhost).')
  }
  const name = str(body.client_name, 100).trim() || 'Aplikacja MCP'
  const clientId = randomToken(16)
  await db().doc(`mcpClients/${clientId}`).set({ name, redirectUris: uris, createdAt: FieldValue.serverTimestamp() })
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(Date.now() / 1000),
  }
}

// --- autoryzacja: żądanie czeka, aż użytkownik zatwierdzi je w aplikacji ---

/** Zwraca adres, pod który przekierować przeglądarkę (do aplikacji albo, przy błędzie, z powrotem do klienta). */
export async function startAuthorization(q: Record<string, unknown>) {
  const clientId = str(q.client_id)
  const client = clientId ? await db().doc(`mcpClients/${clientId}`).get() : null
  const redirectUri = str(q.redirect_uri)
  // przy nieznanym kliencie lub adresie nie wolno przekierowywać (to byłby otwarty redirect)
  if (!client?.exists) throw new OAuthError('invalid_client', 'Nieznany klient.')
  const registered = (client.get('redirectUris') as string[]) ?? []
  const target = redirectUri || (registered.length === 1 ? registered[0] : '')
  if (!target || !registered.includes(target)) throw new OAuthError('invalid_request', 'Nieprawidłowy redirect_uri.')

  const state = str(q.state, 2000) || undefined
  const fail = (error: string, description: string) =>
    redirectWith(target, { error, error_description: description, state })
  if (q.response_type !== 'code') return fail('unsupported_response_type', 'Obsługiwany jest tylko response_type=code.')
  if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(str(q.code_challenge))) {
    return fail('invalid_request', 'Wymagany jest PKCE (code_challenge_method=S256).')
  }

  const id = randomToken(24)
  await db().doc(`mcpAuthRequests/${id}`).set({
    clientId,
    redirectUri: target,
    state: state ?? null,
    codeChallenge: q.code_challenge,
    expiresAt: inSeconds(REQUEST_TTL_S),
  })
  return `${APP_URL}/?mcp_authorize=${encodeURIComponent(id)}`
}

/** Dla ekranu zgody w aplikacji: kto prosi o dostęp (info) oraz zatwierdzenie albo odmowa. */
export async function decideAuthorization(user: McpUser, id: unknown, action: unknown) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw new OAuthError('invalid_request', 'Nieprawidłowe żądanie.')
  const ref = db().doc(`mcpAuthRequests/${id}`)
  const snap = await ref.get()
  if (!snap.exists || expired(snap.get('expiresAt'))) {
    throw new OAuthError('expired', 'To żądanie wygasło. Wróć do Claude lub ChatGPT i spróbuj połączyć jeszcze raz.')
  }
  const client = await db().doc(`mcpClients/${snap.get('clientId')}`).get()
  const redirectUri = String(snap.get('redirectUri'))
  const state: string | undefined = snap.get('state') ?? undefined

  if (action === 'info') {
    return { clientName: String(client.get('name') ?? 'Aplikacja MCP'), redirectHost: new URL(redirectUri).host }
  }
  if (action === 'deny') {
    await ref.delete()
    return { redirect: redirectWith(redirectUri, { error: 'access_denied', state }) }
  }
  if (action !== 'approve') throw new OAuthError('invalid_request', 'Nieznana akcja.')

  const code = randomToken(32)
  await db().doc(`mcpCodes/${hashToken(code)}`).set({
    uid: user.uid,
    clientId: snap.get('clientId'),
    redirectUri,
    codeChallenge: snap.get('codeChallenge'),
    expiresAt: inSeconds(CODE_TTL_S),
  })
  await ref.delete()
  logger.info('MCP: zatwierdzono dostęp', { uid: user.uid })
  return { redirect: redirectWith(redirectUri, { code, state }) }
}

// --- tokeny ---

async function issue(grantId: string, uid: string) {
  const access = randomToken(32)
  const refresh = randomToken(32)
  await db().doc(`mcpTokens/${hashToken(access)}`).set({ uid, grantId, expiresAt: inSeconds(ACCESS_TTL_S) })
  await db().doc(`mcpGrants/${grantId}`).update({ refreshHash: hashToken(refresh), refreshExpiresAt: inSeconds(REFRESH_TTL_S) })
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: 'mcp' }
}

export async function exchangeToken(body: Record<string, unknown>) {
  const clientId = str(body.client_id)
  const grantType = body.grant_type

  if (grantType === 'authorization_code') {
    const codeRef = db().doc(`mcpCodes/${hashToken(str(body.code, 200) || '-')}`)
    // kod jest jednorazowy: sprawdzenie i usunięcie w jednej transakcji
    const code = await db().runTransaction(async (tx) => {
      const snap = await tx.get(codeRef)
      if (!snap.exists) return null
      tx.delete(codeRef)
      return snap.data()!
    })
    if (!code || expired(code.expiresAt) || code.clientId !== clientId || code.redirectUri !== str(body.redirect_uri) || !pkceOk(body.code_verifier, code.codeChallenge)) {
      throw new OAuthError('invalid_grant', 'Nieprawidłowy lub wygasły kod autoryzacji.')
    }
    const client = await db().doc(`mcpClients/${clientId}`).get()
    const grantRef = db().collection('mcpGrants').doc()
    await grantRef.set({
      uid: code.uid,
      clientId,
      clientName: String(client.get('name') ?? 'Aplikacja MCP'),
      refreshHash: '',
      createdAt: FieldValue.serverTimestamp(),
    })
    return issue(grantRef.id, code.uid as string)
  }

  if (grantType === 'refresh_token') {
    const found = await db().collection('mcpGrants').where('refreshHash', '==', hashToken(str(body.refresh_token, 200) || '-')).limit(1).get()
    const grant = found.docs[0]
    if (!grant || grant.get('clientId') !== clientId || expired(grant.get('refreshExpiresAt'))) {
      throw new OAuthError('invalid_grant', 'Nieprawidłowy lub wygasły refresh_token. Połącz aplikację ponownie.')
    }
    return issue(grant.id, grant.get('uid') as string) // rotacja: stary refresh_token przestaje działać
  }
  throw new OAuthError('unsupported_grant_type', 'Obsługiwane: authorization_code i refresh_token.')
}

const TOUCH_EVERY_MS = 10 * 60_000

/** Użytkownik z tokenu dostępu albo null (nieznany, wygasły, unieważniony lub konto niezatwierdzone). */
export async function authenticate(token: string): Promise<McpUser | null> {
  const ref = db().doc(`mcpTokens/${hashToken(token)}`)
  const t = await ref.get()
  if (!t.exists) return null
  if (expired(t.get('expiresAt'))) {
    void ref.delete().catch(() => {})
    return null
  }
  const uid = String(t.get('uid'))
  const me = await db().doc(`users/${uid}`).get()
  if (me.get('status') !== 'approved') return null
  const touched = (t.get('touchedAt') as Timestamp | undefined)?.toMillis() ?? 0
  if (Date.now() - touched > TOUCH_EVERY_MS) {
    void ref.update({ touchedAt: FieldValue.serverTimestamp() }).catch(() => {})
    void db().doc(`mcpGrants/${t.get('grantId')}`).update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})
  }
  return { uid, name: String(me.get('username') ?? me.get('displayName') ?? ''), isAdmin: me.get('role') === 'admin' }
}

// --- połączone aplikacje (Ustawienia) ---

export async function listConnections(uid: string) {
  const snap = await db().collection('mcpGrants').where('uid', '==', uid).get()
  return snap.docs
    .map((d) => ({
      id: d.id,
      name: String(d.get('clientName') ?? ''),
      createdAt: (d.get('createdAt') as Timestamp | undefined)?.toMillis() ?? null,
      lastUsedAt: (d.get('lastUsedAt') as Timestamp | undefined)?.toMillis() ?? null,
    }))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/** Odłącza aplikację: usuwa jej uprawnienie i wszystkie wydane tokeny. */
export async function revokeConnection(uid: string, id: unknown) {
  if (typeof id !== 'string' || !id || id.includes('/')) throw new OAuthError('invalid_request', 'Nieprawidłowe żądanie.')
  const ref = db().doc(`mcpGrants/${id}`)
  const g = await ref.get()
  if (!g.exists || g.get('uid') !== uid) throw new OAuthError('not_found', 'Nie ma takiego połączenia.', 404)
  const tokens = await db().collection('mcpTokens').where('grantId', '==', id).get()
  await Promise.all([ref.delete(), ...tokens.docs.map((d) => d.ref.delete())])
}
