import type { ReactNode } from 'react'
import { fromDateKey, monthWeeks } from '../features/schedule/weeks'

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const dayTitle = (k: string) =>
  cap(fromDateKey(k).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }))

export const monthTitle = (d: Date) => cap(d.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }))

export interface CellInfo {
  markers?: ReactNode // kropki/znaczniki pod numerem dnia
  badge?: number // licznik w rogu
  label?: string // opis dla czytników ekranu (po dacie)
  tint?: string // klasy tła i ramki całej komórki (np. dzień z zaliczeniem); zastępują domyślne tło
}

/** Siatka miesiąca (od poniedziałku) z wyborem dnia; zawartość komórek dostarcza `cell`. */
export default function MonthGrid({
  anchor,
  selected,
  todayKey,
  onSelect,
  cell,
}: {
  anchor: Date
  selected: string
  todayKey: string
  onSelect: (key: string) => void
  cell: (key: string) => CellInfo
}) {
  const keys = monthWeeks(anchor.getFullYear(), anchor.getMonth()).flat()

  return (
    <div className="mt-3 grid grid-cols-7 gap-1 text-center">
      {DAYS.map((d) => (
        <div key={d} className="text-muted py-1 text-xs font-medium">
          {d}
        </div>
      ))}
      {keys.map((k) => {
        const inMonth = fromDateKey(k).getMonth() === anchor.getMonth()
        const { markers, badge, label, tint } = cell(k)
        return (
          <button
            key={k}
            onClick={() => onSelect(k)}
            aria-pressed={selected === k}
            aria-label={`${dayTitle(k)}${label ? `: ${label}` : ''}`}
            className={`border-line relative flex min-h-14 flex-col items-center gap-1 rounded-xl border px-0.5 py-1.5 text-sm transition aria-pressed:border-accent ${tint ? 'aria-pressed:ring-accent aria-pressed:ring-2' : 'aria-pressed:bg-accent-soft'} ${inMonth ? (tint ?? 'bg-surface') : 'bg-transparent opacity-45'}`}
          >
            <span
              className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 ${k === todayKey ? 'bg-accent font-semibold text-white' : ''}`}
            >
              {+k.slice(8)}
            </span>
            <span className="flex flex-wrap justify-center gap-0.5">{markers}</span>
            {!!badge && badge > 0 && (
              <span className="bg-accent absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
