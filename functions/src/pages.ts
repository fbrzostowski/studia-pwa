import './options.js'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { onRequest } from 'firebase-functions/v2/https'
import type { Response } from 'express'
import { APP_URL, STORAGE_BUCKET } from './config.js'
import {
  LOGIN_ORIGINS,
  SESSION_MS,
  clearCookie,
  pageParam,
  pagePath,
  parsePagePath,
  readCookie,
  sessionCookie,
  type PageSpec,
} from './pagesLogic.js'
import { mimeFor } from './uploads.js'

const base = (m: string) => m.split(';')[0]!.trim().toLowerCase()

const message = (res: Response, status: number, text: string) =>
  res
    .status(status)
    .type('html')
    .send(
      `<!doctype html><html lang="pl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Podręcznik</title><body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;color:#555;padding:16px;text-align:center">` +
        `<p>${text}</p></body></html>`,
    )

/** Do aplikacji po (nową) sesję: zalogowany użytkownik od razu wraca na ten sam adres, patrz src/features/textbooks/PageHandoff.tsx. */
const toApp = (res: Response, spec: PageSpec) => {
  res.set('Set-Cookie', clearCookie())
  res.redirect(302, `${APP_URL}/?page=${encodeURIComponent(pageParam(spec))}`)
}

async function approved(uid: string) {
  return (await getFirestore().doc(`users/${uid}`).get()).get('status') === 'approved'
}

/**
 * Stałe linki do stron HTML z podręczników i materiałów: `studia-pwa.web.app/p/textbook/ID` (Firebase Hosting → ta funkcja).
 *
 * Strona działa na osobnym origin niż aplikacja, więc jej skrypty mają własne, trwałe localStorage (zapis postępu), a nie
 * dostają loginu ani danych aplikacji. Dostęp: ciasteczko sesji Firebase (HttpOnly, tylko pod /p), wystawiane przez
 * POST /p/login z tokenem z aplikacji. Bez ważnej sesji funkcja odsyła do aplikacji (logowanie), a ta od razu z powrotem,
 * więc po restarcie przeglądarki przywrócone karty otwierają się same, a obcy bez konta podręcznika nie zobaczy.
 */
export const pages = onRequest({ invoker: 'public', cors: false }, async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie' })
  try {
    if (req.path === '/p/login' || req.path === '/p/login/') {
      if (req.method !== 'POST') return void message(res, 405, 'Otwórz podręcznik z aplikacji LOM.SGH.')
      // tylko formularz z aplikacji (nikt obcy nie zaloguje Cię tu na swoje konto)
      if (!LOGIN_ORIGINS.includes(String(req.get('origin') ?? ''))) return void message(res, 403, 'Otwórz podręcznik z aplikacji LOM.SGH.')
      const body = (req.body ?? {}) as Record<string, unknown>
      const spec = parsePagePath(String(body.next ?? ''))
      const idToken = String(body.idToken ?? '')
      if (!spec || !idToken) return void message(res, 400, 'Nieprawidłowy link do podręcznika.')
      const token = await getAuth().verifyIdToken(idToken, true)
      if (!(await approved(token.uid))) return void message(res, 403, 'Twoje konto nie jest zatwierdzone.')
      const session = await getAuth().createSessionCookie(idToken, { expiresIn: SESSION_MS })
      res.set('Set-Cookie', sessionCookie(session))
      return void res.redirect(303, pagePath(spec))
    }

    const spec = parsePagePath(req.path)
    if (!spec) return void message(res, 404, 'Nie ma takiej strony.')
    if (req.method !== 'GET' && req.method !== 'HEAD') return void message(res, 405, 'Nieobsługiwana metoda.')

    const cookie = readCookie(req.get('cookie'))
    if (!cookie) return toApp(res, spec)
    let uid: string
    try {
      uid = (await getAuth().verifySessionCookie(cookie, true)).uid
    } catch {
      return toApp(res, spec) // wygasła albo cofnięta (np. po wylogowaniu wszędzie)
    }
    if (!(await approved(uid))) return void message(res, 403, 'Twoje konto nie jest zatwierdzone.')

    const snap = await getFirestore().doc(`${spec.kind === 'textbook' ? 'textbooks' : 'materials'}/${spec.id}`).get()
    const path = snap.get('storagePath')
    if (!snap.exists || typeof path !== 'string' || !path) return void message(res, 404, 'Nie ma takiego pliku. Mógł zostać usunięty.')
    const mime = spec.kind === 'textbook' ? String(snap.get('mimeType') ?? '') : (mimeFor(String(snap.get('fileName') ?? '')) ?? '')
    // tylko strony HTML; PDF-y i resztę pokazuje aplikacja
    if (base(mime) !== 'text/html') return void res.redirect(302, `${APP_URL}/?open=${encodeURIComponent(pageParam(spec))}`)

    const [html] = await getStorage().bucket(STORAGE_BUCKET).file(path).download()
    res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "frame-ancestors 'none'" })
    res.send(req.method === 'HEAD' ? '' : html)
  } catch (e) {
    logger.error('pages', e)
    message(res, 500, 'Nie udało się otworzyć podręcznika. Odśwież stronę za chwilę.')
  }
})
