import { useMemo, useState } from 'react'
import Sheet from '../../components/Sheet'
import { useAuth } from '../../firebase/AuthContext'
import { useMemberships } from '../groups/hooks'
import { KIND_LABEL } from '../materials/types'
import { useSubjects } from '../materials/useSubjects'
import { toDateKey } from '../schedule/weeks'
import ExamCalendar from './ExamCalendar'
import ExamForm from './ExamForm'
import ExamRow from './ExamRow'
import { groupExams, splitExams, type ExamSection } from './logic'
import TodoLists from './TodoLists'
import { EXAM_LABEL, EXAM_STYLE, EXAM_TYPES, type Exam, type ExamType } from './types'
import { useExams } from './useExams'

type View = 'calendar' | 'list' | 'todo'
type FormState = { exam?: Exam; sectionKey?: string; type?: ExamType; date?: string } | null

const VIEWS: [View, string][] = [
  ['calendar', 'Kalendarz'],
  ['list', 'Lista'],
  ['todo', 'Do nauki'],
]

/** Zaliczenia: terminy mid-term i final exam (kalendarz i lista) oraz prywatne listy do nauki. */
export default function ExamsPage() {
  const { user } = useAuth()
  const { subjects } = useSubjects()
  const { exams, error } = useExams()
  const memberships = useMemberships()
  const [view, setView] = useState<View>('calendar')
  const [form, setForm] = useState<FormState>(null)

  const todayKey = toDateKey(new Date())
  const mine = useMemo(
    () => new Set(memberships.filter((m) => m.uid === user!.uid).map((m) => m.subjectId)),
    [memberships, user],
  )
  const sections = useMemo(() => groupExams(subjects, exams, mine), [subjects, exams, mine])
  // formularze pozwalają wybrać każdy przedmiot, nie tylko moje
  const allSections = useMemo(() => groupExams(subjects, exams, new Set(subjects.map((s) => s.id))), [subjects, exams])
  const nameOf = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])
  const known = useMemo(() => exams.filter((e) => nameOf.has(e.subjectId)), [exams, nameOf])
  const { upcoming, past } = useMemo(() => splitExams(known, todayKey), [known, todayKey])

  const open = (state: NonNullable<FormState>) => {
    if (view === 'todo') setView('calendar')
    setForm(state)
  }

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Zaliczenia</h2>
        {view !== 'todo' && (
          <button className="btn-primary" onClick={() => (form ? setForm(null) : open({}))} disabled={subjects.length === 0}>
            + Termin
          </button>
        )}
      </div>

      <div className="bg-bg border-line mt-3 flex gap-1 rounded-xl border p-1" role="group" aria-label="Widok zaliczeń">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className="text-muted aria-pressed:bg-surface aria-pressed:text-text flex-1 rounded-lg px-3 py-1.5 text-sm font-medium aria-pressed:shadow-sm"
          >
            {label}
          </button>
        ))}
      </div>

      {subjects.length === 0 && (
        <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
          Najpierw dodaj przedmioty w zakładce Materiały albo zaimportuj plan z USOS.
        </p>
      )}

      <Sheet
        open={!!form && view !== 'todo'}
        title={form?.exam ? 'Edytuj termin' : 'Dodaj termin zaliczenia'}
        onClose={() => setForm(null)}
      >
        {form && view !== 'todo' && (
          <ExamForm
            key={form.exam?.id ?? `${form.sectionKey}-${form.type}-${form.date}`}
            sections={allSections}
            exam={form.exam}
            preset={{ sectionKey: form.sectionKey, type: form.type, date: form.date }}
            onDone={() => setForm(null)}
          />
        )}
      </Sheet>

      {subjects.length > 0 && view === 'calendar' && (
        <div className="mt-4">
          <ExamCalendar
            exams={known}
            nameOf={nameOf}
            todayKey={todayKey}
            onEdit={(x) => open({ exam: x })}
            onAdd={(date) => open({ date })}
          />
        </div>
      )}

      {subjects.length > 0 && view === 'todo' && (
        <div className="mt-4">
          <TodoLists sections={allSections} />
        </div>
      )}

      {subjects.length > 0 && view === 'list' && (
        <>
          <section className="mt-6">
            <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Najbliższe</h3>
            {upcoming.length === 0 ? (
              <p className="border-line text-muted rounded-2xl border border-dashed p-6 text-center text-sm">
                Brak nadchodzących terminów. Dodaj pierwszy przyciskiem „+ Termin”.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.slice(0, 5).map((e) => (
                  <li key={e.id} className="bg-surface rounded-xl">
                    <ExamRow e={e} subjectName={nameOf.get(e.subjectId)} todayKey={todayKey} onEdit={(x) => open({ exam: x })} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Przedmioty</h3>
            <ul className="space-y-3">
              {sections.map((sec) => (
                <SubjectCard
                  key={sec.key}
                  sec={{ ...sec, exams: sec.exams.filter((e) => e.date >= todayKey) }}
                  todayKey={todayKey}
                  onAdd={(type) => open({ sectionKey: sec.key, type })}
                  onEdit={(x) => open({ exam: x })}
                />
              ))}
              {sections.length === 0 && (
                <li className="text-muted text-sm">Nie należysz jeszcze do żadnego przedmiotu — zaimportuj plan w zakładce Plan.</li>
              )}
            </ul>
          </section>

          {past.length > 0 && (
            <details className="mt-8">
              <summary className="text-muted cursor-pointer text-xs font-semibold tracking-wide uppercase">
                Minione ({past.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {past.map((e) => (
                  <li key={e.id} className="bg-surface rounded-xl">
                    <ExamRow e={e} subjectName={nameOf.get(e.subjectId)} todayKey={todayKey} onEdit={(x) => open({ exam: x })} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function SubjectCard({
  sec,
  todayKey,
  onAdd,
  onEdit,
}: {
  sec: ExamSection
  todayKey: string
  onAdd: (type: ExamType) => void
  onEdit: (e: Exam) => void
}) {
  return (
    <li className="card p-4">
      <h4 className="flex flex-wrap items-center gap-2 font-semibold">
        {sec.name}
        {[...new Set(sec.subjects.map((s) => s.kind))].map((k) => (
          <span key={k} className="badge bg-accent-soft text-accent" title={KIND_LABEL[k]}>
            {k}
          </span>
        ))}
      </h4>
      <div className="mt-3 space-y-3">
        {EXAM_TYPES.map((t) => {
          const list = sec.exams.filter((e) => e.type === t)
          return (
            <div key={t}>
              <div className="flex items-center justify-between gap-2">
                <span className={`badge ${EXAM_STYLE[t]}`}>{EXAM_LABEL[t]}</span>
                <button className="btn-ghost -mr-2 min-h-8 py-1 text-xs" onClick={() => onAdd(t)}>
                  + Dodaj termin
                </button>
              </div>
              {list.length === 0 ? (
                <p className="text-muted mt-1.5 text-sm">Brak terminu.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {list.map((e) => (
                    <li key={e.id}>
                      <ExamRow e={e} todayKey={todayKey} onEdit={onEdit} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </li>
  )
}
