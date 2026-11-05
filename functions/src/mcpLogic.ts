// Czysta logika serwera MCP (bez wywołań usług Google) — testowana w tests/mcpLogic.test.ts.
import { createHash, randomBytes } from 'node:crypto'
import { norm } from './textbooks.js'

export const TOKEN_PREFIX = 'lom_'

/** Nowy osobisty klucz: pokazujemy go raz, w bazie trzymamy tylko skrót. */
export const newToken = () => TOKEN_PREFIX + randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const looksLikeToken = (t: unknown): t is string => typeof t === 'string' && /^lom_[A-Za-z0-9_-]{43}$/.test(t)

/** Klucz z nagłówka `Authorization: Bearer`, a w razie braku z adresu (`/mcp/{klucz}` albo `?key=`). */
export function tokenFromRequest(headers: Record<string, unknown>, path: string, query: Record<string, unknown>) {
  const auth = typeof headers.authorization === 'string' ? headers.authorization : ''
  const bearer = auth.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (looksLikeToken(bearer)) return bearer
  const fromPath = path.split('/').filter(Boolean).find(looksLikeToken)
  if (fromPath) return fromPath
  return looksLikeToken(query.key) ? query.key : null
}

// --- daty (plan i terminy to lokalne klucze YYYY-MM-DD, jak w aplikacji) ---

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Dzisiejsza data w Polsce (serwer chodzi w UTC). */
export const todayKey = (now = new Date()) => now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' })

/** Początek doby (00:00 czasu polskiego) jako moment w czasie; uwzględnia czas letni. */
export function warsawMidnight(key: string) {
  for (const offset of ['+01:00', '+02:00']) {
    const d = new Date(`${key}T00:00:00${offset}`)
    if (todayKey(d) === key && todayKey(new Date(d.getTime() - 1)) !== key) return d
  }
  return new Date(`${key}T00:00:00+01:00`)
}

