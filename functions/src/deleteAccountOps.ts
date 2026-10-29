import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type WriteBatch } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { STORAGE_BUCKET } from './config.js'

export interface AccountCounts {
  memberships: number
  exams: number
  todoLists: number
  files: number // niedokończone wgrania z katalogu tymczasowego
  plan: boolean
}

export interface AccountResult {
  dryRun: boolean
  counts: AccountCounts
}

type Op = (b: WriteBatch) => void

async function applyAll(ops: Op[]) {
  const db = getFirestore()
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 400)) op(batch)
    await batch.commit()
  }
}

/**
 * Usuwa konto użytkownika i jego dane osobiste: plan, uczestnictwa w przedmiotach, listy do nauki, terminy zaliczeń,
 * które dodał, pliki tymczasowe, rezerwację nazwy użytkownika, profil i samo konto logowania.
 * ZOSTAJĄ materiały i podręczniki (z podpisem autora) oraz przedmioty i grupy, bo należą do wspólnych zasobów.
 * Nie usuwa ostatniego administratora. Konto logowania znika przed profilem, więc przerwanie w połowie
 * pozwala powtórzyć operację. Z `dryRun` tylko liczy.
 */
export async function deleteAccount(uid: string, input: { dryRun?: unknown; confirm?: unknown }): Promise<AccountResult> {
  const db = getFirestore()
  const userRef = db.doc(`users/${uid}`)
  const user = await userRef.get()
  const dryRun = input.dryRun === true
  if (!dryRun && input.confirm !== true) throw new Error('Potwierdź usunięcie konta.')

  if (user.get('role') === 'admin') {
    const admins = await db.collection('users').where('role', '==', 'admin').where('status', '==', 'approved').get()
    if (!admins.docs.some((d) => d.id !== uid)) {
      throw new Error('Jesteś jedynym administratorem. Najpierw nadaj komuś rolę admina, a potem usuń konto.')
    }
  }

  const mine = (c: string, field: string) => db.collection(c).where(field, '==', uid).get()
  const [memberships, exams, todoLists, plan] = await Promise.all([
    mine('memberships', 'uid'),
    mine('exams', 'createdBy'),
    mine('todoLists', 'ownerId'),
    db.doc(`plans/${uid}`).get(),
  ])
  const bucket = getStorage().bucket(STORAGE_BUCKET)
  const [files] = await bucket.getFiles({ prefix: `uploads/${uid}/` })

  const counts: AccountCounts = {
    memberships: memberships.size,
    exams: exams.size,
    todoLists: todoLists.size,
    files: files.length,
    plan: plan.exists,
  }
  if (dryRun) return { dryRun, counts }

  await applyAll([
    ...[...memberships.docs, ...exams.docs, ...todoLists.docs].map<Op>((d) => (b) => b.delete(d.ref)),
    ...(plan.exists ? [((b) => b.delete(plan.ref)) as Op] : []),
  ])
  for (const f of files) await f.delete({ ignoreNotFound: true }).catch(() => {})

  // konto logowania przed profilem: gdyby to się nie udało, profil zostaje i można spróbować ponownie
  await getAuth()
    .deleteUser(uid)
    .catch((e: { code?: string }) => {
      if (e?.code !== 'auth/user-not-found') throw e
    })

  const username = typeof user.get('username') === 'string' ? (user.get('username') as string) : null
  const nameRef = username ? db.doc(`usernames/${username.toLowerCase()}`) : null
  const nameDoc = nameRef ? await nameRef.get() : null
  await applyAll([
    (b) => {
      b.delete(userRef)
      if (nameRef && nameDoc?.exists && nameDoc.get('uid') === uid) b.delete(nameRef)
      // wpis dla administratorów: kto odszedł i ile danych usunięto (bez e-maila i zdjęcia)
      b.set(db.collection('accountDeletions').doc(), { uid, username, counts, at: FieldValue.serverTimestamp() })
    },
  ])

  logger.info('Usunięto konto', { uid, counts })
  return { dryRun, counts }
}
