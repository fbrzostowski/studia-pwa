import { useMemo, useState } from 'react'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { useMemberships } from '../groups/hooks'
import { KIND_LABEL } from '../materials/types'
import { useSubjects } from '../materials/useSubjects'
import { fromDateKey, toDateKey } from '../schedule/weeks'
import ExamForm from './ExamForm'
import { countdown, daysUntil, groupExams, splitExams, type ExamSection } from './logic'
import { EXAM_LABEL, EXAM_STYLE, EXAM_TYPES, type Exam, type ExamType } from './types'
import { useExams } from './useExams'

const fmtDate = (k: string) =>
  fromDateKey(k).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

function ExamRow({
  e,
  subjectName,
  todayKey,
  onEdit,
}: {
  e: Exam
  subjectName?: string
  todayKey: string
  onEdit: (e: Exam) => void
}) {
  const { user, profile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const canEdit = profile?.role === 'admin' || e.createdBy === user!.uid
  const n = daysUntil(e.date, todayKey)

  const remove = async () => {
    if (!confirm(`Usunąć termin: ${EXAM_LABEL[e.type]}, ${fmtDate(e.date)}?`)) return
    await deleteDoc(doc(db, 'exams', e.id)).catch((err) => setError(err.message))
  }

  return (
    <div className="border-line rounded-xl border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subjectName && <p className="mb-1 font-medium break-words">{subjectName}</p>}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${EXAM_STYLE[e.type]}`}>{EXAM_LABEL[e.type]}</span>
            <span className="text-sm font-medium">
              {fmtDate(e.date)}
              {e.time && `, ${e.time}`}
            </span>
            <span
              className={`badge ${n >= 0 && n <= 7 ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}
              title={n >= 0 ? 'Do terminu' : 'Minęło'}
            >
              {countdown(n)}
            </span>
          </p>
          {e.room && <p className="text-muted mt-1 text-xs">Sala {e.room}</p>}
          {e.note && <p className="mt-1.5 text-sm whitespace-pre-wrap">{e.note}</p>}
          {e.createdByName && <p className="text-muted mt-1 text-xs">Dodał(a): {e.createdByName}</p>}
        </div>
        {canEdit && (
          <div className="-mt-1 -mr-2 flex shrink-0 flex-col items-end">
            <button className="btn-ghost" onClick={() => onEdit(e)}>
              Edytuj
            </button>
            <button className="btn-danger" onClick={remove}>
              Usuń
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </div>
  )
}

type FormState = { exam?: Exam; sectionKey?: string; type?: ExamType } | null

/** Zaliczenia: wspólne terminy mid-term i final exam per przedmiot, z odliczaniem do najbliższych. */
export default function ExamsPage() {
  const { user } = useAuth()
  const { subjects } = useSubjects()
  const { exams, error } = useExams()
  const memberships = useMemberships()
  const [form, setForm] = useState<FormState>(null)

  const todayKey = toDateKey(new Date())
  const mine = useMemo(
    () => new Set(memberships.filter((m) => m.uid === user!.uid).map((m) => m.subjectId)),
    [memberships, user],
  )
  const sections = useMemo(() => groupExams(subjects, exams, mine), [subjects, exams, mine])
  // formularz pozwala dodać termin do każdego przedmiotu, nie tylko do moich
  const allSections = useMemo(() => groupExams(subjects, exams, new Set(subjects.map((s) => s.id))), [subjects, exams])
  const nameOf = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects])
  const { upcoming, past } = useMemo(() => splitExams(exams.filter((e) => nameOf.has(e.subjectId)), todayKey), [exams, nameOf, todayKey])

  const open = (state: NonNullable<FormState>) => setForm(state)

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Zaliczenia</h2>
        <button className="btn-primary" onClick={() => (form ? setForm(null) : open({}))} disabled={subjects.length === 0}>
          + Termin
        </button>
      </div>

      {subjects.length === 0 && (
        <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
          Najpierw dodaj przedmioty w zakładce Materiały albo zaimportuj plan z USOS.
        </p>
      )}

      {form && (
        <ExamForm
          key={form.exam?.id ?? `${form.sectionKey}-${form.type}`}
          sections={allSections}
          exam={form.exam}
          preset={{ sectionKey: form.sectionKey, type: form.type }}
          onDone={() => setForm(null)}
        />
      )}

      {subjects.length > 0 && (
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
                  <li key={e.id}>
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
                <SubjectCard key={sec.key} sec={{ ...sec, exams: sec.exams.filter((e) => e.date >= todayKey) }} todayKey={todayKey} onAdd={(type) => open({ sectionKey: sec.key, type })} onEdit={(x) => open({ exam: x })} />
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
                  <li key={e.id}>
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
