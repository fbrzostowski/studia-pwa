/** Czysta logika stałych linków do stron HTML (bez Firebase), testowana w tests/pages.test.ts. */

export type PageKind = 'textbook' | 'material'
export type PageSpec = { kind: PageKind; id: string }

/** Nazwa ciasteczka: Firebase Hosting przekazuje do funkcji tylko `__session`, resztę wycina. */
export const COOKIE = '__session'
/** Ciasteczko działa tylko pod /p, więc nie trafia do /mcp ani do OAuth na tym samym adresie. */
export const COOKIE_PATH = '/p'
/** Najdłuższa sesja, jaką pozwala wystawić Firebase Auth (14 dni). Po wygaśnięciu aplikacja odnawia ją sama. */
export const SESSION_MS = 14 * 24 * 60 * 60 * 1000

/** Strony, z których wolno wysłać formularz logowania (aplikacja na produkcji, stary adres i lokalny serwer). */
export const LOGIN_ORIGINS = ['https://app.lomiankowe-sgh.pl', 'https://fbrzostowski.github.io', 'http://localhost:5173']

const ID = /^[A-Za-z0-9]{10,40}$/

/** `/p/textbook/ID` albo `/p/material/ID` → spec, inaczej null (to samo ID co w linkach `?open=`). */
export function parsePagePath(path: string): PageSpec | null {
  const m = path.match(/^\/p\/(textbook|material)\/([^/]+)\/?$/)
  return m && ID.test(m[2]!) ? { kind: m[1] as PageKind, id: m[2]! } : null
}

export const pagePath = (s: PageSpec) => `/p/${s.kind}/${s.id}`

/** Parametr `?page=textbook:ID` w aplikacji (dokąd wraca po odnowieniu sesji). */
export const pageParam = (s: PageSpec) => `${s.kind}:${s.id}`

/** Wartość ciasteczka z nagłówka Cookie. */
export function readCookie(header: string | undefined, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim()
      return v ? decodeURIComponent(v) : null
    }
  }
  return null
}

/** Nagłówek Set-Cookie sesji: niewidoczny dla skryptów strony (HttpOnly), tylko HTTPS, tylko pod /p. */
export function sessionCookie(value: string, maxAgeMs = SESSION_MS) {
  return `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(maxAgeMs / 1000)}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`
}

export const clearCookie = () => `${COOKIE}=; Max-Age=0; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax`
