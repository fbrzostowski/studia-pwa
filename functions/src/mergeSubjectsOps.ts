import { FieldValue, getFirestore, type DocumentSnapshot, type WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { canMerge, classKey, combineKinds, mergeClassInfos, retargetFolder, shouldMoveFolder, type ClassInfo } from './mergeLogic.js'
import { findByName } from './textbooks.js'

export interface MergeCounts {
  materials: number
  exams: number
  todoLists: number
  members: number
  classes: number
  books: number
}

export interface MergeResult {
  dryRun: boolean
  kind: string
  from: { id: string; name: string }
  into: { id: string; name: string }
  counts: MergeCounts
}

type Op = (b: WriteBatch) => void

const validId = (v: unknown): v is string => typeof v === 'string' && v !== '' && !v.includes('/')

/** Zapisy w paczkach (limit Firestore to 500 operacji; zostawiamy zapas, bo jedna operacja to czasem dwa zapisy). */
async function applyAll(ops: Op[]) {
  const db = getFirestore()
  for (let i = 0; i < ops.length; i += 200) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + 200)) op(batch)
    await batch.commit()
  }
}

const getAll = async (refs: ReturnType<ReturnType<typeof getFirestore>['doc']>[]): Promise<DocumentSnapshot[]> =>
  refs.length === 0 ? [] : getFirestore().getAll(...refs)

/**
 * Łączy przedmiot `fromId` z `intoId`: przenosi do docelowego materiały, terminy zaliczeń, listy do nauki,
 * uczestników z ich grupami, prowadzących i (przy innej nazwie) folder podręczników, a potem usuwa źródłowy.
 * Kolejność jest taka, że przerwanie w połowie zostawia źródło na miejscu i operację można powtórzyć.
 * Z `dryRun` tylko liczy, co zostanie przeniesione.
 */
