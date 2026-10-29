import { FieldValue, getFirestore, type WriteBatch } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions'
import { STORAGE_BUCKET } from './config.js'
import { canDelete } from './textbooks.js'

export interface DeleteCounts {
  members: number
  classes: number
  materials: number
  files: number
  exams: number
  todoLists: number
}

export interface DeleteResult {
  dryRun: boolean
  subject: { id: string; name: string; kind: string }
  counts: DeleteCounts
}

type Op = (b: WriteBatch) => void
const validId = (v: unknown): v is string => typeof v === 'string' && v !== '' && !v.includes('/')

async function applyAll(ops: Op[]) {
  const db = getFirestore()
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 400)) op(batch)
    await batch.commit()
  }
}

/**
 * Usuwa przedmiot razem z tym, co do niego należy: uczestnictwa, grupy (prowadzący), materiały wraz z plikami
 * w Storage i terminy zaliczeń. Listy do nauki zostają (to prywatne listy), tracą tylko powiązanie z przedmiotem.
 * Podręczniki zostają, bo folder jest powiązany z przedmiotem samą nazwą. Autor przedmiotu albo admin.
 * Przedmiot znika na końcu, więc przerwanie w połowie pozwala powtórzyć operację. Z `dryRun` tylko liczy.
 */
export async function deleteSubject(uid: string, isAdmin: boolean, input: { id?: unknown; dryRun?: unknown }): Promise<DeleteResult> {
  if (!validId(input.id)) throw new Error('Wybierz przedmiot.')
  const id = input.id
  const db = getFirestore()
  const subject = await db.doc(`subjects/${id}`).get()
  if (!subject.exists) throw new Error('Ten przedmiot już nie istnieje.')
  const name = String(subject.get('name') ?? '')
  if (!canDelete(subject.get('createdBy'), uid, isAdmin)) {
    throw new Error(`Przedmiot „${name}” może usunąć tylko jego autor albo administrator.`)
  }

  const by = (c: string) => db.collection(c).where('subjectId', '==', id).get()
  const [memberships, classes, materials, exams, todoLists] = await Promise.all([
    by('memberships'),
    by('classes'),
    by('materials'),
    by('exams'),
    by('todoLists'),
  ])
  const files = materials.docs.map((d) => d.get('storagePath')).filter((p): p is string => typeof p === 'string' && p.startsWith('materials/'))

  const counts: DeleteCounts = {
    members: memberships.size,
    classes: classes.size,
    materials: materials.size,
    files: files.length,
    exams: exams.size,
    todoLists: todoLists.size,
  }
  const result = { dryRun: input.dryRun === true, subject: { id, name, kind: String(subject.get('kind') ?? '') }, counts }
  if (result.dryRun) return result

  // pliki w Storage (błąd jednego pliku nie zatrzymuje reszty; osierocony plik jest lepszy niż niedokończone usuwanie)
  const bucket = getStorage().bucket(STORAGE_BUCKET)
  const failed: string[] = []
  for (const path of files) {
    await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => failed.push(path))
  }

  const ops: Op[] = [
    ...[...memberships.docs, ...classes.docs, ...materials.docs, ...exams.docs].map<Op>((d) => (b) => b.delete(d.ref)),
    ...todoLists.docs.map<Op>((d) => (b) => b.update(d.ref, { subjectId: FieldValue.delete() })),
  ]
  await applyAll(ops)

  await applyAll([
    (b) => {
      b.delete(subject.ref)
      b.set(db.collection('subjectDeletions').doc(), {
        subject: { id, name, kind: subject.get('kind') ?? null, usosCode: subject.get('usosCode') ?? null, createdBy: subject.get('createdBy') ?? null },
        by: uid,
        counts,
        filesNotDeleted: failed,
        at: FieldValue.serverTimestamp(),
      })
    },
  ])

  logger.info('Usunięto przedmiot', { name, counts, filesNotDeleted: failed.length })
  return result
}
