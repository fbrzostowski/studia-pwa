/** Porównywanie nazw bez wielkości liter, polskich znaków i nadmiarowych spacji. */
export const norm = (s: string) =>
  // ł nie rozkłada się w Unicode na „l” + znak łączący, więc zamieniamy je osobno
  s.toLocaleLowerCase('pl').replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim()
