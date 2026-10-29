import { normGroup } from '../schedule/parseIcs'
import type { Exam } from './types'

/** Grupa zajęciowa: forma + numer grupy (jak w USOS). */
export interface Scope {
  form: string
  group: string
}

export const FORM_TITLE: Record<string, string> = { WYK: 'Wykłady', CW: 'Ćwiczenia', KON: 'Konwersatorium', LAB: 'Laboratorium' }
const FORM_ORDER = ['WYK', 'KON', 'LAB', 'CW']

export const sameScope = (a: Scope, b: Scope) => a.form === b.form && normGroup(a.group) === normGroup(b.group)
export const scopeTitle = (s: Scope) => `${FORM_TITLE[s.form] ?? s.form} · gr. ${s.group}`

type Member = { uid?: string; subjectId: string; classes?: Scope[] }

const sortScopes = (list: Scope[]) =>
  list.sort(
    (a, b) =>
      FORM_ORDER.indexOf(a.form) - FORM_ORDER.indexOf(b.form) || a.group.localeCompare(b.group, 'pl', { numeric: true }),
  )

/** Wszystkie grupy podanych przedmiotów (z grup uczestników), bez powtórzeń. */
export function groupsOf(members: Member[], subjectIds: Set<string>): Scope[] {
  const out: Scope[] = []
  for (const m of members) {
    if (!subjectIds.has(m.subjectId)) continue
    for (const c of m.classes ?? []) if (c.group && !out.some((o) => sameScope(o, c))) out.push({ form: c.form, group: c.group })
  }
  return sortScopes(out)
}

/** Grupy, do których należy dana osoba, w podanych przedmiotach. */
export const myGroups = (members: Member[], subjectIds: Set<string>, uid: string) =>
  groupsOf(members.filter((m) => m.uid === uid), subjectIds)

export const examScope = (e: Pick<Exam, 'form' | 'group'>): Scope | null => (e.form && e.group ? { form: e.form, group: e.group } : null)

/** Termin „tylko dla autora” widzi wyłącznie on (także admin w widokach aplikacji). */
export const visibleTo = (e: Pick<Exam, 'onlyFor'>, uid: string) => !e.onlyFor || e.onlyFor === uid

/** Czy termin dotyczy mnie: dla całego przedmiotu zawsze, dla grupy tylko gdy do niej należę. */
export function relevantFor(e: Pick<Exam, 'form' | 'group'>, mine: Scope[]) {
  const s = examScope(e)
  return !s || mine.some((m) => sameScope(m, s))
}

/** Domyślny zakres nowego terminu: moja grupa (ćwiczenia przed wykładem), a bez grupy „tylko dla mnie”. */
export function defaultScope(mine: Scope[]): Scope | 'me' {
  if (mine.length === 0) return 'me'
  return mine.find((s) => s.form !== 'WYK') ?? mine[0]!
}
