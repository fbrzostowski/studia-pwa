import { randomUUID } from 'node:crypto'
import { FieldValue, Timestamp, getFirestore, type DocumentData } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { APP_URL } from './config.js'
import type { Tool } from './mcpProtocol.js'
import {
  EXAM_LABEL,
  addDaysKey,
  addTodoItems,
  ambiguousNames,
  dateRange,
  defaultScope,
  isDateKey,
  matchSubjects,
  preview,
  scheduleIn,
  todayKey,
  validExamInput,
  validMaterialInput,
  validScope,
  warsawMidnight,
  type ExamType,
  type PlanEvent,
  type Scope,
  type TodoItem,
} from './mcpLogic.js'
import { norm } from './textbooks.js'

/** Kto wywołuje narzędzie (ustalone z osobistego klucza). */
export interface McpUser {
  uid: string
  name: string
  isAdmin: boolean
}

/** Link do pliku prowadzi do aplikacji (wymaga zalogowania); nie dajemy adresów Storage, bo działałyby dla każdego, kto je ma. */
export const appFileLink = (kind: 'textbook' | 'material', id: string) => `${APP_URL}/?open=${kind}:${id}`

interface Subject {
  id: string
  name: string
  kind?: string
  emoji?: string
}

const db = () => getFirestore()
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

async function allSubjects(): Promise<Subject[]> {
  const snap = await db().collection('subjects').get()
  return snap.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? ''), kind: d.get('kind'), emoji: d.get('emoji') }))
}

/** Przedmioty o podanej nazwie (wykład i ćwiczenia osobno) albo czytelny błąd z podpowiedzią. */
function subjectsNamed(subjects: Subject[], name: unknown): Subject[] {
  const q = str(name)
  if (!q) throw new Error('Podaj nazwę przedmiotu (zobacz list_subjects).')
  const hit = matchSubjects(subjects, q)
  if (hit.length) return hit
  const near = ambiguousNames(subjects, q)
  throw new Error(
    near.length > 1
      ? `Nazwa „${q}” pasuje do kilku przedmiotów: ${near.join(', ')}. Podaj pełną nazwę.`
      : `Nie ma przedmiotu „${q}”. Dostępne: ${[...new Set(subjects.map((s) => s.name))].sort((a, b) => a.localeCompare(b, 'pl')).join(', ')}.`,
  )
}

const optSubjects = (subjects: Subject[], name: unknown) => (str(name) ? subjectsNamed(subjects, name) : null)

async function myClasses(uid: string, subjectIds: string[]): Promise<Scope[]> {
  const snap = await db().collection('memberships').where('uid', '==', uid).get()
  const out: Scope[] = []
  for (const d of snap.docs) {
    if (!subjectIds.includes(String(d.get('subjectId')))) continue
    for (const c of (d.get('classes') as Scope[] | undefined) ?? []) {
      if (c.group && !out.some((o) => o.form === c.form && o.group === c.group)) out.push({ form: c.form, group: c.group })
    }
  }
  return out
}

const dateProps = {
  date: { type: 'string', description: 'Jeden dzień, RRRR-MM-DD (np. 2026-11-05). Bez podania: dziś.' },
  from: { type: 'string', description: 'Początek zakresu, RRRR-MM-DD (zamiast „date”).' },
  to: { type: 'string', description: 'Koniec zakresu włącznie, RRRR-MM-DD (najwyżej 92 dni).' },
}
const subjectProp = { type: 'string', description: 'Nazwa przedmiotu (pełna lub jednoznaczny fragment), np. „Mathematics”.' }
const noArgs = { type: 'object', properties: {}, additionalProperties: false }

