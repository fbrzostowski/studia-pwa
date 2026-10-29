// Dozwolone pliki podręczników wgrywane przez aplikację. UWAGA: ta lista musi być taka sama jak
// w src/features/textbooks/upload.ts (pilnuje tego tests/uploads.test.ts).

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
  // strona HTML: aplikacja pokazuje ją w iframe z sandboxem (bez dostępu do aplikacji), patrz HtmlViewer
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}

export const extOf = (name: string) => {
  const m = name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)
  return m ? m[1] : ''
}

/** Typ MIME dla dozwolonego rozszerzenia albo null (nie ufamy typowi zgłoszonemu przez przeglądarkę). */
export const mimeFor = (name: string) => ALLOWED_TYPES[extOf(name)] ?? null

/** Plik tymczasowy w Storage to „{znacznik czasu}-{nazwa}”; zwraca oryginalną nazwę. */
export const originalName = (storagePath: string) => {
  const base = storagePath.split('/').pop() ?? ''
  return base.replace(/^\d+-/, '')
}

/** Ścieżka tymczasowa należy do tego użytkownika i nie wychodzi poza jego katalog. */
export const isOwnUpload = (path: unknown, uid: string): path is string =>
  typeof path === 'string' &&
  path.startsWith(`uploads/${uid}/`) &&
  !path.includes('..') &&
  path.split('/').length === 3
