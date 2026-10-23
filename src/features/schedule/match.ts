import { norm } from '../../lib/text'
import type { Subject, SubjectKind } from '../materials/types'

/** Przedmiot już istnieje, jeśli ma ten sam kod USOS i rodzaj albo tę samą nazwę i rodzaj. */
export function findExisting(row: { code?: string; name: string; kind: SubjectKind }, subjects: Subject[]) {
  return subjects.find(
    (s) => s.kind === row.kind && ((row.code && s.usosCode === row.code) || norm(s.name) === norm(row.name)),
  )
}

/** Przedmiot w aplikacji dla lekcji z planu: po kodzie USOS, a w razie braku po nazwie; rodzaj zajęć musi obejmować formę. */
export function findSubjectForEvent(subjects: Subject[], e: { code?: string; name: string; form: string }) {
  const fits = subjects.filter((s) => s.kind.split('+').includes(e.form))
  return (e.code ? fits.find((s) => s.usosCode === e.code) : undefined) ?? fits.find((s) => norm(s.name) === norm(e.name))
}
