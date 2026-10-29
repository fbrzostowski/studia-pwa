import { useMemo, useState } from 'react'
import Sheet from '../../components/Sheet'
import { useAuth } from '../../firebase/AuthContext'
import { useMemberships } from '../groups/hooks'
import { useSubjects } from '../materials/useSubjects'
import { toDateKey } from '../schedule/weeks'
import ExamCalendar from './ExamCalendar'
import ExamForm from './ExamForm'
import ExamRow from './ExamRow'
import { groupExams, splitExams } from './logic'
import TodoLists from './TodoLists'
import { type Exam, type ExamType } from './types'
import { useExams } from './useExams'
import { myGroups, relevantFor } from './groups'
import { norm } from '../../lib/text'

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
  const [otherGroups, setOtherGroups] = useState(false) // pokaż też terminy grup, do których nie należę

  const todayKey = toDateKey(new Date())
  // formularze pozwalają wybrać każdy przedmiot, nie tylko moje
  const allSections = useMemo(() => groupExams(subjects, exams, new Set(subjects.map((s) => s.id))), [subjects, exams])
  const nameOf = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])
  const emojiOf = useMemo(() => new Map(subjects.flatMap((s) => (s.emoji ? [[s.id, s.emoji] as const] : []))), [subjects])
  const known = useMemo(() => exams.filter((e) => nameOf.has(e.subjectId)), [exams, nameOf])
  // Domyślnie tylko terminy dla mnie: cały przedmiot, moje grupy i moje prywatne. Grupy liczymy po wszystkich
  // przedmiotach o tej samej nazwie (wykład i ćwiczenia to osobne przedmioty jednego kursu).
  const relevant = useMemo(() => {
    const idsByName = new Map<string, Set<string>>()
    for (const sub of subjects) idsByName.set(norm(sub.name), (idsByName.get(norm(sub.name)) ?? new Set()).add(sub.id))
    const cache = new Map<string, ReturnType<typeof myGroups>>()
    const groupsFor = (subjectId: string) => {
      const key = norm(nameOf.get(subjectId) ?? '')
      if (!cache.has(key)) cache.set(key, myGroups(memberships, idsByName.get(key) ?? new Set(), user!.uid))
      return cache.get(key)!
    }
    return known.filter((e) => relevantFor(e, groupsFor(e.subjectId)))
  }, [known, subjects, nameOf, memberships, user])
  const shownExams = otherGroups ? known : relevant
  const hiddenCount = known.length - relevant.length
  const { upcoming, past } = useMemo(() => splitExams(shownExams, todayKey), [shownExams, todayKey])

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

      {view !== 'todo' && (hiddenCount > 0 || otherGroups) && (
        <label className="text-muted mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={otherGroups} onChange={(e) => setOtherGroups(e.target.checked)} />
          Pokaż też terminy innych grup{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
        </label>
      )}

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
            exams={shownExams}
            nameOf={nameOf}
            emojiOf={emojiOf}
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
            <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">Nadchodzące</h3>
            {upcoming.length === 0 ? (
              <p className="border-line text-muted rounded-2xl border border-dashed p-6 text-center text-sm">
                Brak nadchodzących terminów. Dodaj pierwszy przyciskiem „+ Termin”.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e) => (
                  <li key={e.id} className="bg-surface rounded-xl">
                    <ExamRow e={e} subjectName={nameOf.get(e.subjectId)} emoji={emojiOf.get(e.subjectId)} todayKey={todayKey} onEdit={(x) => open({ exam: x })} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <details className="mt-8">
              <summary className="text-muted cursor-pointer text-xs font-semibold tracking-wide uppercase">
                Minione ({past.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {past.map((e) => (
                  <li key={e.id} className="bg-surface rounded-xl">
                    <ExamRow e={e} subjectName={nameOf.get(e.subjectId)} emoji={emojiOf.get(e.subjectId)} todayKey={todayKey} onEdit={(x) => open({ exam: x })} />
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
