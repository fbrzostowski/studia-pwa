import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { HttpsError } from 'firebase-functions/v2/https'
import { STORAGE_BUCKET } from './config.js'
import { fileNameFor, findByName, folderPath, storagePathFor, titleOf, validFolderName } from './textbooks.js'
import { isOwnUpload, MAX_UPLOAD_BYTES, mimeFor, originalName } from './uploads.js'

const bucket = () => getStorage().bucket(STORAGE_BUCKET)

async function listFolders() {
  const snap = await getFirestore().collection('textbookFolders').get()
  return snap.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? '') }))
}

/** Folder przedmiotu w podręcznikach (wpis w bazie): zwraca istniejący o tej nazwie albo zakłada nowy. */
export async function ensureSubjectFolder(rawName: unknown, by: string) {
  const name = validFolderName(rawName)
  if (!name) throw new Error('Nieprawidłowa nazwa przedmiotu (1–100 znaków, bez ukośników).')

  const existing = findByName(await listFolders(), name)
  if (existing) return { ...existing, created: false }

  const ref = getFirestore().collection('textbookFolders').doc()
  await ref.set({ name, createdBy: by, createdAt: FieldValue.serverTimestamp() })
  logger.info('Folder przedmiotu', { name })
  return { id: ref.id, name, created: true }
}

/**
 * Dodaje podręcznik z pliku wgranego przez aplikację do katalogu tymczasowego uploads/{uid}/:
 * sprawdza typ i rozmiar, przenosi plik do textbooks/ i rejestruje go w Firestore. Przedmiot musi mieć
 * już folder. Plik tymczasowy znika niezależnie od wyniku.
 */
export async function addTextbookFromUpload(
  uid: string,
  uploaderName: string,
  input: { uploadPath?: unknown; subject?: unknown; subfolder?: unknown; title?: unknown },
) {
  if (!isOwnUpload(input.uploadPath, uid)) throw new Error('Nieprawidłowa ścieżka pliku.')
  const subject = validFolderName(input.subject)
  if (!subject) throw new Error('Wybierz przedmiot.')
  const subfolder = input.subfolder === undefined || input.subfolder === '' ? null : validFolderName(input.subfolder)
  if (input.subfolder !== undefined && input.subfolder !== '' && !subfolder) {
    throw new Error('Nieprawidłowa nazwa podfolderu (1–100 znaków, bez ukośników).')
  }

  const tmp = bucket().file(input.uploadPath)
  try {
    const folder = findByName(await listFolders(), subject)
    if (!folder) throw new Error('Ten przedmiot nie ma jeszcze folderu — utwórz go przyciskiem „+ Przedmiot”.')

    const [exists] = await tmp.exists()
    if (!exists) throw new Error('Nie znaleziono wgranego pliku — spróbuj ponownie.')
    const [meta] = await tmp.getMetadata()
    const size = Number(meta.size ?? 0)
    const name = fileNameFor(originalName(input.uploadPath))
    const mime = mimeFor(name)
    if (!mime) throw new Error('Ten typ pliku nie jest obsługiwany.')
    if (size === 0) throw new Error('Plik jest pusty.')
    if (size >= MAX_UPLOAD_BYTES) throw new Error('Plik jest za duży (limit 100 MB).')

    const path = folderPath(folder.name, subfolder)
    const db = getFirestore()
    const dup = await db.collection('textbooks').where('folder', '==', path).where('fileName', '==', name).limit(1).get()
    if (!dup.empty) throw new Error(`Plik „${name}” już jest w tym folderze.`)

    const ref = db.collection('textbooks').doc()
    const finalPath = storagePathFor(ref.id, name)
    await tmp.move(bucket().file(finalPath))
    try {
      const title =
        typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 150) : titleOf(name)
      await ref.set({
        title,
        fileName: name,
        mimeType: mime,
        size,
        folder: path,
        storagePath: finalPath,
        addedBy: 'upload',
        uploadedBy: uid,
        uploadedByName: uploaderName.slice(0, 60),
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (e) {
      await bucket().file(finalPath).delete({ ignoreNotFound: true }).catch(() => {}) // bez osieroconego pliku
      throw e
    }
    logger.info('Dodano podręcznik', { name, path, size })
    return { id: ref.id, title: titleOf(name), folder: path }
  } finally {
    await tmp.delete({ ignoreNotFound: true }).catch(() => {})
  }
}

/** Usuwa podręcznik: plik w Storage i wpis w Firestore. Może autor wgrania albo admin. */
export async function deleteTextbook(id: unknown, uid: string, isAdmin: boolean) {
  if (typeof id !== 'string' || !id) throw new HttpsError('invalid-argument', 'Brak identyfikatora podręcznika.')
  const ref = getFirestore().doc(`textbooks/${id}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'Nie ma takiego podręcznika.')
  if (!isAdmin && snap.get('uploadedBy') !== uid) {
    throw new HttpsError('permission-denied', 'Usunąć może tylko autor wgrania albo administrator.')
  }
  const path = snap.get('storagePath')
  if (typeof path === 'string' && path) await bucket().file(path).delete({ ignoreNotFound: true }).catch(() => {})
  await ref.delete()
  logger.info('Usunięto podręcznik', { id })
}
