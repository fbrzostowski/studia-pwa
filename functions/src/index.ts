import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineString } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { addTextbookFromUpload, deleteTextbook, ensureSubjectFolder, runSync } from './driveSync.js'

initializeApp()

const DRIVE_FOLDER_ID = defineString('DRIVE_FOLDER_ID', {
  description: 'ID folderu z podręcznikami na Google Drive (udostępnionego kontu technicznemu)',
})
const DRIVE_SYNC_SERVICE_ACCOUNT = defineString('DRIVE_SYNC_SERVICE_ACCOUNT', {
  default: 'drive-sync@studia-pwa.iam.gserviceaccount.com',
  description: 'Konto techniczne, któremu udostępniono folder (Przeglądający)',
})

// Jedna instancja naraz: dwie równoległe synchronizacje nie powinny się ścigać.
setGlobalOptions({
  region: 'europe-west1',
  serviceAccount: DRIVE_SYNC_SERVICE_ACCOUNT,
  memory: '512MiB',
  timeoutSeconds: 540,
  maxInstances: 1,
})

/** Przycisk „Synchronizuj” w aplikacji — tylko dla zatwierdzonego admina. */
export const syncTextbooks = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${req.auth.uid}`).get()
  if (me.get('role') !== 'admin' || me.get('status') !== 'approved') {
    throw new HttpsError('permission-denied', 'Synchronizację uruchamia tylko administrator.')
  }
  try {
    return await runSync(DRIVE_FOLDER_ID.value(), { trigger: 'manual', by: req.auth.uid })
  } catch (e) {
    throw new HttpsError('internal', e instanceof Error ? e.message : String(e))
  }
})

/** Folder przedmiotu na Drive — dla każdego zatwierdzonego użytkownika (zakłada też brakujący folder). */
export const createSubjectFolder = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${req.auth.uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  try {
    return await ensureSubjectFolder(DRIVE_FOLDER_ID.value(), req.data?.name, req.auth.uid)
  } catch (e) {
    throw new HttpsError('failed-precondition', e instanceof Error ? e.message : String(e))
  }
})

/** Dodanie podręcznika z pliku wgranego w aplikacji (wszyscy zatwierdzeni; nikt nie ma dostępu do Drive). */
export const addTextbook = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${req.auth.uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  const name = String(me.get('username') ?? me.get('displayName') ?? '')
  try {
    return await addTextbookFromUpload(DRIVE_FOLDER_ID.value(), req.auth.uid, name, req.data ?? {})
  } catch (e) {
    throw new HttpsError('failed-precondition', e instanceof Error ? e.message : String(e))
  }
})

/** Usunięcie podręcznika przez autora wgrania lub admina. */
export const removeTextbook = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${req.auth.uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  await deleteTextbook(req.data?.id, req.auth.uid, me.get('role') === 'admin')
  return { ok: true }
})

/** Codzienna synchronizacja w nocy. */
export const syncTextbooksDaily = onSchedule({ schedule: 'every day 04:00', timeZone: 'Europe/Warsaw' }, async () => {
  await runSync(DRIVE_FOLDER_ID.value(), { trigger: 'schedule' })
})
