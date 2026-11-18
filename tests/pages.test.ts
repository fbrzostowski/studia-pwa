import { describe, expect, it } from 'vitest'
import { clearCookie, pageParam, pagePath, parsePagePath, readCookie, sessionCookie } from '../functions/src/pagesLogic'
import { pageFromUrl, pageUrl } from '../src/features/textbooks/htmlTab'

describe('stałe linki stron HTML', () => {
  it('ścieżka /p/kind/ID w obie strony, tylko poprawne ID', () => {
    const s = { kind: 'textbook' as const, id: 'abcDEF1234567' }
    expect(parsePagePath(pagePath(s))).toEqual(s)
    expect(parsePagePath('/p/material/abcDEF1234567/')).toEqual({ kind: 'material', id: 'abcDEF1234567' })
    for (const p of ['/p/textbook/short', '/p/user/abcDEF1234567', '/p/textbook/abc..DEF1234567', '/p/textbook/abcDEF1234567/x', '//evil.com/p/textbook/abcDEF1234567', 'https://evil.com/p/textbook/abcDEF1234567'])
      expect(parsePagePath(p), p).toBeNull()
  })
  it('aplikacja i funkcja mówią tym samym językiem (?page=, adres karty)', () => {
    const s = { kind: 'material' as const, id: 'abcDEF1234567' }
    expect(pageFromUrl(`?page=${encodeURIComponent(pageParam(s))}`)).toEqual(s)
    expect(pageFromUrl('?page=textbook:x')).toBeNull()
    expect(pageUrl(s)).toBe('https://studia-pwa.web.app' + pagePath(s))
  })
})

describe('ciasteczko sesji', () => {
  it('odczyt z nagłówka Cookie', () => {
    expect(readCookie('a=1; __session=x%3Dy; b=2')).toBe('x=y')
    expect(readCookie('a=1')).toBeNull()
    expect(readCookie(undefined)).toBeNull()
    expect(readCookie('__session=')).toBeNull()
  })
  it('HttpOnly, Secure, tylko pod /p, 14 dni; czyszczenie zeruje', () => {
    const c = sessionCookie('tok')
    expect(c).toMatch(/^__session=tok;/)
    for (const part of ['HttpOnly', 'Secure', 'Path=/p;', 'SameSite=Lax', `Max-Age=${14 * 24 * 3600};`]) expect(c).toContain(part)
    expect(clearCookie()).toContain('Max-Age=0')
  })
})
