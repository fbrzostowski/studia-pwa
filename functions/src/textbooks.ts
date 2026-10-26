// Czysta logika podręczników (bez wywołań usług Google) — testowana w tests/textbooksNames.test.ts.

/** Nazwy porównujemy bez wielkości liter, polskich znaków i nadmiarowych spacji (jak w aplikacji). */
export const norm = (s: string) =>
  // ł nie rozkłada się w Unicode na „l” + znak łączący, więc zamieniamy je osobno
  s.toLocaleLowerCase('pl').replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()

/** Poprawna nazwa przedmiotu lub podfolderu albo null. */
export function validFolderName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.trim().replace(/\s+/g, ' ')
  if (n.length < 1 || n.length > 100) return null
  if (/[/\\]/.test(n) || n === '.' || n === '..') return null
  return n
}

/** Nazwa pliku w Storage: bez znaków specjalnych, polskie litery zostają. */
export const fileNameFor = (name: string) => name.replace(/[^\p{L}\p{N}._ -]+/gu, '_').trim() || 'plik'

export const storagePathFor = (id: string, name: string) => `textbooks/${id}/${fileNameFor(name)}`

/** Tytuł do wyświetlenia: nazwa pliku bez rozszerzenia. */
export const titleOf = (name: string) => name.replace(/\.[^./\\]{1,5}$/, '').trim() || name

export const findByName = <T extends { name: string }>(list: T[], name: string) =>
  list.find((x) => norm(x.name) === norm(name))

/** Ścieżka grupy w aplikacji: „Przedmiot” albo „Przedmiot / Podfolder”. */
export const folderPath = (subject: string, subfolder: string | null) =>
  subfolder ? `${subject} / ${subfolder}` : subject
