// Daty w planie to czas lokalny zapisany jako tekst (YYYY-MM-DD…), więc grupujemy po prefiksie
// i nie przechodzimy przez strefy czasowe.

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toLocalIso = (d: Date) => `${toDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fromDateKey = (k: string) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))

export function addDays(d: Date, n: number) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() + n) // kalendarzowo, więc zmiana czasu nie psuje dni
  return r
}

/** Poniedziałek tygodnia, w którym jest data d. */
export function startOfWeek(d: Date) {
  return addDays(d, -((d.getDay() + 6) % 7))
}

/** Klucze dat (YYYY-MM-DD) siedmiu dni tygodnia od poniedziałku. */
export const weekKeys = (monday: Date) => Array.from({ length: 7 }, (_, i) => toDateKey(addDays(monday, i)))