export const TOOLS: Tool<McpUser>[] = [
  {
    name: 'list_subjects',
    readOnly: true,
    description: 'Lista przedmiotów w aplikacji (nazwa, rodzaj zajęć). Użyj, gdy nie znasz dokładnej nazwy przedmiotu.',
    inputSchema: noArgs,
    async run() {
      const subjects = await allSubjects()
      const byName = new Map<string, { name: string; kinds: string[] }>()
      for (const s of subjects) {
        const e = byName.get(norm(s.name)) ?? { name: s.name, kinds: [] }
        if (s.kind) e.kinds.push(s.kind)
        byName.set(norm(s.name), e)
      }
      for (const e of byName.values()) e.kinds.sort()
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    },
  },
  {
    name: 'get_schedule',
    readOnly: true,
    description:
      'Plan zajęć użytkownika z zaimportowanego planu USOS: godziny, przedmiot, forma (WYK/CW/KON/LAB), grupa, sala. Domyślnie dzisiaj. Do pytań typu „co mam jutro”, „kiedy mam matematykę w tym tygodniu”.',
    inputSchema: { type: 'object', properties: { ...dateProps, subject: subjectProp }, additionalProperties: false },
    async run(a, u) {
      const today = todayKey()
      const range = dateRange(a, today)
      const snap = await db().doc(`plans/${u.uid}`).get()
      if (!snap.exists) return { today, note: 'Użytkownik nie zaimportował jeszcze planu (zakładka Plan w aplikacji).', lessons: [] }
      const lessons = scheduleIn((snap.get('events') as PlanEvent[]) ?? [], range, str(a.subject))
      return { today, from: range.from, to: range.to, count: lessons.length, lessons }
    },
  },
  {
    name: 'get_materials',
    readOnly: true,
    description:
      'Materiały z danego dnia: notatki i pliki podpięte do lekcji z tego dnia („lesson”) oraz dodane tego dnia („added”). Można zawęzić do przedmiotu. Treść notatek jest skrócona; pełną daje get_material.',
    inputSchema: { type: 'object', properties: { ...dateProps, subject: subjectProp }, additionalProperties: false },
    async run(a) {
      const range = dateRange(a, todayKey())
      const subjects = await allSubjects()
      const wanted = optSubjects(subjects, a.subject)
      const nameOf = new Map(subjects.map((s) => [s.id, s.name]))
      const start = Timestamp.fromDate(warsawMidnight(range.from))
      const end = Timestamp.fromDate(warsawMidnight(addDaysKey(range.to, 1)))
      const [lessonSnap, addedSnap] = await Promise.all([
        db().collection('materials').where('lessonDate', '>=', range.from).where('lessonDate', '<=', range.to).get(),
        db().collection('materials').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      ])
      const seen = new Set<string>()
      const out: unknown[] = []
      const push = (d: DocumentData & { id: string }, why: 'lesson' | 'added') => {
        if (seen.has(d.id)) return
        if (wanted && !wanted.some((s) => s.id === d.subjectId)) return
        seen.add(d.id)
        out.push(materialView(d, nameOf, why))
      }
      for (const d of lessonSnap.docs) push({ id: d.id, ...d.data() }, 'lesson')
      for (const d of addedSnap.docs) push({ id: d.id, ...d.data() }, 'added')
      return { from: range.from, to: range.to, count: out.length, materials: out }
    },
  },
  {
    name: 'get_material',
    readOnly: true,
    description: 'Pełna treść jednego materiału (notatka, link albo plik; plik ma openLink do aplikacji, który otwiera się po zalogowaniu).',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'id z get_materials' } }, required: ['id'], additionalProperties: false },
    async run(a) {
      const id = str(a.id)
      if (!id) throw new Error('Podaj id materiału.')
      const snap = await db().doc(`materials/${id}`).get()
      if (!snap.exists) throw new Error('Nie ma takiego materiału.')
      const subject = (await db().doc(`subjects/${snap.get('subjectId')}`).get()).get('name')
      const view = materialView({ id, ...snap.data() }, new Map([[String(snap.get('subjectId')), String(subject ?? '')]]), 'lesson', true)
      const path = snap.get('storagePath')
      return typeof path === 'string' && path ? { ...view, openLink: appFileLink('material', id) } : view
    },
  },
  {
    name: 'add_material',
    readOnly: false,
    description:
      'Dodaje materiał do przedmiotu: notatkę (type=note, treść w content) albo link (type=link, adres w url). Opcjonalnie podpina go do lekcji z danego dnia (date, form, group). Pliki dodaje się w aplikacji.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: subjectProp,
        title: { type: 'string', description: 'Tytuł materiału (1–200 znaków).' },
        type: { type: 'string', enum: ['note', 'link'], description: 'Domyślnie note.' },
        content: { type: 'string', description: 'Treść notatki (dla type=note).' },
        url: { type: 'string', description: 'Adres http(s) (dla type=link).' },
        date: { type: 'string', description: 'Opcjonalnie: data lekcji, do której podpiąć materiał (RRRR-MM-DD). Wymaga też form i group.' },
        form: { type: 'string', enum: ['WYK', 'CW', 'KON', 'LAB'], description: 'Forma lekcji (z date).' },
        group: { type: 'string', description: 'Numer grupy lekcji (z date).' },
      },
      required: ['subject', 'title'],
      additionalProperties: false,
    },
    async run(a, u) {
      const subjects = subjectsNamed(await allSubjects(), a.subject)
      const input = validMaterialInput(a)
      let lesson = {}
      if (a.date !== undefined || a.form !== undefined || a.group !== undefined) {
        if (!isDateKey(a.date)) throw new Error('Aby podpiąć materiał do lekcji, podaj date (RRRR-MM-DD), form i group.')
        const s = validScope(a.form, a.group)
        lesson = { lessonDate: a.date, lessonForm: s.form, lessonGroup: s.group }
      }
      // ćwiczenia i wykład to osobne przedmioty: notatkę z lekcji dajemy temu, którego forma pasuje
      const target = (lesson as { lessonForm?: string }).lessonForm
        ? (subjects.find((s) => String(s.kind ?? '').split('+').includes((lesson as { lessonForm: string }).lessonForm)) ?? subjects[0])
        : subjects[0]
      const ref = await db().collection('materials').add({
        subjectId: target.id,
        ...input,
        ownerId: u.uid,
        ownerName: u.name.slice(0, 60),
        createdAt: FieldValue.serverTimestamp(),
        ...lesson,
      })
      logger.info('MCP: dodano materiał', { uid: u.uid })
      return { ok: true, id: ref.id, subject: target.name, title: input.title }
    },
  },
  {
    name: 'search_textbooks',
    readOnly: true,
    description: 'Szuka podręczników i prezentacji (pliki w zakładce Podręczniki) po tytule, nazwie pliku lub folderze/przedmiocie. Bez zapytania zwraca wszystkie. Wynik ma id do get_textbook_link.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Fragment tytułu, nazwy pliku lub przedmiotu.' }, subject: subjectProp },
      additionalProperties: false,
    },
    async run(a) {
      const books = await textbookList()
      const q = norm(str(a.query))
      const sub = norm(str(a.subject))
      const hit = books.filter((b) => (!q || norm(`${b.title} ${b.fileName} ${b.folder}`).includes(q)) && (!sub || norm(b.folder).startsWith(sub) || norm(b.folder).includes(sub)))
      return { count: hit.length, textbooks: hit.slice(0, 50).map(({ id, title, folder, fileName, size }) => ({ id, title, folder, fileName, sizeMB: Math.round((size / 1048576) * 10) / 10 })) }
    },
  },
  {
    name: 'get_textbook_link',
    readOnly: true,
    description: 'Zwraca link do podręcznika w aplikacji LOM.SGH. Link otwiera plik po zalogowaniu (Google), więc nie da się go użyć bez konta. Podaj id z search_textbooks albo tytuł/fragment (musi pasować do jednego pliku).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'id z search_textbooks' }, query: { type: 'string', description: 'Tytuł lub fragment, jeśli nie znasz id.' } },
      additionalProperties: false,
    },
    async run(a) {
      const books = await textbookList()
      let book = books.find((b) => b.id === str(a.id))
      if (!book) {
        const q = norm(str(a.query))
        if (!q) throw new Error('Podaj id albo query.')
        const hit = books.filter((b) => norm(`${b.title} ${b.fileName}`).includes(q))
        const exact = hit.filter((b) => norm(b.title) === q || norm(b.fileName) === q)
        const pick = exact.length === 1 ? exact : hit
        if (pick.length === 0) throw new Error(`Nie znaleziono podręcznika „${str(a.query)}”. Użyj search_textbooks.`)
        if (pick.length > 1) throw new Error(`Pasuje kilka plików: ${pick.slice(0, 8).map((b) => `„${b.title}” (${b.folder}, id ${b.id})`).join('; ')}. Podaj id.`)
        book = pick[0]
      }
      return {
        title: book.title,
        folder: book.folder,
        fileName: book.fileName,
        link: appFileLink('textbook', book.id),
        note: 'Link otwiera się po zalogowaniu w LOM.SGH.',
      }
    },
  },
  {
    name: 'get_exams',
    readOnly: true,
    description: 'Terminy zaliczeń (mid-term, final exam, quiz), od najbliższego. Domyślnie nadchodzące; można zawęzić do przedmiotu albo zakresu dat.',
    inputSchema: {
      type: 'object',
      properties: { subject: subjectProp, from: dateProps.from, to: dateProps.to, include_past: { type: 'boolean', description: 'Pokaż też minione (domyślnie nie).' } },
      additionalProperties: false,
    },
    async run(a, u) {
      const today = todayKey()
      const subjects = await allSubjects()
      const wanted = optSubjects(subjects, a.subject)
      for (const v of [a.from, a.to]) if (v !== undefined && !isDateKey(v)) throw new Error('Daty w formacie RRRR-MM-DD.')
      const from = (a.from as string | undefined) ?? (a.include_past ? '0000-01-01' : today)
      const to = (a.to as string | undefined) ?? '9999-12-31'
      const nameOf = new Map(subjects.map((s) => [s.id, s.name]))
      const snap = await db().collection('exams').where('date', '>=', from).where('date', '<=', to).get()
      const exams = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string })
        .filter((e) => (!e.onlyFor || e.onlyFor === u.uid) && nameOf.has(e.subjectId) && (!wanted || wanted.some((s) => s.id === e.subjectId)))
        .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time ?? '99:99').localeCompare(String(y.time ?? '99:99')))
      return {
        today,
        count: exams.length,
        exams: exams.map((e) => ({
          id: e.id,
          subject: nameOf.get(e.subjectId),
          type: EXAM_LABEL[e.type as ExamType] ?? e.type,
          date: e.date,
          ...(e.time ? { time: e.time } : {}),
          ...(e.room ? { room: e.room } : {}),
          ...(e.note ? { note: e.note } : {}),
          scope: e.onlyFor ? 'tylko autor' : e.form ? `${e.form} gr. ${e.group}` : 'cały przedmiot',
          ...(e.createdByName ? { addedBy: e.createdByName } : {}),
        })),
      }
    },
  },
  {
    name: 'add_exam',
    readOnly: false,
    description:
      'Dodaje termin zaliczenia: mid-term (MID), final exam (FIN) albo quiz (QUIZ). Domyślnie dla grupy użytkownika w tym przedmiocie (a bez grupy tylko dla niego). Aby dodać dla wybranej grupy podaj form i group, a dla wszystkich grup whole_subject=true. Godzinę i salę podaj tylko, jeśli użytkownik je zna.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: subjectProp,
        type: { type: 'string', enum: ['MID', 'FIN', 'QUIZ'], description: 'MID = mid-term, FIN = final exam, QUIZ = quiz.' },
        date: { type: 'string', description: 'RRRR-MM-DD' },
        time: { type: 'string', description: 'GG:MM (opcjonalnie)' },
        room: { type: 'string', description: 'Sala (opcjonalnie)' },
        note: { type: 'string', description: 'Uwagi, zakres materiału (opcjonalnie, do 300 znaków)' },
        form: { type: 'string', enum: ['WYK', 'CW', 'KON', 'LAB'], description: 'Forma grupy (razem z group).' },
        group: { type: 'string', description: 'Numer grupy (razem z form).' },
        whole_subject: { type: 'boolean', description: 'Termin dla wszystkich grup przedmiotu.' },
      },
      required: ['subject', 'type', 'date'],
      additionalProperties: false,
    },
    async run(a, u) {
      const subjects = subjectsNamed(await allSubjects(), a.subject)
      const input = validExamInput(a)
      let scope: Scope | null
      let scopeText: string
      if (a.whole_subject === true) {
        scope = null
        scopeText = 'cały przedmiot (wszystkie grupy)'
      } else if (a.form !== undefined || a.group !== undefined) {
        scope = validScope(a.form, a.group)
        scopeText = `${scope.form} gr. ${scope.group}`
      } else {
        scope = defaultScope(await myClasses(u.uid, subjects.map((s) => s.id)))
        scopeText = scope ? `Twoja grupa: ${scope.form} gr. ${scope.group}` : 'tylko dla Ciebie (nie masz grupy w tym przedmiocie)'
      }
      const subject = subjects[0]
      const ref = await db().collection('exams').add({
        subjectId: subject.id,
        ...input,
        ...(scope ? { form: scope.form, group: scope.group } : a.whole_subject === true ? {} : { onlyFor: u.uid }),
        createdBy: u.uid,
        createdByName: u.name.slice(0, 60),
        createdAt: FieldValue.serverTimestamp(),
      })
      logger.info('MCP: dodano termin', { uid: u.uid, type: input.type })
      return { ok: true, id: ref.id, subject: subject.name, type: EXAM_LABEL[input.type], date: input.date, ...(input.time ? { time: input.time } : {}), scope: scopeText }
    },
  },
  {
    name: 'get_todos',
    readOnly: true,
    description: 'Prywatne listy do nauki użytkownika (punkty z odznaczeniami „opanowane”). Można zawęzić do przedmiotu.',
    inputSchema: { type: 'object', properties: { subject: subjectProp }, additionalProperties: false },
    async run(a, u) {
      const subjects = await allSubjects()
      const wanted = optSubjects(subjects, a.subject)
      const nameOf = new Map(subjects.map((s) => [s.id, s.name]))
      const snap = await db().collection('todoLists').where('ownerId', '==', u.uid).get()
      const lists = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string })
        .filter((l) => !wanted || wanted.some((s) => s.id === l.subjectId))
        .map((l) => {
          const items = (l.items as TodoItem[]) ?? []
          return {
            id: l.id,
            name: l.name,
            ...(l.subjectId && nameOf.get(l.subjectId) ? { subject: nameOf.get(l.subjectId) } : {}),
            done: items.filter((i) => i.done).length,
            total: items.length,
            items: items.map((i) => ({ title: i.title, done: i.done })),
          }
        })
      return { count: lists.length, lists }
    },
  },
  {
    name: 'add_todo',
    readOnly: false,
    description:
      'Dodaje punkty do listy do nauki (zakładka Zaliczenia → Do nauki). Podaj subject, a lista „Nauka: <przedmiot>” zostanie użyta albo założona; albo podaj list (nazwę istniejącej listy). Powtórzone punkty są pomijane.',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'Punkty do nauki, np. ["Rozdział 3: popyt", "Zadania z kolokwium 2024"].' },
        subject: subjectProp,
        list: { type: 'string', description: 'Nazwa istniejącej listy (zamiast subject).' },
      },
      required: ['items'],
      additionalProperties: false,
    },
    async run(a, u) {
      const subjects = await allSubjects()
      const snap = await db().collection('todoLists').where('ownerId', '==', u.uid).get()
      const lists = snap.docs.map((d) => ({ id: d.id, name: String(d.get('name') ?? ''), subjectId: d.get('subjectId') as string | undefined, items: ((d.get('items') as TodoItem[]) ?? []) }))
      let target: (typeof lists)[number] | undefined
      let create: { name: string; subjectId?: string } | null = null
      if (str(a.list)) {
        const q = norm(str(a.list))
        const hit = lists.filter((l) => norm(l.name) === q)
        const part = hit.length ? hit : lists.filter((l) => norm(l.name).includes(q))
        if (part.length !== 1) throw new Error(part.length ? `Pasuje kilka list: ${part.map((l) => l.name).join(', ')}.` : `Nie masz listy „${str(a.list)}”. Podaj subject, żeby założyć nową.`)
        target = part[0]
      } else {
        const subs = subjectsNamed(subjects, a.subject)
        target = lists.find((l) => l.subjectId && subs.some((s) => s.id === l.subjectId))
        if (!target) create = { name: `Nauka: ${subs[0].name}`.slice(0, 100), subjectId: subs[0].id }
      }
      const { items, added, skipped } = addTodoItems(target?.items ?? [], a.items, randomUUID)
      if (added.length > 0 || create) {
        if (target) await db().doc(`todoLists/${target.id}`).update({ items, updatedAt: FieldValue.serverTimestamp() })
        else {
          await db().collection('todoLists').add({
            ownerId: u.uid,
            name: create!.name,
            ...(create!.subjectId ? { subjectId: create!.subjectId } : {}),
            items,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }
      return { ok: true, list: target?.name ?? create!.name, createdList: !target, added, skippedDuplicates: skipped, total: items.length }
    },
  },
]

function materialView(d: DocumentData & { id: string }, nameOf: Map<string, string>, why: 'lesson' | 'added', full = false) {
  const content = typeof d.content === 'string' ? d.content : undefined
  return {
    id: d.id,
    subject: nameOf.get(d.subjectId) ?? '',
    title: d.title,
    type: d.type,
    matched: why === 'lesson' ? 'lekcja z tego dnia' : 'dodany tego dnia',
    ...(d.lessonDate ? { lesson: `${d.lessonDate} ${d.lessonForm ?? ''} gr. ${d.lessonGroup ?? ''}`.trim() } : {}),
    ...(content !== undefined ? { content: full ? content : preview(content), ...(!full && content.length > 1500 ? { truncated: true } : {}) } : {}),
    ...(d.url ? { url: d.url } : {}),
    ...(d.fileName ? { fileName: d.fileName, hasFile: true } : {}),
    author: d.ownerName,
    ...(d.createdAt?.toDate ? { addedAt: d.createdAt.toDate().toISOString() } : {}),
  }
}

async function textbookList() {
  const snap = await db().collection('textbooks').get()
  return snap.docs
    .map((d) => ({
      id: d.id,
      title: String(d.get('title') ?? ''),
      fileName: String(d.get('fileName') ?? ''),
      folder: String(d.get('folder') ?? ''),
      size: Number(d.get('size') ?? 0),
      storagePath: String(d.get('storagePath') ?? ''),
    }))
    .filter((b) => b.storagePath)
    .sort((a, b) => a.folder.localeCompare(b.folder, 'pl') || a.title.localeCompare(b.title, 'pl', { numeric: true }))
}
