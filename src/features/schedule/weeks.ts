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

/**
 * Dni z zajęciami od dziś (YYYY-MM-DD, rosnąco). Dzisiejszy dzień tylko wtedy, gdy któreś
 * zajęcia jeszcze się nie skończyły — po ostatnich zajęciach lista zaczyna się od jutra.
 */
export function upcomingDayKeys(events: { start: string; end: string }[], now: string) {
  const today = now.slice(0, 10)
  const days = new Set<string>()
  for (const e of events) {
    const k = e.start.slice(0, 10)
    if (k > today || (k === today && e.end > now)) days.add(k)
  }
  return [...days].sort()
}
