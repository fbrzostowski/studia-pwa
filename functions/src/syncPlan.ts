// Czysta logika synchronizacji Drive → Storage/Firestore (bez wywołań API), testowana osobno.

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: number // brak dla plików Google (Dokumenty, Prezentacje…)
  modifiedTime: string
  folder: string // ścieżka podfolderu względem folderu głównego, '' = główny
}

export interface ExistingBook {
  id: string // = id pliku na Drive
  driveModifiedTime: string
  storagePath: string
}

export interface Skipped {
  name: string
  reason: string
}

export const MAX_BYTES = 100 * 1024 * 1024
export const FOLDER_MIME = 'application/vnd.google-apps.folder'

// Pliki Google nie mają treści do pobrania — eksportujemy je do PDF.
const EXPORT_AS_PDF = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
])

export const isGoogleNative = (mime: string) => mime.startsWith('application/vnd.google-apps.')
export const exportsToPdf = (mime: string) => EXPORT_AS_PDF.has(mime)

/** Nazwa pliku w Storage: bez znaków specjalnych; eksportowane pliki Google dostają .pdf. */
export function fileNameFor(f: Pick<DriveFile, 'name' | 'mimeType'>) {
  const base = f.name.replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim() || 'plik'
  return exportsToPdf(f.mimeType) && !base.toLowerCase().endsWith('.pdf') ? `${base}.pdf` : base
}

export const storagePathFor = (f: Pick<DriveFile, 'id' | 'name' | 'mimeType'>) => `textbooks/${f.id}/${fileNameFor(f)}`

/** Tytuł do wyświetlenia: nazwa bez rozszerzenia (pliki Google nie mają rozszerzenia). */
export function titleOf(f: Pick<DriveFile, 'name' | 'mimeType'>) {
  return isGoogleNative(f.mimeType) ? f.name : f.name.replace(/\.[^./\\]{1,5}$/, '')
}

/**
 * Co zrobić w tej synchronizacji: wgrać nowe i zmienione pliki, usunąć te, których nie ma już
 * w folderze (albo przestały się kwalifikować), pominąć nieobsługiwane i za duże.
 */
export function planSync(drive: DriveFile[], existing: ExistingBook[]) {
  const skipped: Skipped[] = []
  const eligible: DriveFile[] = []

  for (const f of drive) {
    if (f.mimeType === FOLDER_MIME) continue
    if (isGoogleNative(f.mimeType) && !exportsToPdf(f.mimeType)) {
      skipped.push({ name: f.name, reason: 'nieobsługiwany typ pliku Google' })
    } else if ((f.size ?? 0) > MAX_BYTES) {
      skipped.push({ name: f.name, reason: `za duży (limit ${MAX_BYTES / 1024 / 1024} MB)` })
    } else {
      eligible.push(f)
    }
  }

  const byId = new Map(existing.map((b) => [b.id, b]))
  const upload = eligible.filter((f) => byId.get(f.id)?.driveModifiedTime !== f.modifiedTime)
  const keep = new Set(eligible.map((f) => f.id))
  const remove = existing.filter((b) => !keep.has(b.id))

  return { upload, remove, skipped, unchanged: eligible.length - upload.length }
}
