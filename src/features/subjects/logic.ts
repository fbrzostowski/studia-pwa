import { norm } from '../../lib/text'
import { plural } from '../../lib/plural'
import type { Subject } from '../materials/types'

/** Przedmioty, które mogą być duplikatami: ta sama nazwa (bez wielkości liter i polskich znaków) albo ten sam kod USOS. */
export function duplicateIds(subjects: Pick<Subject, 'id' | 'name' | 'usosCode'>[]): Set<string> {
  const byName = new Map<string, string[]>()
  const byCode = new Map<string, string[]>()
  for (const s of subjects) {
    byName.set(norm(s.name), [...(byName.get(norm(s.name)) ?? []), s.id])
    if (s.usosCode) byCode.set(s.usosCode, [...(byCode.get(s.usosCode) ?? []), s.id])
  }
  const out = new Set<string>()
  for (const ids of [...byName.values(), ...byCode.values()]) if (ids.length > 1) ids.forEach((id) => out.add(id))
  return out
}

/** Który z dwóch przedmiotów zostaje po połączeniu: ten z większą liczbą uczestników, potem ten z kodem USOS, potem pierwszy. */
export function defaultMain(a: Pick<Subject, 'id' | 'usosCode'>, b: Pick<Subject, 'id' | 'usosCode'>, members: (id: string) => number) {
  const diff = members(a.id) - members(b.id)
  if (diff !== 0) return diff > 0 ? a.id : b.id
  if (!!a.usosCode !== !!b.usosCode) return a.usosCode ? a.id : b.id
  return a.id
}

export interface MergeCounts {
  materials: number
  exams: number
  todoLists: number
  members: number
  classes: number
  books: number
}

/** Co zostanie przeniesione, po polsku; pomija zera. */
export function describeCounts(c: MergeCounts): string[] {
  const parts: [number, string, string, string][] = [
    [c.members, 'uczestnik', 'uczestników', 'uczestników'],
    [c.materials, 'materiał', 'materiały', 'materiałów'],
    [c.exams, 'termin zaliczenia', 'terminy zaliczeń', 'terminów zaliczeń'],
    [c.todoLists, 'lista do nauki', 'listy do nauki', 'list do nauki'],
    [c.books, 'podręcznik', 'podręczniki', 'podręczników'],
    [c.classes, 'prowadzący grupy', 'prowadzących grup', 'prowadzących grup'],
  ]
  return parts.filter(([n]) => n > 0).map(([n, one, few, many]) => `${n} ${plural(n, one, few, many)}`)
}

export interface DeleteCounts {
  members: number
  classes: number
  materials: number
  files: number
  exams: number
  todoLists: number
}

/** Co zniknie wraz z przedmiotem, po polsku; pomija zera (listy do nauki zostają, więc opisujemy je osobno). */
export function describeDeleted(c: DeleteCounts): string[] {
  const parts: [number, string, string, string][] = [
    [c.members, 'uczestnictwo', 'uczestnictwa', 'uczestnictw'],
    [c.materials, 'materiał', 'materiały', 'materiałów'],
    [c.files, 'plik', 'pliki', 'plików'],
    [c.exams, 'termin zaliczenia', 'terminy zaliczeń', 'terminów zaliczeń'],
    [c.classes, 'wpis prowadzącego grupy', 'wpisy prowadzących grup', 'wpisów prowadzących grup'],
  ]
  return parts.filter(([n]) => n > 0).map(([n, one, few, many]) => `${n} ${plural(n, one, few, many)}`)
}