export async function mergeSubjects(
  uid: string,
  isAdmin: boolean,
  input: { fromId?: unknown; intoId?: unknown; dryRun?: unknown },
): Promise<MergeResult> {
  const { fromId, intoId } = input
  if (!validId(fromId) || !validId(intoId)) throw new Error('Wybierz dwa przedmioty.')
  if (fromId === intoId) throw new Error('Nie można połączyć przedmiotu z samym sobą.')
  const dryRun = input.dryRun === true

  const db = getFirestore()
  const [from, into] = await Promise.all([db.doc(`subjects/${fromId}`).get(), db.doc(`subjects/${intoId}`).get()])
  if (!from.exists || !into.exists) throw new Error('Jeden z przedmiotów już nie istnieje.')
  const fromName = String(from.get('name') ?? '')
  const intoName = String(into.get('name') ?? '')

  if (!canMerge(from.get('createdBy'), uid, isAdmin)) {
    throw new Error(`Tylko autor przedmiotu „${fromName}” albo administrator może połączyć go z innym.`)
  }
  const kind = combineKinds(String(into.get('kind')), String(from.get('kind')))
  if (!kind) throw new Error(`Nie można połączyć rodzajów zajęć ${from.get('kind')} i ${into.get('kind')}.`)

  const byFrom = (c: string) => db.collection(c).where('subjectId', '==', fromId).get()
  const [materials, exams, todoLists, memberships, classes, allSubjects] = await Promise.all([
    byFrom('materials'),
    byFrom('exams'),
    byFrom('todoLists'),
    byFrom('memberships'),
    byFrom('classes'),
    db.collection('subjects').get(),
  ])

  // Folder podręczników jest powiązany z przedmiotem tylko nazwą.
  const moveFolder = shouldMoveFolder(
    fromName,
    intoName,
    allSubjects.docs.filter((d) => d.id !== fromId).map((d) => String(d.get('name') ?? '')),
  )
  const books = moveFolder
    ? (await db.collection('textbooks').get()).docs.filter((d) => retargetFolder(String(d.get('folder') ?? ''), fromName, intoName) !== null)
    : []

  const counts: MergeCounts = {
    materials: materials.size,
    exams: exams.size,
    todoLists: todoLists.size,
    members: memberships.size,
    classes: classes.size,
    books: books.length,
  }
  const result = { dryRun, kind, from: { id: fromId, name: fromName }, into: { id: intoId, name: intoName }, counts }
  if (dryRun) return result

  const ops: Op[] = []

  // uczestnicy: jedno członkostwo na osobę w przedmiocie docelowym, z sumą jej grup
  const memberTargets = await getAll(memberships.docs.map((d) => db.doc(`memberships/${intoId}_${d.get('uid')}`)))
  memberships.docs.forEach((d, i) => {
    const t = memberTargets[i]
    const classesMerged = mergeClassInfos(
      t.exists ? ((t.get('classes') as ClassInfo[]) ?? []) : [],
      (d.get('classes') as ClassInfo[]) ?? [],
    )
    const photoURL = (t.exists ? t.get('photoURL') : undefined) ?? d.get('photoURL')
    ops.push((b) => {
      b.set(t.ref, {
        uid: d.get('uid'),
        subjectId: intoId,
        username: (t.exists ? t.get('username') : undefined) ?? d.get('username'),
        ...(photoURL ? { photoURL } : {}),
        classes: classesMerged,
        updatedAt: FieldValue.serverTimestamp(),
      })
      b.delete(d.ref)
    })
  })

  // prowadzący grup: wygrywa wpis już istniejący w docelowym
  const classTargets = await getAll(
    classes.docs.map((d) => db.doc(`classes/${classKey(intoId, String(d.get('form')), String(d.get('group')))}`)),
  )
  classes.docs.forEach((d, i) => {
    const t = classTargets[i]
    ops.push((b) => {
      b.set(t.ref, {
        subjectId: intoId,
        form: d.get('form'),
        group: d.get('group'),
        lecturer: (t.exists ? t.get('lecturer') : '') || d.get('lecturer') || '',
        updatedBy: d.get('updatedBy') ?? uid,
        updatedAt: FieldValue.serverTimestamp(),
      })
      b.delete(d.ref)
    })
  })

  for (const d of [...materials.docs, ...exams.docs, ...todoLists.docs]) ops.push((b) => b.update(d.ref, { subjectId: intoId }))

  for (const d of books) {
    const folder = retargetFolder(String(d.get('folder')), fromName, intoName)!
    ops.push((b) => b.update(d.ref, { folder }))
  }
  if (moveFolder) {
    const folders = (await db.collection('textbookFolders').get()).docs.map((d) => ({ ref: d.ref, name: String(d.get('name') ?? '') }))
    const src = findByName(folders, fromName)
    if (src) {
      if (findByName(folders, intoName)) ops.push((b) => b.delete(src.ref))
      else ops.push((b) => b.update(src.ref, { name: intoName }))
    }
  }

  await applyAll(ops)

  // na końcu: parametry docelowego przedmiotu, usunięcie źródła i wpis do dziennika
  await applyAll([
    (b) => {
      const patch: Record<string, unknown> = {}
      if (kind !== into.get('kind')) patch.kind = kind
      if (!into.get('emoji') && from.get('emoji')) patch.emoji = from.get('emoji')
      if (!into.get('usosCode') && from.get('usosCode')) patch.usosCode = from.get('usosCode')
      if (Object.keys(patch).length > 0) b.update(into.ref, patch)
      b.delete(from.ref)
      b.set(db.collection('subjectMerges').doc(), {
        from: { id: fromId, name: fromName, kind: from.get('kind'), usosCode: from.get('usosCode') ?? null, createdBy: from.get('createdBy') ?? null },
        into: { id: intoId, name: intoName },
        by: uid,
        counts,
        at: FieldValue.serverTimestamp(),
      })
    },
  ])

  logger.info('Połączono przedmioty', { from: fromName, into: intoName, counts })
  return result
}
