// Narzędzia MCP na emulatorze Firestore (Admin SDK): uruchamia je `npm run test:rules`.
// Admin SDK leży tylko w functions/; ścieżka do tych samych plików ESM, których używają narzędzia (jedna instancja aplikacji)
import { initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js'
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TOOLS, type McpUser } from '../functions/src/mcpTools'

const user: McpUser = { uid: 'u1', name: 'filip', isAdmin: false }
const tool = (name: string) => TOOLS.find((t) => t.name === name)!
const run = (name: string, args: Record<string, unknown> = {}, u = user) => tool(name).run(args, u) as Promise<any>
let db: FirebaseFirestore.Firestore

async function clear() {
  for (const c of ['subjects', 'materials', 'exams', 'todoLists', 'plans', 'memberships', 'textbooks']) {
    const snap = await db.collection(c).get()
    await Promise.all(snap.docs.map((d) => d.ref.delete()))
  }
}

beforeAll(() => {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  initializeApp({ projectId: 'studia-pwa-test' })
  db = getFirestore()
})

beforeEach(async () => {
  await clear()
  await db.doc('subjects/math-w').set({ name: 'Mathematics', kind: 'WYK', createdBy: 'u1' })
  await db.doc('subjects/math-c').set({ name: 'Mathematics', kind: 'CW', createdBy: 'u1' })
  await db.doc('subjects/micro').set({ name: 'Microeconomics I', kind: 'CW', createdBy: 'u1' })
})

describe('MCP: plan i przedmioty', () => {
  it('list_subjects scala wykład i ćwiczenia', async () => {
    const r = await run('list_subjects')
    expect(r).toEqual([{ name: 'Mathematics', kinds: ['CW', 'WYK'] }, { name: 'Microeconomics I', kinds: ['CW'] }])
  })
  it('get_schedule pokazuje zajęcia z dnia i radzi sobie bez planu', async () => {
    expect((await run('get_schedule', { date: '2026-11-05' })).lessons).toEqual([])
    await db.doc('plans/u1').set({
      events: [
        { name: 'Mathematics', form: 'CW', group: '12', room: '1.2', start: '2026-11-05T09:50', end: '2026-11-05T11:20' },
        { name: 'Microeconomics I', form: 'CW', group: '3', start: '2026-11-06T08:00', end: '2026-11-06T09:30' },
      ],
    })
    const r = await run('get_schedule', { date: '2026-11-05' })
    expect(r.lessons).toEqual([{ date: '2026-11-05', from: '09:50', to: '11:20', subject: 'Mathematics', form: 'CW', group: '12', room: '1.2' }])
    expect((await run('get_schedule', { from: '2026-11-05', to: '2026-11-06', subject: 'micro' })).count).toBe(1)
  })
})

describe('MCP: materiały', () => {
  it('add_material zapisuje notatkę z podpięciem do lekcji, a get_materials znajduje ją po dniu', async () => {
    const added = await run('add_material', { subject: 'Mathematics', title: 'Granice', content: 'lim x→0', date: '2026-11-05', form: 'CW', group: '12' })
    expect(added.ok).toBe(true)
    const saved = (await db.doc(`materials/${added.id}`).get()).data()!
    expect(saved).toMatchObject({ subjectId: 'math-c', type: 'note', lessonDate: '2026-11-05', lessonForm: 'CW', lessonGroup: '12', ownerId: 'u1', ownerName: 'filip' })
    const found = await run('get_materials', { date: '2026-11-05' })
    expect(found.materials.map((m: any) => m.title)).toEqual(['Granice'])
    expect((await run('get_materials', { date: '2026-11-05', subject: 'Microeconomics I' })).count).toBe(0)
    expect((await run('get_material', { id: added.id })).content).toBe('lim x→0')
  })
  it('add_material odrzuca zły link i nieznany przedmiot', async () => {
    await expect(run('add_material', { subject: 'Mathematics', title: 'x', type: 'link', url: 'ftp://a' })).rejects.toThrow(/http/)
    await expect(run('add_material', { subject: 'Fizyka', title: 'x', content: 'y' })).rejects.toThrow(/Nie ma przedmiotu/)
    await expect(run('add_material', { subject: 'Mathematics', title: 'x', content: 'y', date: '2026-11-05' })).rejects.toThrow(/Forma/)
  })
  it('get_materials łapie też materiały dodane tego dnia (czas polski)', async () => {
    const now = new Date()
    await db.collection('materials').add({ subjectId: 'micro', title: 'Dziś', type: 'link', url: 'https://a.pl', ownerId: 'u2', ownerName: 'x', createdAt: now })
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })
    expect((await run('get_materials', { date: today })).materials[0]).toMatchObject({ title: 'Dziś', matched: 'dodany tego dnia' })
  })
})

