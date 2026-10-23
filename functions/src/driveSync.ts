import { pipeline } from 'node:stream/promises'
import { auth, drive as driveApi, type drive_v3 } from '@googleapis/drive'
import { FieldValue, getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import { escapeDriveQuery, isOwnUpload, MAX_UPLOAD_BYTES, mimeFor, originalName } from './uploads.js'
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
      }, { merge: true })
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


const NO_PERMISSION =
  'Konto drive-sync nie może zmieniać plików w folderze. Na folderze głównym w Google Drive zmień mu rolę na „Edytujący”.'

/** Znajduje folder o danej nazwie w folderze nadrzędnym albo go zakłada. */
async function ensureChildFolder(drive: drive_v3.Drive, parentId: string, name: string) {
  const existing: DriveFolder[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) if (f.id && f.name) existing.push({ id: f.id, name: f.name })
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  const found = findFolderByName(existing, name)
  if (found) return { ...found, created: false }
  try {
    const res = await drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: 'id, name',
      supportsAllDrives: true,
    })
    if (!res.data.id) throw new Error('Drive nie zwrócił identyfikatora folderu.')
    return { id: res.data.id, name: res.data.name ?? name, created: true }
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 403 || code === 404) throw new Error(NO_PERMISSION)
    throw e
  }
}

/**
 * Zakłada folder przedmiotu w folderze głównym (lub zwraca istniejący o tej samej nazwie).
 * Wymaga, żeby konto drive-sync miało na folderze głównym rolę Edytujący.
 */
export async function ensureSubjectFolder(rootId: string, rawName: unknown, by: string) {
  if (!rootId) throw new Error('Brak DRIVE_FOLDER_ID w konfiguracji funkcji.')
  const name = validFolderName(rawName)
  if (!name) throw new Error('Nieprawidłowa nazwa przedmiotu (1–100 znaków, bez ukośników).')

  const folder = await ensureChildFolder(client(), rootId, name)
  await getFirestore()
    .doc(`textbookFolders/${folder.id}`)
    .set(
      { name: folder.name, lastSeenAt: FieldValue.serverTimestamp(), ...(folder.created ? { createdBy: by } : {}) },
      { merge: true },
    )
  logger.info('Folder przedmiotu', { name: folder.name, created: folder.created })
  return { id: folder.id, name: folder.name, created: folder.created }
}


/**
 * Dodaje podręcznik z pliku wgranego przez aplikację do katalogu tymczasowego uploads/{uid}/:
 * zakłada folder przedmiotu (i opcjonalny podfolder), wysyła plik na Drive, publikuje go w Storage
 * i rejestruje w Firestore. Plik tymczasowy jest usuwany niezależnie od wyniku.
 */
export async function addTextbookFromUpload(
  rootId: string,
  uid: string,
  uploaderName: string,
  input: { uploadPath?: unknown; subject?: unknown; subfolder?: unknown; title?: unknown },
) {
  if (!rootId) throw new Error('Brak DRIVE_FOLDER_ID w konfiguracji funkcji.')
  if (!isOwnUpload(input.uploadPath, uid)) throw new Error('Nieprawidłowa ścieżka pliku.')
  const subject = validFolderName(input.subject)
  if (!subject) throw new Error('Wybierz przedmiot.')
  const subfolder = input.subfolder === undefined || input.subfolder === '' ? null : validFolderName(input.subfolder)
  if (input.subfolder !== undefined && input.subfolder !== '' && !subfolder) {
    throw new Error('Nieprawidłowa nazwa podfolderu (1–100 znaków, bez ukośników).')
  }

  const tmp = getStorage().bucket().file(input.uploadPath)
  try {
    const [exists] = await tmp.exists()
    if (!exists) throw new Error('Nie znaleziono wgranego pliku — spróbuj ponownie.')
    const [meta] = await tmp.getMetadata()
    const size = Number(meta.size ?? 0)
    const name = fileNameFor({ name: originalName(input.uploadPath), mimeType: 'application/octet-stream' })
    const mime = mimeFor(name)
    if (!mime) throw new Error('Ten typ pliku nie jest obsługiwany.')
    if (size === 0) throw new Error('Plik jest pusty.')
    if (size >= MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 100 MB).')

    const drive = client()
    const sf = await ensureSubjectFolder(rootId, subject, uid)
    let parentId = sf.id
    let folderPath = sf.name
    if (subfolder) {
      const sub = await ensureChildFolder(drive, parentId, subfolder)
      parentId = sub.id
      folderPath = `${sf.name} / ${sub.name}`
    }

    const dup = await drive.files.list({
      q: `'${parentId}' in parents and name = '${escapeDriveQuery(name)}' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    if ((dup.data.files ?? []).length > 0) throw new Error(`Plik „${name}” już jest w tym folderze.`)

    let created
    try {
      created = await drive.files.create({
        requestBody: { name, parents: [parentId] },
        media: { mimeType: mime, body: tmp.createReadStream() },
        fields: 'id, name, modifiedTime',
        supportsAllDrives: true,
      })
    } catch (e) {
      const code = (e as { code?: number }).code
      if (code === 403 || code === 404) throw new Error(NO_PERMISSION)
      throw e
    }
    const id = created.data.id
    if (!id || !created.data.modifiedTime) throw new Error('Drive nie zwrócił danych wgranego pliku.')

    const finalPath = storagePathFor({ id, name, mimeType: mime })
    await tmp.copy(getStorage().bucket().file(finalPath))

    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 150) : titleOf({ name, mimeType: mime })
    await getFirestore().doc(`textbooks/${id}`).set({
      title,
      fileName: name,
      mimeType: mime,
      size,
      folder: folderPath,
      storagePath: finalPath,
      driveFileId: id,
      driveModifiedTime: created.data.modifiedTime,
      lastSyncedAt: FieldValue.serverTimestamp(),
      addedBy: 'upload',
      uploadedBy: uid,
      uploadedByName: uploaderName.slice(0, 60),
    })
    logger.info('Dodano podręcznik', { name, folderPath, size })
    return { id, title, folder: folderPath }
  } finally {
    await tmp.delete({ ignoreNotFound: true }).catch(() => {})
  }
}

/** Usuwa podręcznik: plik na Drive trafia do kosza, kopia w Storage i wpis w Firestore są kasowane. */
export async function deleteTextbook(id: unknown, uid: string, isAdmin: boolean) {
  if (typeof id !== 'string' || !id) throw new HttpsError('invalid-argument', 'Brak identyfikatora podręcznika.')
  const ref = getFirestore().doc(`textbooks/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Nie ma takiego podręcznika.')
  if (!isAdmin && snap.get('uploadedBy') !== uid) {
    throw new HttpsError('permission-denied', 'Usunąć może tylko autor wgrania albo administrator.')
  }

  try {
    await client().files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true })
  } catch (e) {
    const code = (e as { code?: number }).code
    if (code === 403) throw new HttpsError('failed-precondition', NO_PERMISSION)
    if (code !== 404) throw e // 404 = pliku już nie ma na Drive, sprzątamy resztę
  }
  const path = snap.get('storagePath')
  if (typeof path === 'string' && path) await getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch(() => {})
  await ref.delete()
  logger.info('Usunięto podręcznik', { id })
}
