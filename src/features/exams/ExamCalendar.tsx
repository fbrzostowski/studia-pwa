import { useMemo, useState } from 'react'
import MonthGrid, { dayTitle, monthTitle } from '../../components/MonthGrid'
import { addDays, toDateKey } from '../schedule/weeks'
import ExamRow from './ExamRow'
import { EXAM_DOT, EXAM_LABEL, EXAM_TYPES, type Exam } from './types'

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}

/** Kalendarz miesiąca z terminami mid-term (kropka) i final exam (pigułka); wybór dnia pokazuje jego terminy. */
export default function ExamCalendar({
  exams,
  nameOf,
  todayKey,
  onEdit,
  onAdd,
}: {
  exams: Exam[]
  nameOf: Map<string, string>
  todayKey: string
  onEdit: (e: Exam) => void
  onAdd: (dateKey: string) => void
}) {
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState(todayKey)

  const byDay = useMemo(() => {
    const m = new Map<string, Exam[]>()
    for (const e of exams) m.set(e.date, [...(m.get(e.date) ?? []), e])
    for (const list of m.values()) list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    return m
  }, [exams])

  const step = (dir: -1 | 1) => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
  const dayExams = byDay.get(selected) ?? []

  return (
    <div>
      <div className="flex items-center gap-1">
        <button className="btn-ghost px-2.5" onClick={() => step(-1)} aria-label="Poprzedni miesiąc">
          <Chevron dir="left" />
        </button>
        <h3 className="min-w-0 flex-1 text-center text-base font-semibold tracking-tight">{monthTitle(anchor)}</h3>
        <button className="btn-ghost px-2.5" onClick={() => step(1)} aria-label="Następny miesiąc">
          <Chevron dir="right" />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-muted flex items-center gap-3 text-xs">
          {EXAM_TYPES.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className={`h-2 rounded-full ${EXAM_DOT[t]}`} /> {EXAM_LABEL[t]}
            </span>
          ))}
        </p>
        <button
          className="btn-ghost"
          onClick={() => {
            setAnchor(new Date())
            setSelected(todayKey)
          }}
        >
          Dziś
        </button>
      </div>

      <MonthGrid
        anchor={anchor}
        selected={selected}
        todayKey={todayKey}
        onSelect={setSelected}
        cell={(k) => {
          const list = byDay.get(k) ?? []
          return {
            label: list.length ? `${list.length} zaliczeń: ${list.map((e) => EXAM_LABEL[e.type]).join(', ')}` : 'brak terminów',
            markers: list.slice(0, 4).map((e) => (
              <span
                key={e.id}
                className={`h-1.5 rounded-full ${EXAM_DOT[e.type]}`}
              />
            )),
          }
        }}
      />

      <section className="mt-5" aria-live="polite">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          {dayTitle(selected)}
          {selected === todayKey && <span className="badge bg-accent text-white">Dziś</span>}
          {selected === toDateKey(addDays(new Date(), 1)) && <span className="badge bg-accent-soft text-accent">Jutro</span>}
        </h3>
        {dayExams.length === 0 ? (
          <p className="text-muted text-sm">Brak terminów tego dnia.</p>
        ) : (
          <ul className="space-y-2">
            {dayExams.map((e) => (
              <li key={e.id} className="bg-surface rounded-xl">
                <ExamRow e={e} subjectName={nameOf.get(e.subjectId)} todayKey={todayKey} onEdit={onEdit} />
              </li>
            ))}
          </ul>
        )}
        <button className="btn-secondary mt-3" onClick={() => onAdd(selected)}>
          + Dodaj termin tego dnia
        </button>
      </section>
    </div>
  )
}
