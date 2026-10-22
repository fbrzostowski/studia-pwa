import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { defineString } from 'firebase-functions/params'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { runSync } from './driveSync.js'

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

/** Codzienna synchronizacja w nocy. */
export const syncTextbooksDaily = onSchedule({ schedule: 'every day 04:00', timeZone: 'Europe/Warsaw' }, async () => {
  await runSync(DRIVE_FOLDER_ID.value(), { trigger: 'schedule' })
})
