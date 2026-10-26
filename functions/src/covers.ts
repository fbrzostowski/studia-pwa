// Okładka podręcznika to miniatura JPEG zapisana w dokumencie jako data URL.
// UWAGA: stałe muszą być takie same jak w src/features/textbooks/cover.ts (pilnuje tego tests/covers.test.ts).

export const MAX_COVER_CHARS = 90_000
export const COVER_PREFIX = 'data:image/jpeg;base64,'

/**
 * '' = brak okładki, tekst = poprawna okładka, null = niepoprawna (zły typ, za duża, nie JPEG).
 * Sprawdzamy prefiks, długość, alfabet base64 i sygnaturę JPEG (FF D8 FF), żeby nie zapisać w bazie czegoś innego.
 */
export function validCover(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string' || !value.startsWith(COVER_PREFIX) || value.length > MAX_COVER_CHARS) return null
  const b64 = value.slice(COVER_PREFIX.length)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null
  const head = Buffer.from(b64.slice(0, 8), 'base64')
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? value : null
}
