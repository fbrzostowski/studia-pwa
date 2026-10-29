import { norm } from '../../lib/text'
import { fromDateKey } from '../schedule/weeks'
import type { Subject } from '../materials/types'
import { findSubjectForEvent } from '../schedule/match'
import { normGroup, type IcsEvent } from '../schedule/parseIcs'
import type { Exam } from './types'

/** Ile dni od dziś do daty (ujemne = minęło). Daty to lokalne klucze YYYY-MM-DD, więc zmiana czasu nie przeszkadza. */
export const daysUntil = (dateKey: string, todayKey: string) =>
  Math.round((fromDateKey(dateKey).getTime() - fromDateKey(todayKey).getTime()) / 86_400_000)

export function countdown(n: number) {
  if (n === 0) return 'dziś'
  if (n === 1) return 'jutro'
  if (n === -1) return 'wczoraj'
  return n > 0 ? `za ${n} dni` : `${-n} dni temu`
}

/** Kolejność chronologiczna; terminy bez godziny po tych z godziną tego samego dnia. */
export const byDate = (a: Exam, b: Exam) =>
  a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99')

/** Nadchodzące (dziś włącznie) rosnąco oraz minione malejąco. */
export function splitExams(exams: Exam[], todayKey: string) {
  return {
    upcoming: exams.filter((e) => e.date >= todayKey).sort(byDate),
    past: exams.filter((e) => e.date < todayKey).sort((a, b) => byDate(b, a)),
  }
}

export interface ExamSection {
  key: string
  name: string
  subjects: Subject[] // przedmioty o tej nazwie (np. wykład i ćwiczenia osobno)
  exams: Exam[]
  mine: boolean // należę do któregoś z nich
}

/**
 * Terminy pogrupowane po przedmiocie (nazwa bez rozróżniania WYK/CW, bo egzamin dotyczy całości).
 * Pokazujemy przedmioty, do których należę, oraz każdy, który ma jakiś termin.
 */
export function groupExams(subjects: Subject[], exams: Exam[], mySubjectIds: Set<string>) {
  const map = new Map<string, ExamSection>()
  const keyOf = new Map<string, string>()
  for (const s of subjects) {
    const key = norm(s.name)
    keyOf.set(s.id, key)
    const sec = map.get(key) ?? { key, name: s.name, subjects: [], exams: [], mine: false }
    sec.subjects.push(s)
    if (mySubjectIds.has(s.id)) sec.mine = true
    map.set(key, sec)
  }
  for (const e of exams) {
    const key = keyOf.get(e.subjectId)
    if (key) map.get(key)!.exams.push(e)
  }
  return [...map.values()]
    .filter((sec) => sec.mine || sec.exams.length > 0)
    .map((sec) => ({ ...sec, exams: sec.exams.sort(byDate) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pl'))
}

export interface SlotSuggestion {
  time: string // HH:mm początku lekcji
  end: string
  room?: string
  form: string
  name: string
}

/**
 * Lekcje przedmiotu z mojego planu w danym dniu: z nich podpowiadamy godzinę i salę zaliczenia.
 * Lekcje dopasowujemy do przedmiotu jak w widoku Plan (kod USOS, a w razie braku nazwa i forma).
 */
export function suggestSlots(
  events: IcsEvent[],
  subjects: Subject[],
  sectionSubjectIds: Set<string>,
  date: string,
  scope?: { form: string; group: string }, // tylko lekcje tej grupy (np. termin dla ćwiczeń gr. 16)
): SlotSuggestion[] {
  if (!date) return []
  const seen = new Set<string>()
  const out: SlotSuggestion[] = []
  for (const e of events) {
    if (e.start.slice(0, 10) !== date) continue
    if (scope && (e.form !== scope.form || normGroup(e.group) !== normGroup(scope.group))) continue
    const subject = findSubjectForEvent(subjects, e)
    if (!subject || !sectionSubjectIds.has(subject.id)) continue
    const slot: SlotSuggestion = {
      time: e.start.slice(11),
      end: e.end.slice(11),
      room: e.room?.trim() || undefined,
      form: e.form,
      name: e.name,
    }
    const key = `${slot.time}|${slot.room ?? ''}|${slot.form}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(slot)
  }
  return out.sort((a, b) => a.time.localeCompare(b.time) || a.form.localeCompare(b.form))
}

/** Który rodzaj zaliczenia „barwi” dzień, gdy jest ich kilka: final exam, potem mid-term, potem quiz. */
export function dominantType(exams: Pick<Exam, 'type'>[]): Exam['type'] | undefined {
  for (const t of ['FIN', 'MID', 'QUIZ'] as const) if (exams.some((e) => e.type === t)) return t
  return undefined
}
