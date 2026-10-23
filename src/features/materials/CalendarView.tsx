import { useMemo, useState } from 'react'
import { useSubjects } from './useSubjects'
import { useMemberships } from '../groups/hooks'
import { EXAM_LABEL, EXAM_STYLE, type Exam } from '../exams/types'
import { useExams } from '../exams/useExams'
import { useAuth } from '../../firebase/AuthContext'
import { norm } from '../../lib/text'
import { useLessonNotes } from './useLessonNotes'
import MonthGrid, { dayTitle } from '../../components/MonthGrid'
import LessonCard, { FORM_DOT, lessonKey, noteLessonKey } from './LessonCard'
import type { Material } from './types'
import { findSubjectForEvent } from '../schedule/match'
import type { IcsEvent } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'
import { addDays, fromDateKey, monthWeeks, startOfWeek, toDateKey, weekKeys } from '../schedule/weeks'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
  const { user } = useAuth()
  const { exams } = useExams()
  const memberships = useMemberships()
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

  // Terminy zaliczeń przedmiotów, do których należę (po nazwie, bo egzamin dotyczy całego przedmiotu).
  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])
  const examsByDay = useMemo(() => {
    const mine = new Set(
      memberships
        .filter((m) => m.uid === user!.uid)
        .map((m) => subjectName.get(m.subjectId))
        .filter((n): n is string => !!n)
        .map(norm),
    )
    const m = new Map<string, Exam[]>()
    for (const e of exams) {
      const name = subjectName.get(e.subjectId)
      if (!name || !mine.has(norm(name))) continue
      m.set(e.date, [...(m.get(e.date) ?? []), e])
    }
    for (const list of m.values()) list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    return m
  }, [exams, memberships, subjectName, user])

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
    const dayExams = examsByDay.get(k) ?? []
    if (list.length === 0 && dayExams.length === 0) return <p className="text-muted text-sm">Brak zajęć.</p>
    return (
      <ul className="space-y-2">
        {dayExams.map((x) => (
          <li key={x.id} className="card flex items-start gap-3 border-l-4 border-l-rose-500 p-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`badge ${EXAM_STYLE[x.type]}`}>{EXAM_LABEL[x.type]}</span>
                <span className="font-medium break-words">{subjectName.get(x.subjectId)}</span>
              </p>
              <p className="text-muted mt-1 text-xs">
                {[x.time, x.room && `sala ${x.room}`].filter(Boolean).join(' · ') || 'Cały dzień'}
              </p>
              {x.note && <p className="mt-1 text-sm whitespace-pre-wrap">{x.note}</p>}
            </div>
          </li>
        ))}
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
          <MonthGrid
            anchor={anchor}
            selected={selected}
            todayKey={todayKey}
            onSelect={setSelected}
            cell={(k) => {
              const lessons = byDay.get(k) ?? []
              const dayExams = examsByDay.get(k) ?? []
              const n = dayNoteCount(k)
              return {
                label: `${lessons.length} zajęć${n ? `, ${n} notatek` : ''}${dayExams.length ? `, ${dayExams.length} zaliczeń` : ''}`,
                badge: n,
                markers: (
                  <>
                    {lessons.slice(0, 4).map((e, i) => (
                      <span key={i} className={`h-1.5 w-1.5 rounded-full ${FORM_DOT[e.form] ?? 'bg-gray-400'}`} />
                    ))}
                    {dayExams.length > 0 && <span className="h-1.5 w-3 rounded-full bg-rose-500" title="Zaliczenie" />}
                  </>
                ),
              }
            }}
          />

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
