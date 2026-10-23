import { useMemo, useState } from 'react'
import { useSubjects } from './useSubjects'
import { useLessonNotes } from './useLessonNotes'
import LessonCard, { FORM_DOT, lessonKey, noteLessonKey } from './LessonCard'
import type { Material } from './types'
import { findSubjectForEvent } from '../schedule/match'
import type { IcsEvent } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'
import { addDays, fromDateKey, monthWeeks, startOfWeek, toDateKey, weekKeys } from '../schedule/weeks'

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const dayTitle = (k: string) =>
  cap(fromDateKey(k).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }))

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}

/** Kalendarz lekcji z planu (domyślnie miesiąc) z notatkami podpiętymi do poszczególnych lekcji. */
export default function CalendarView({ onOpenSubject }: { onOpenSubject: (id: string) => void }) {
  const events = usePlanEvents()
  const { subjects } = useSubjects()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => toDateKey(new Date()))

  const todayKey = toDateKey(new Date())
  const weeks = useMemo(() => monthWeeks(anchor.getFullYear(), anchor.getMonth()), [anchor])
  const weekDays = useMemo(() => weekKeys(startOfWeek(anchor)), [anchor])
  const shown = mode === 'month' ? weeks.flat() : weekDays
  const notes = useLessonNotes(shown[0], shown[shown.length - 1])

  const byDay = useMemo(() => {
    const m = new Map<string, IcsEvent[]>()
    for (const e of events ?? []) {
      const k = e.start.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    for (const list of m.values()) list.sort((a, b) => a.start.localeCompare(b.start))
    return m
  }, [events])

  const notesByLesson = useMemo(() => {
    const m = new Map<string, Material[]>()
    for (const n of notes) {
      const k = noteLessonKey(n)
      if (k) m.set(k, [...(m.get(k) ?? []), n])
    }
    return m
  }, [notes])

  const lessonNotes = (e: IcsEvent) => {
    const s = findSubjectForEvent(subjects, e)
    return s ? (notesByLesson.get(lessonKey(s.id, e.form, e.group, e.start.slice(0, 10))) ?? []) : []
  }
  const dayNoteCount = (k: string) => (byDay.get(k) ?? []).reduce((n, e) => n + lessonNotes(e).length, 0)

  const step = (dir: -1 | 1) => {
    if (mode === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1))
    else setAnchor(addDays(anchor, dir * 7))
  }
  const goToday = () => {
    setAnchor(new Date())
    setSelected(todayKey)
  }

  const title =
    mode === 'month'
      ? cap(anchor.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }))
      : `${fromDateKey(weekDays[0]).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} – ${fromDateKey(weekDays[6]).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}`

  const renderLessons = (k: string) => {
    const list = byDay.get(k) ?? []
    if (list.length === 0) return <p className="text-muted text-sm">Brak zajęć.</p>
    return (
      <ul className="space-y-2">
        {list.map((e, i) => (
          <li key={`${e.start}-${e.code}-${e.form}-${i}`}>
            <LessonCard e={e} subject={findSubjectForEvent(subjects, e)} notes={lessonNotes(e)} onOpenSubject={onOpenSubject} />
          </li>
        ))}
      </ul>
    )
  }

  if (events === undefined) return <p className="text-muted">Ładowanie…</p>

  if (events === null) {
    return (
      <div className="border-line rounded-2xl border border-dashed p-8 text-center">
        <p className="font-medium">Kalendarz korzysta z Twojego planu zajęć</p>
        <p className="text-muted mx-auto mt-1 max-w-sm text-sm">
          Zaimportuj plik .ics z USOS w zakładce Plan, a lekcje pojawią się tutaj i będzie można podpinać do nich notatki.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <button className="btn-ghost px-2.5" onClick={() => step(-1)} aria-label={mode === 'month' ? 'Poprzedni miesiąc' : 'Poprzedni tydzień'}>
          <Chevron dir="left" />
        </button>
        <h2 className="min-w-0 flex-1 text-center text-base font-semibold tracking-tight">{title}</h2>
        <button className="btn-ghost px-2.5" onClick={() => step(1)} aria-label={mode === 'month' ? 'Następny miesiąc' : 'Następny tydzień'}>
          <Chevron dir="right" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="bg-bg border-line flex gap-1 rounded-xl border p-1" role="group" aria-label="Widok kalendarza">
          {(
            [
              ['month', 'Miesiąc'],
              ['week', 'Tydzień'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className="text-muted aria-pressed:bg-surface aria-pressed:text-text rounded-lg px-3 py-1 text-sm font-medium aria-pressed:shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={goToday}>
          Dziś
        </button>
      </div>

      {mode === 'month' ? (
        <>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {DAYS.map((d) => (
              <div key={d} className="text-muted py-1 text-xs font-medium">
                {d}
              </div>
            ))}
            {weeks.flat().map((k) => {
              const lessons = byDay.get(k) ?? []
              const inMonth = fromDateKey(k).getMonth() === anchor.getMonth()
              const n = dayNoteCount(k)
              return (
                <button
                  key={k}
                  onClick={() => setSelected(k)}
                  aria-pressed={selected === k}
                  aria-label={`${dayTitle(k)}: ${lessons.length} zajęć${n ? `, ${n} notatek` : ''}`}
                  className={`border-line relative flex min-h-14 flex-col items-center gap-1 rounded-xl border px-0.5 py-1.5 text-sm transition aria-pressed:border-accent aria-pressed:bg-accent-soft ${inMonth ? 'bg-surface' : 'bg-transparent opacity-45'}`}
                >
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 ${k === todayKey ? 'bg-accent font-semibold text-white' : ''}`}
                  >
                    {+k.slice(8)}
                  </span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {lessons.slice(0, 4).map((e, i) => (
                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${FORM_DOT[e.form] ?? 'bg-gray-400'}`} />
                    ))}
                  </span>
                  {n > 0 && (
                    <span className="bg-accent absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white">
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <section className="mt-5" aria-live="polite">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {dayTitle(selected)}
              {selected === todayKey && <span className="badge bg-accent text-white">Dziś</span>}
            </h3>
            {renderLessons(selected)}
          </section>
        </>
      ) : (
        <div className="mt-4 space-y-5">
          {weekDays.map((k) => (
            <section key={k}>
              <h3 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${k === todayKey ? 'text-accent' : 'text-muted'}`}>
                {dayTitle(k)}
                {k === todayKey && <span className="badge bg-accent text-white">Dziś</span>}
              </h3>
              {renderLessons(k)}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
