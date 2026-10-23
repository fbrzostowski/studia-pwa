import { pipeline } from 'node:stream/promises'
import { auth, drive as driveApi, type drive_v3 } from '@googleapis/drive'
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import {
  FOLDER_MIME,
  exportsToPdf,
  fileNameFor,
  findFolderByName,
  planFolders,
  planSync,
  storagePathFor,
  titleOf,
  validFolderName,
  type DriveFile,
  type DriveFolder,
  type ExistingBook,
  type Skipped,
} from './syncPlan.js'

const MAX_DEPTH = 5

export interface SyncSummary {
  added: number
  updated: number
  removed: number
  unchanged: number
  skipped: Skipped[]
}

// Bez pliku z kluczem: funkcja działa jako konto techniczne (serviceAccount w opcjach),
// a to konto widzi i zmienia tylko folder, który mu udostępniono (rola Edytujący jest potrzebna
// wyłącznie do zakładania folderów przedmiotów; synchronizacja tylko czyta).
function client() {
  const a = new auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive'] })
  return driveApi({ version: 'v3', auth: a })
}

async function listFolder(
  drive: drive_v3.Drive,
  folderId: string,
  path = '',
  depth = 0,
  topFolders: DriveFolder[] = [],
): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType || !f.modifiedTime) continue
      if (f.mimeType === FOLDER_MIME) {
        // foldery najwyższego poziomu to przedmioty (także puste — trafiają do rejestru folderów)
        if (depth === 0) topFolders.push({ id: f.id, name: f.name })
        // podfoldery stają się grupami w aplikacji (np. „Mikroekonomia / Ćwiczenia”)
        if (depth < MAX_DEPTH) {
          out.push(...(await listFolder(drive, f.id, path ? `${path} / ${f.name}` : f.name, depth + 1, topFolders)))
        }
        continue
      }
      out.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : undefined,
        modifiedTime: f.modifiedTime,
        folder: path,
      })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

async function copyToStorage(drive: drive_v3.Drive, f: DriveFile) {
  const pdf = exportsToPdf(f.mimeType)
  const contentType = pdf ? 'application/pdf' : f.mimeType
  const src = pdf
    ? await drive.files.export({ fileId: f.id, mimeType: 'application/pdf' }, { responseType: 'stream' })
    : await drive.files.get({ fileId: f.id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' })

  const dest = getStorage().bucket().file(storagePathFor(f))
  await pipeline(src.data, dest.createWriteStream({ resumable: false, contentType }))
  const [meta] = await dest.getMetadata()
  return { contentType, size: Number(meta.size ?? 0) }
}

const deleteFile = (path: string) =>
  getStorage()
    .bucket()
    .file(path)
    .delete({ ignoreNotFound: true })

export async function runSync(folderId: string, ctx: { trigger: 'manual' | 'schedule'; by?: string }) {
  if (!folderId) throw new Error('Brak DRIVE_FOLDER_ID w konfiguracji funkcji.')
  const db = getFirestore()
  const drive = client()

  const topFolders: DriveFolder[] = []
  const files = await listFolder(drive, folderId, '', 0, topFolders)
  const snap = await db.collection('textbooks').get()
  const existing: ExistingBook[] = snap.docs.map((d: QueryDocumentSnapshot) => ({
    id: d.id,
    driveModifiedTime: d.get('driveModifiedTime') ?? '',
    storagePath: d.get('storagePath') ?? '',
  }))
  const { upload, remove, skipped, unchanged } = planSync(files, existing)
  const known = new Map(existing.map((b) => [b.id, b]))
  const summary: SyncSummary = { added: 0, updated: 0, removed: 0, unchanged, skipped: [...skipped] }

  for (const f of upload) {
    try {
      const { contentType, size } = await copyToStorage(drive, f)
      const old = known.get(f.id)
      // po zmianie nazwy pliku na Drive stara kopia ma inną ścieżkę
      if (old?.storagePath && old.storagePath !== storagePathFor(f)) await deleteFile(old.storagePath)
      await db.doc(`textbooks/${f.id}`).set({
        title: titleOf(f),
        fileName: fileNameFor(f),
        mimeType: contentType,
        size,
        folder: f.folder,
        storagePath: storagePathFor(f),
        driveFileId: f.id,
        driveModifiedTime: f.modifiedTime,
        lastSyncedAt: FieldValue.serverTimestamp(),
        addedBy: 'drive-sync',
      })
      if (old) summary.updated++
      else summary.added++
    } catch (e) {
      logger.error('Nie udało się skopiować pliku', { file: f.name, error: String(e) })
      summary.skipped.push({ name: f.name, reason: 'błąd kopiowania' })
    }
  }

  for (const b of remove) {
    await deleteFile(b.storagePath)
    await db.doc(`textbooks/${b.id}`).delete()
    summary.removed++
  }

  // Rejestr folderów: aplikacja po nim wie, które przedmioty mają już swój folder (także pusty).
  const regSnap = await db.collection('textbookFolders').get()
  const reg = planFolders(topFolders, regSnap.docs.map((d: QueryDocumentSnapshot) => d.id))
  for (const f of reg.upsert) {
    await db.doc(`textbookFolders/${f.id}`).set({ name: f.name, lastSeenAt: FieldValue.serverTimestamp() }, { merge: true })
  }
  for (const id of reg.remove) await db.doc(`textbookFolders/${id}`).delete()

  await db.doc('meta/textbooksSync').set({
    ...summary,
    trigger: ctx.trigger,
    by: ctx.by ?? null,
    lastRunAt: FieldValue.serverTimestamp(),
  })
  logger.info('Synchronizacja podręczników zakończona', summary)
  return summary
}

/**
 * Zakłada folder przedmiotu w folderze głównym (lub zwraca istniejący o tej samej nazwie).
 * Wymaga, żeby konto drive-sync miało na folderze głównym rolę Edytujący.
 */
export async function ensureSubjectFolder(rootId: string, rawName: unknown, by: string) {
  if (!rootId) throw new Error('Brak DRIVE_FOLDER_ID w konfiguracji funkcji.')
  const name = validFolderName(rawName)
  if (!name) throw new Error('Nieprawidłowa nazwa przedmiotu (1–100 znaków, bez ukośników).')

  const drive = client()
  const existing: DriveFolder[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) if (f.id && f.name) existing.push({ id: f.id, name: f.name })
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  let folder = findFolderByName(existing, name)
  let created = false
  if (!folder) {
    try {
      const res = await drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME, parents: [rootId] },
        fields: 'id, name',
        supportsAllDrives: true,
      })
      if (!res.data.id) throw new Error('Drive nie zwrócił identyfikatora folderu.')
      folder = { id: res.data.id, name: res.data.name ?? name }
      created = true
    } catch (e) {
      const code = (e as { code?: number }).code
      if (code === 403 || code === 404) {
        throw new Error(
          'Konto drive-sync nie może zakładać folderów. Na folderze głównym w Google Drive zmień mu rolę na „Edytujący”.',
        )
      }
      throw e
    }
  }

  await getFirestore()
    .doc(`textbookFolders/${folder.id}`)
    .set(
      { name: folder.name, lastSeenAt: FieldValue.serverTimestamp(), ...(created ? { createdBy: by } : {}) },
      { merge: true },
    )
  logger.info('Folder przedmiotu', { name: folder.name, created })
  return { id: folder.id, name: folder.name, created }
}
