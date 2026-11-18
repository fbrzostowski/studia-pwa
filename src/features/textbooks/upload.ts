// Dozwolone pliki podręczników wgrywane przez aplikację. UWAGA: ta lista musi być taka sama jak
// w functions/src/uploads.ts (pilnuje tego tests/uploads.test.ts).

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export const ALLOWED_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  // strona HTML: w ramce z sandboxem albo (gdy korzysta z localStorage) w nowej karcie na osobnym origin, patrz htmlUsesStorage
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

/** Typ MIME z rozszerzenia nazwy pliku (nieznane: ogólny, czyli tylko pobranie). */
export const mimeFor = (name: string) => ALLOWED_TYPES[extOf(name)] ?? 'application/octet-stream'

export const ACCEPT = Object.keys(ALLOWED_TYPES)
  .map((e) => `.${e}`)
  .join(',')

export const extOf = (name: string) => {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)
  return m ? m[1] : ''
}

/** Komunikat błędu dla pliku, który nie nadaje się do wgrania, albo null. */
export function checkFile(file: { name: string; size: number }) {
  if (!ALLOWED_TYPES[extOf(file.name)]) return 'Ten typ pliku nie jest obsługiwany (PDF, Word, PowerPoint, Excel, OpenDocument, TXT, HTML, PNG, JPG).'
  if (file.size === 0) return 'Plik jest pusty.'
  if (file.size >= MAX_UPLOAD_BYTES) return 'Plik jest za duży (limit 100 MB).'
  return null
}

/** Nazwa pliku tymczasowego w Storage: znacznik czasu + nazwa bez znaków specjalnych. */
export const tempName = (name: string, now = Date.now()) => `${now}-${name.replace(/[^\p{L}\p{N}._ -]+/gu, '_')}`

/** Domyślny tytuł z nazwy pliku (bez rozszerzenia). */
export const titleFromFile = (name: string) => name.replace(/\.[^./\\]{1,5}$/, '').trim()

/**
 * Czy strona HTML korzysta z pamięci przeglądarki (localStorage itp., np. zapis postępu). Sprawdzane raz przy dodawaniu
 * pliku i zapisywane w dokumencie jako `usesStorage`. Takie strony otwierają się w nowej karcie (w ramce z sandboxem ta
 * pamięć nie działa), pozostałe w ramce w aplikacji. Widzimy tylko kod w samym pliku, nie skrypty dociągane z sieci.
 * UWAGA: to samo wyrażenie jest w functions/src/uploads.ts i src/features/textbooks/upload.ts (pilnuje tests/uploads.test.ts).
 */
export const STORAGE_API = /\b(?:localStorage|sessionStorage|indexedDB)\b|\bdocument\s*\.\s*cookie\b|\bcaches\s*\.\s*open\b|\bwindow\s*\.\s*claude\b/

export const htmlUsesStorage = (html: string) => STORAGE_API.test(html)