export function addDaysKey(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const MAX_RANGE_DAYS = 92

/** Zakres dat z argumentów: `date` (jeden dzień) albo `from`/`to`; domyślnie dziś. */
export function dateRange(a: { date?: unknown; from?: unknown; to?: unknown }, today: string): { from: string; to: string } {
  for (const v of [a.date, a.from, a.to]) if (v !== undefined && !isDateKey(v)) throw new Error(`Nieprawidłowa data „${String(v)}” (format RRRR-MM-DD).`)
  const date = a.date as string | undefined
  const from = (date ?? (a.from as string | undefined)) ?? today
  const to = (date ?? (a.to as string | undefined)) ?? from
  if (to < from) throw new Error('Data końcowa jest przed początkową.')
  if (addDaysKey(from, MAX_RANGE_DAYS) < to) throw new Error(`Zakres może mieć najwyżej ${MAX_RANGE_DAYS} dni.`)
  return { from, to }
}

// --- plan ---

export interface PlanEvent {
  code?: string
  name: string
  form: string
  group?: string
  room?: string
  start: string // YYYY-MM-DDTHH:mm
  end: string
}

export function scheduleIn(events: PlanEvent[], range: { from: string; to: string }, subject?: string) {
  const want = subject ? norm(subject) : ''
  return events
    .filter((e) => e.start.slice(0, 10) >= range.from && e.start.slice(0, 10) <= range.to)
    .filter((e) => !want || norm(e.name).includes(want))
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((e) => ({
      date: e.start.slice(0, 10),
      from: e.start.slice(11, 16),
      to: e.end.slice(11, 16),
      subject: e.name,
      form: e.form,
      ...(e.group ? { group: e.group } : {}),
      ...(e.room ? { room: e.room } : {}),
    }))
}

// --- przedmioty ---

export interface SubjectRef {
  id: string
  name: string
}

/**
 * Przedmioty pasujące do nazwy: najpierw dokładnie (bez wielkości liter i polskich znaków), potem po fragmencie.
 * Wykład i ćwiczenia to osobne przedmioty o tej samej nazwie, więc wynik może mieć kilka pozycji.
 */
export function matchSubjects<T extends SubjectRef>(subjects: T[], name: string): T[] {
  const q = norm(name)
  if (!q) return []
  const exact = subjects.filter((s) => norm(s.name) === q)
  if (exact.length) return exact
  const part = subjects.filter((s) => norm(s.name).includes(q))
  const names = new Set(part.map((s) => norm(s.name)))
  return names.size === 1 ? part : [] // niejednoznaczny fragment nie wybiera niczego
}

export function ambiguousNames<T extends SubjectRef>(subjects: T[], name: string) {
  const q = norm(name)
  return [...new Set(subjects.filter((s) => norm(s.name).includes(q)).map((s) => s.name))].sort((a, b) => a.localeCompare(b, 'pl'))
}

// --- zaliczenia ---

export const EXAM_TYPES = ['MID', 'FIN', 'QUIZ'] as const
export type ExamType = (typeof EXAM_TYPES)[number]
export const EXAM_LABEL: Record<ExamType, string> = { MID: 'Mid-term', FIN: 'Final exam', QUIZ: 'Quiz' }
export const FORMS = ['WYK', 'LAB', 'KON', 'CW'] as const

/** Rodzaj zaliczenia z luźnego zapisu („midterm”, „final exam”, „kartkówka”…). */
export function examTypeOf(v: unknown): ExamType | null {
  const s = typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : ''
  if (['mid', 'midterm', 'kolokwium', 'kolos'].includes(s)) return 'MID'
  if (['fin', 'final', 'finalexam', 'egzamin', 'exam'].includes(s)) return 'FIN'
  if (['quiz', 'kartkowka', 'test'].includes(s)) return 'QUIZ'
  return null
}

export interface ExamInput {
  type: ExamType
  date: string
  time?: string
  room?: string
  note?: string
}

/** Dokładnie te ograniczenia co `validExam` w firestore.rules (serwer pisze jako admin, więc pilnuje ich sam). */
export function validExamInput(a: { type?: unknown; date?: unknown; time?: unknown; room?: unknown; note?: unknown }): ExamInput {
  const type = examTypeOf(a.type)
  if (!type) throw new Error('Rodzaj zaliczenia: MID (mid-term), FIN (final exam) albo QUIZ.')
  if (!isDateKey(a.date)) throw new Error('Podaj datę w formacie RRRR-MM-DD.')
  const out: ExamInput = { type, date: a.date }
  if (a.time !== undefined && a.time !== '') {
    if (typeof a.time !== 'string' || !TIME_RE.test(a.time)) throw new Error('Godzina w formacie GG:MM (np. 14:30).')
    out.time = a.time
  }
  if (a.room !== undefined && String(a.room).trim()) {
    const room = String(a.room).trim()
    if (room.length > 100) throw new Error('Sala: najwyżej 100 znaków.')
    out.room = room
  }
  if (a.note !== undefined && String(a.note).trim()) {
    const note = String(a.note).trim()
    if (note.length > 300) throw new Error('Uwagi: najwyżej 300 znaków.')
    out.note = note
  }
  return out
}

export interface Scope {
  form: string
  group: string
}

export const GROUP_RE = /^[A-Za-z0-9_.-]{1,20}$/

export function validScope(form: unknown, group: unknown): Scope {
  const f = typeof form === 'string' ? form.toUpperCase() : ''
  if (!(FORMS as readonly string[]).includes(f)) throw new Error(`Forma zajęć: ${FORMS.join(', ')}.`)
  const g = String(group ?? '').trim()
  if (!GROUP_RE.test(g)) throw new Error('Numer grupy: 1–20 znaków (litery, cyfry, _ . -).')
  return { form: f, group: g }
}

/** Domyślna grupa terminu: moja (ćwiczenia przed wykładem); bez grupy termin jest tylko dla autora. */
export const defaultScope = (mine: Scope[]): Scope | null => mine.find((s) => s.form !== 'WYK') ?? mine[0] ?? null

// --- materiały ---

export const MAX_NOTE_CHARS = 20000
export const PREVIEW_CHARS = 1500

export function validMaterialInput(a: { type?: unknown; title?: unknown; content?: unknown; url?: unknown }) {
  const title = String(a.title ?? '').trim()
  if (!title || title.length > 200) throw new Error('Tytuł: 1–200 znaków.')
  const type = a.type === 'link' ? 'link' : a.type === 'note' || a.type === undefined ? 'note' : null
  if (!type) throw new Error('Przez MCP można dodać notatkę („note”) albo link („link”); pliki dodaj w aplikacji.')
  if (type === 'link') {
    const url = String(a.url ?? '').trim()
    if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2000) throw new Error('Link musi zaczynać się od http:// lub https://.')
    return { type, title, url } as const
  }
  const content = String(a.content ?? '').trim()
  if (!content) throw new Error('Notatka nie może być pusta.')
  if (content.length > MAX_NOTE_CHARS) throw new Error(`Notatka może mieć najwyżej ${MAX_NOTE_CHARS} znaków.`)
  return { type, title, content } as const
}

export const preview = (s: string, n = PREVIEW_CHARS) => (s.length > n ? `${s.slice(0, n)}…` : s)

// --- listy do nauki ---

export interface TodoItem {
  id: string
  title: string
  done: boolean
  materialId?: string
}

export const MAX_TODO_ITEMS = 300

/** Dokłada punkty na koniec listy, pomijając puste i te, które już są (bez rozróżniania wielkości liter). */
export function addTodoItems(items: TodoItem[], titles: unknown, newId: () => string) {
  if (!Array.isArray(titles) || titles.length === 0) throw new Error('Podaj co najmniej jeden punkt do nauki.')
  const have = new Set(items.map((i) => norm(i.title)))
  const added: TodoItem[] = []
  const skipped: string[] = []
  for (const raw of titles) {
    const title = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)
    if (!title) continue
    if (have.has(norm(title))) {
      skipped.push(title)
      continue
    }
    have.add(norm(title))
    added.push({ id: newId(), title, done: false })
  }
  if (items.length + added.length > MAX_TODO_ITEMS) throw new Error(`Lista może mieć najwyżej ${MAX_TODO_ITEMS} punktów.`)
  return { items: [...items, ...added], added: added.map((i) => i.title), skipped }
}
