import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https'
import { hashToken, newToken, tokenFromRequest } from './mcpLogic.js'
import { handleRpc, type RpcMessage } from './mcpProtocol.js'
import { TOOLS, type McpUser } from './mcpTools.js'

const INSTRUCTIONS = [
  'Serwer aplikacji LOM.SGH (plan zajęć, materiały, podręczniki, zaliczenia i listy do nauki grupy studentów SGH).',
  'Działasz w imieniu jednego użytkownika; dane innych osób widzisz tak jak on w aplikacji.',
  'Daty podawaj jako RRRR-MM-DD. Nazwy przedmiotów sprawdź w list_subjects, jeśli nie jesteś pewien.',
  'Przed dodaniem czegokolwiek (materiał, termin, punkt do nauki) upewnij się, że użytkownik tego chce i ma komplet danych.',
].join(' ')

const LAST_USED_EVERY_MS = 10 * 60_000

async function authenticate(token: string): Promise<McpUser | null> {
  const db = getFirestore()
  const ref = db.doc(`mcpTokens/${hashToken(token)}`)
  const t = await ref.get()
  if (!t.exists) return null
  const uid = String(t.get('uid'))
  const me = await db.doc(`users/${uid}`).get()
  if (me.get('status') !== 'approved') return null
  const last = (t.get('lastUsedAt') as Timestamp | undefined)?.toMillis() ?? 0
  if (Date.now() - last > LAST_USED_EVERY_MS) void ref.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})
  return { uid, name: String(me.get('username') ?? me.get('displayName') ?? ''), isAdmin: me.get('role') === 'admin' }
}

/**
 * Serwer MCP (Streamable HTTP, bezstanowy) dla Claude, ChatGPT i innych klientów. Użytkownik wkleja adres z osobistym
 * kluczem (`…/mcp/{klucz}`) albo podaje klucz w nagłówku `Authorization: Bearer`. Klucz tworzy się w Ustawieniach aplikacji.
 */
export const mcp = onRequest({ invoker: 'public', cors: false, memory: '512MiB' }, async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.set('Allow', 'POST').status(405).json({ error: 'Ten serwer MCP przyjmuje tylko POST.' })
    return
  }
  const token = tokenFromRequest(req.headers, req.path, req.query)
  const user = token ? await authenticate(token) : null
  if (!user) {
    res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Nieprawidłowy lub unieważniony klucz. Utwórz nowy w Ustawieniach aplikacji.' } })
    return
  }

  const body = req.body as RpcMessage | RpcMessage[]
  const info = { name: 'lom-sgh', version: '1.0.0', instructions: INSTRUCTIONS }
  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handleRpc(m, TOOLS, user, info)))).filter((r) => r !== null)
      if (out.length === 0) res.status(202).end()
      else res.json(out)
      return
    }
    const out = await handleRpc(body, TOOLS, user, info)
    if (out === null) res.status(202).end()
    else res.json(out)
  } catch (e) {
    logger.error('MCP: błąd', e)
    res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Błąd serwera.' } })
  }
})

/** Zarządzanie własnym kluczem MCP z Ustawień: status, utworzenie (zastępuje poprzedni) i unieważnienie. */
export const mcpToken = onCall(async (req) => {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const db = getFirestore()
  const me = await db.doc(`users/${uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  const mine = () => db.collection('mcpTokens').where('uid', '==', uid).get()
  const action = req.data?.action

  if (action === 'status') {
    const snap = await mine()
    const d = snap.docs[0]
    return {
      exists: !!d,
      createdAt: (d?.get('createdAt') as Timestamp | undefined)?.toMillis() ?? null,
      lastUsedAt: (d?.get('lastUsedAt') as Timestamp | undefined)?.toMillis() ?? null,
    }
  }
  if (action === 'create') {
    const old = await mine()
    const token = newToken()
    const batch = db.batch()
    for (const d of old.docs) batch.delete(d.ref)
    batch.set(db.doc(`mcpTokens/${hashToken(token)}`), { uid, createdAt: FieldValue.serverTimestamp() })
    await batch.commit()
    return { token }
  }
  if (action === 'revoke') {
    const old = await mine()
    await Promise.all(old.docs.map((d) => d.ref.delete()))
    return { ok: true }
  }
  throw new HttpsError('invalid-argument', 'Nieznana akcja.')
})
