import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { mergeSubjects as runMerge } from './mergeSubjectsOps.js'
import { addTextbookFromUpload, deleteSubjectFolder, deleteTextbook, ensureSubjectFolder } from './textbookOps.js'

initializeApp()

// Funkcje działają jako konto techniczne (role: Firestore i Storage w tym projekcie), bez pliku z kluczem.
setGlobalOptions({
  region: 'europe-west1',
  serviceAccount: 'drive-sync@studia-pwa.iam.gserviceaccount.com',
  memory: '512MiB',
  timeoutSeconds: 120,
  maxInstances: 3,
})

/** Zalogowany, zatwierdzony użytkownik (profil w Firestore); inaczej błąd dla klienta. */
async function approvedUser(uid: string | undefined) {
  if (!uid) throw new HttpsError('unauthenticated', 'Zaloguj się.')
  const me = await getFirestore().doc(`users/${uid}`).get()
  if (me.get('status') !== 'approved') throw new HttpsError('permission-denied', 'Konto nie jest zatwierdzone.')
  return me
}

const failed = (e: unknown) => new HttpsError('failed-precondition', e instanceof Error ? e.message : String(e))

/** Folder przedmiotu w podręcznikach (zakłada go, jeśli brakuje). */
export const createSubjectFolder = onCall(async (req) => {
  await approvedUser(req.auth?.uid)
  try {
    return await ensureSubjectFolder(req.data?.name, req.auth!.uid)
  } catch (e) {
    throw failed(e)
  }
})

/** Dodanie podręcznika z pliku wgranego w aplikacji (wszyscy zatwierdzeni). */
export const addTextbook = onCall(async (req) => {
  const me = await approvedUser(req.auth?.uid)
  const name = String(me.get('username') ?? me.get('displayName') ?? '')
  try {
    return await addTextbookFromUpload(req.auth!.uid, name, req.data ?? {})
  } catch (e) {
    throw failed(e)
  }
})

/** Usunięcie podręcznika przez autora wgrania lub admina. */
export const removeTextbook = onCall(async (req) => {
  const me = await approvedUser(req.auth?.uid)
  await deleteTextbook(req.data?.id, req.auth!.uid, me.get('role') === 'admin')
  return { ok: true }
})

/** Usunięcie pustego folderu przedmiotu w podręcznikach przez autora folderu lub admina. */
export const removeTextbookFolder = onCall(async (req) => {
  const me = await approvedUser(req.auth?.uid)
  await deleteSubjectFolder(req.data?.id, req.auth!.uid, me.get('role') === 'admin')
  return { ok: true }
})

/**
 * Połączenie dwóch przedmiotów (zdublowanych): przenosi do docelowego wszystko, co dotyczy źródłowego, i usuwa je.
 * Robi to serwer, bo dotyczy wpisów wielu osób, których klient nie może zmieniać. Autor źródła lub admin.
 */
export const mergeSubjects = onCall(async (req) => {
  const me = await approvedUser(req.auth?.uid)
  try {
    return await runMerge(req.auth!.uid, me.get('role') === 'admin', req.data ?? {})
  } catch (e) {
    throw failed(e)
  }
})
