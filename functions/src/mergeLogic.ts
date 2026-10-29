// Czysta logika łączenia przedmiotów (bez wywołań usług Google) — testowana w tests/mergeSubjects.test.ts.
import { norm } from './textbooks.js'

/** Rodzaje przedmiotu dostępne w aplikacji (musi zgadzać się z SUBJECT_KINDS w src/features/materials/types.ts). */
export const SUBJECT_KINDS = ['WYK', 'LAB', 'KON', 'CW', 'WYK+CW', 'KON+CW'] as const

/**
 * Rodzaj po połączeniu dwóch przedmiotów: suma ich form zajęć, o ile aplikacja zna taki rodzaj
 * (np. WYK + CW = WYK+CW). Inaczej null, np. LAB + WYK.
 */
export function combineKinds(a: string, b: string): string | null {
  const forms = new Set([...a.split('+'), ...b.split('+')])
  const kind = ['WYK', 'KON', 'LAB', 'CW'].filter((f) => forms.has(f)).join('+')
  return (SUBJECT_KINDS as readonly string[]).includes(kind) ? kind : null
}

/** Łączyć może administrator albo autor przedmiotu, który znika (jak przy usuwaniu wpisów). */
export const canMerge = (sourceAuthor: unknown, uid: string, isAdmin: boolean) =>
  isAdmin || (typeof sourceAuthor === 'string' && sourceAuthor !== '' && sourceAuthor === uid)

export interface ClassInfo {
  form: string
  group: string
  when: string[]
  rooms: string[]
}

export const normGroup = (g?: string) => (g ?? '').trim().replace(/[^\w.-]+/g, '_') || '_'

/** Identyfikator grupy w obrębie przedmiotu (taki sam jak w aplikacji, src/features/schedule/parseIcs.ts). */
export const classKey = (subjectId: string, form: string, group?: string) => `${subjectId}_${form}_${normGroup(group)}`

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

/** Grupy dwóch członkostw: te same (forma + numer) scalają terminy i sale, pozostałe zostają obie. */
export function mergeClassInfos(a: ClassInfo[], b: ClassInfo[]): ClassInfo[] {
  const out = new Map<string, ClassInfo>()
  for (const c of [...a, ...b]) {
    const key = `${c.form}|${normGroup(c.group)}`
    const prev = out.get(key)
    out.set(
      key,
      prev
        ? { ...prev, when: union(prev.when ?? [], c.when ?? []), rooms: union(prev.rooms ?? [], c.rooms ?? []) }
        : { form: c.form, group: c.group, when: [...(c.when ?? [])], rooms: [...(c.rooms ?? [])] },
    )
  }
  return [...out.values()]
}

/** Folder podręczników „Źródło” albo „Źródło / Podfolder” przeniesiony pod nową nazwę przedmiotu; inaczej null. */
export function retargetFolder(folder: string, from: string, to: string): string | null {
  const [top, ...rest] = folder.split(' / ')
  if (norm(top ?? '') !== norm(from)) return null
  return [to, ...rest].join(' / ')
}

/** Czy folder podręczników trzeba przenieść: nazwy różne i żaden inny przedmiot nie korzysta ze starej nazwy. */
export const shouldMoveFolder = (fromName: string, intoName: string, otherNames: string[]) =>
  norm(fromName) !== norm(intoName) && !otherNames.some((n) => norm(n) === norm(fromName))
