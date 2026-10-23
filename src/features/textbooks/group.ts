import type { Subject } from '../materials/types'

export interface BookLike {
  title: string
  folder: string // ścieżka podfolderu na Drive, np. „Mikroekonomia / Prezentacje”; '' = folder główny
}

/** Porównywanie nazw bez wielkości liter, polskich znaków i nadmiarowych spacji. */
export const norm = (s: string) =>
  // ł nie rozkłada się w Unicode na „l” + znak łączący, więc zamieniamy je osobno
  s.toLocaleLowerCase('pl').replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

const parts = (folder: string) => folder.split('/').map((p) => p.trim()).filter(Boolean)
export const topFolder = (folder: string) => parts(folder)[0] ?? ''
export const subFolder = (folder: string) => parts(folder).slice(1).join(' / ')

export interface Section<B> {
  key: string
  name: string
  subjects: Subject[] // przedmioty o tej nazwie (np. wykład i ćwiczenia osobno)
  books: B[]
}

/**
 * Dzieli podręczniki na przedmioty: pierwszy człon folderu na Drive ma być nazwą przedmiotu.
 * Przedmioty o tej samej nazwie (inny rodzaj zajęć) tworzą jedną sekcję, bo podręcznik dotyczy całości.
 */
export function groupTextbooks<B extends BookLike>(books: B[], subjects: Subject[]) {
  const map = new Map<string, Section<B>>()
  for (const s of subjects) {
    const key = norm(s.name)
    const sec = map.get(key) ?? { key, name: s.name, subjects: [], books: [] }
    sec.subjects.push(s)
    map.set(key, sec)
  }

  const general: B[] = []
  const unmatched = new Map<string, { folder: string; books: B[] }>()
  for (const b of books) {
    const top = topFolder(b.folder)
    if (!top) {
      general.push(b)
      continue
    }
    const sec = map.get(norm(top))
    if (sec) sec.books.push(b)
    else {
      const u = unmatched.get(norm(top)) ?? { folder: top, books: [] }
      u.books.push(b)
      unmatched.set(norm(top), u)
    }
  }

  const byTitle = (a: B, b: B) => a.title.localeCompare(b.title, 'pl')
  const sections = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  for (const s of sections) s.books.sort(byTitle)
  return {
    sections,
    general: general.sort(byTitle),
    unmatched: [...unmatched.values()]
      .sort((a, b) => a.folder.localeCompare(b.folder, 'pl'))
      .map((u) => ({ ...u, books: u.books.sort(byTitle) })),
  }
}