describe('MCP: podręczniki', () => {
  it('search_textbooks szuka po tytule i przedmiocie', async () => {
    await db.collection('textbooks').add({ title: 'Calculus', fileName: 'calc.pdf', folder: 'Mathematics', size: 2_097_152, storagePath: 'textbooks/a/calc.pdf' })
    await db.collection('textbooks').add({ title: 'Mas-Colell', fileName: 'mc.pdf', folder: 'Microeconomics I / Książki', size: 1, storagePath: 'textbooks/b/mc.pdf' })
    expect((await run('search_textbooks', { query: 'calc' })).textbooks[0]).toMatchObject({ title: 'Calculus', sizeMB: 2 })
    expect((await run('search_textbooks', { subject: 'microeconomics' })).count).toBe(1)
    const link = await run('get_textbook_link', { query: 'calc' })
    expect(link.link).toMatch(/^https:\/\/app\.lomiankowe-sgh\.pl\/\?open=textbook:[A-Za-z0-9]+$/)
    expect(JSON.stringify(link)).not.toMatch(/storage\.googleapis|X-Goog|token=/)
    await expect(run('get_textbook_link', { query: 'nie ma takiego' })).rejects.toThrow(/Nie znaleziono/)
    await expect(run('get_textbook_link', {})).rejects.toThrow(/id albo query/)
  })
})

describe('MCP: zaliczenia', () => {
  it('add_exam bierze grupę użytkownika, a bez grupy robi termin prywatny', async () => {
    const lone = await run('add_exam', { subject: 'Mathematics', type: 'MID', date: '2026-11-20' })
    expect(lone.scope).toMatch(/tylko dla Ciebie/)
    expect((await db.doc(`exams/${lone.id}`).get()).data()).toMatchObject({ onlyFor: 'u1', createdBy: 'u1', type: 'MID', subjectId: 'math-c' })

    await db.doc('memberships/math-c_u1').set({ uid: 'u1', subjectId: 'math-c', classes: [{ form: 'CW', group: '12' }] })
    const mine = await run('add_exam', { subject: 'Mathematics', type: 'quiz', date: '2026-11-21', time: '09:00', room: '2.1' })
    expect(mine.scope).toBe('Twoja grupa: CW gr. 12')
    const saved = (await db.doc(`exams/${mine.id}`).get()).data()!
    expect(saved).toMatchObject({ form: 'CW', group: '12', type: 'QUIZ', time: '09:00', room: '2.1' })
    expect(saved.onlyFor).toBeUndefined()
  })
  it('add_exam: cały przedmiot, wskazana grupa i błędy', async () => {
    const all = await run('add_exam', { subject: 'Microeconomics I', type: 'FIN', date: '2027-01-20', whole_subject: true })
    expect((await db.doc(`exams/${all.id}`).get()).data()).not.toHaveProperty('form')
    const g = await run('add_exam', { subject: 'Microeconomics I', type: 'MID', date: '2026-12-01', form: 'cw', group: '7' })
    expect((await db.doc(`exams/${g.id}`).get()).data()).toMatchObject({ form: 'CW', group: '7' })
    await expect(run('add_exam', { subject: 'Microeconomics I', type: 'MID', date: '2026-13-01' })).rejects.toThrow(/datę/)
    await expect(run('add_exam', { subject: 'Micro', type: 'MID', date: '2026-12-01' })).resolves.toBeTruthy()
  })
  it('get_exams pokazuje nadchodzące, bez prywatnych cudzych', async () => {
    await run('add_exam', { subject: 'Mathematics', type: 'MID', date: '2999-11-20' })
    await run('add_exam', { subject: 'Mathematics', type: 'MID', date: '2000-01-01' })
    const other = await run('add_exam', { subject: 'Mathematics', type: 'FIN', date: '2999-12-20' }, { uid: 'u2', name: 'ktos', isAdmin: false })
    expect(other.ok).toBe(true)
    const r = await run('get_exams', {})
    expect(r.exams.map((e: any) => e.date)).toEqual(['2999-11-20'])
    expect((await run('get_exams', { include_past: true })).count).toBe(2)
  })
})

describe('MCP: listy do nauki', () => {
  it('add_todo zakłada listę przedmiotu, dopisuje i pomija powtórzenia', async () => {
    const a = await run('add_todo', { subject: 'Mathematics', items: ['Granice', 'Pochodne'] })
    expect(a).toMatchObject({ createdList: true, list: 'Nauka: Mathematics', added: ['Granice', 'Pochodne'] })
    const b = await run('add_todo', { subject: 'Mathematics', items: ['granice', 'Całki'] })
    expect(b).toMatchObject({ createdList: false, added: ['Całki'], skippedDuplicates: ['granice'], total: 3 })
    const lists = await db.collection('todoLists').get()
    expect(lists.size).toBe(1)
    expect(lists.docs[0].data()).toMatchObject({ ownerId: 'u1', subjectId: 'math-c' })
    const got = await run('get_todos', { subject: 'Mathematics' })
    expect(got.lists[0]).toMatchObject({ total: 3, done: 0, subject: 'Mathematics' })
  })
  it('add_todo po nazwie listy, a cudzych list nie widać', async () => {
    await db.collection('todoLists').add({ ownerId: 'u2', name: 'Cudza', items: [] })
    await expect(run('add_todo', { list: 'Cudza', items: ['x'] })).rejects.toThrow(/Nie masz listy/)
    expect((await run('get_todos')).count).toBe(0)
    await run('add_todo', { subject: 'Microeconomics I', items: ['a'] })
    expect(await run('add_todo', { list: 'nauka: micro', items: ['b'] })).toMatchObject({ added: ['b'], total: 2 })
  })
})
