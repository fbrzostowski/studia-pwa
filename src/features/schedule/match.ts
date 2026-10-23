import { norm } from '../../lib/text'
import type { Subject, SubjectKind } from '../materials/types'

/** Przedmiot już istnieje, jeśli ma ten sam kod USOS i rodzaj albo tę samą nazwę i rodzaj. */
export function findExisting(row: { code?: string; name: string; kind: SubjectKind }, subjects: Subject[]) {
  return subjects.find(
    (s) => s.kind === row.kind && ((row.code && s.usosCode === row.code) || norm(s.name) === norm(row.name)),
  )
}
