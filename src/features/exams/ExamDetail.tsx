import { useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { useMemberships } from '../groups/hooks'
import { SubjectLink } from '../subject/SubjectPageContext'
import { examScope, groupsOf, myGroups, sameScope, scopeTitle, type Scope } from './groups'
import { countdown, daysUntil, type ExamSection } from './logic'
import { fmtDate } from './ExamRow'
import { EXAM_LABEL, EXAM_STYLE, type Exam } from './types'

/** Szczegóły terminu w oknie: dane, grupy objęte terminem (dodawanie/odznaczanie), edycja i usunięcie. */
export default function ExamDetail({
  exam,
  section,
  allExams,
  emoji,
  todayKey,
  onEdit,
  onClose,
}: {
  exam: Exam
  section?: Pick<ExamSection, 'subjects'>
  allExams: Exam[] // wszystkie terminy (także innych grup), żeby znaleźć „bliźniacze” wpisy tego samego terminu
  emoji?: string
  todayKey: string
  onEdit: (e: Exam) => void
  onClose: () => void
}) {
  const { user, profile } = useAuth()
  const memberships = useMemberships()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = profile?.role === 'admin'
  const canEdit = isAdmin || exam.createdBy === user!.uid
  const n = daysUntil(exam.date, todayKey)

  const subjectIds = useMemo(() => new Set((section?.subjects ?? []).map((s) => s.id)), [section])
  const groups = useMemo(() => groupsOf(memberships, subjectIds), [memberships, subjectIds])
  const mine = useMemo(() => myGroups(memberships, subjectIds, user!.uid), [memberships, subjectIds, user])

  // ten sam termin dla innych grup = wpisy o tym samym przedmiocie, rodzaju, dacie i godzinie
  const siblings = useMemo(
    () =>
      allExams.filter(
        (x) =>
          subjectIds.has(x.subjectId) &&
          !x.onlyFor &&
          x.type === exam.type &&
          x.date === exam.date &&
          (x.time ?? '') === (exam.time ?? ''),
      ),
    [allExams, subjectIds, exam],
  )
  const wholeSubject = siblings.some((x) => !examScope(x))
  const grouped = !exam.onlyFor && !!examScope(exam) // da się zarządzać grupami
  const entryFor = (g: Scope) => siblings.find((x) => { const s = examScope(x); return s && sameScope(s, g) })

  const toggle = async (g: Scope) => {
    const existing = entryFor(g)
    setBusy(`${g.form}|${g.group}`)
    setError(null)
    try {
      if (existing) {
        if (siblings.filter((x) => examScope(x)).length <= 1) throw new Error('Termin musi mieć co najmniej jedną grupę. Użyj „Usuń termin”.')
        await deleteDoc(doc(db, 'exams', existing.id))
      } else {
        await addDoc(collection(db, 'exams'), {
          subjectId: exam.subjectId,
          type: exam.type,
          date: exam.date,
          ...(exam.time ? { time: exam.time } : {}),
          ...(exam.room ? { room: exam.room } : {}),
          ...(exam.note ? { note: exam.note } : {}),
          form: g.form,
          group: g.group,
          createdBy: user!.uid,
          createdByName: memberName(profile!).slice(0, 60),
          createdAt: serverTimestamp(),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!confirm(`Usunąć termin: ${EXAM_LABEL[exam.type]}, ${fmtDate(exam.date)}?`)) return
    try {
      await deleteDoc(doc(db, 'exams', exam.id))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const subject = section?.subjects[0]
  return (
    <div className="space-y-4">
      <div>
        {subject && (
          <p className="mb-1.5 font-medium break-words">
            {emoji && <span aria-hidden="true" className="mr-1.5">{emoji}</span>}
            <SubjectLink id={exam.subjectId}>{subject.name}</SubjectLink>
          </p>
        )}
        <p className="flex flex-wrap items-center gap-2">
          <span className={`badge ${EXAM_STYLE[exam.type]}`}>{EXAM_LABEL[exam.type]}</span>
          {exam.onlyFor && <span className="badge bg-accent-soft text-accent">Tylko Ty</span>}
          <span className={`badge ${n >= 0 && n <= 7 ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}>{countdown(n)}</span>
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Data</dt>
        <dd className="font-medium">{fmtDate(exam.date)}</dd>
        <dt className="text-muted">Godzina</dt>
        <dd>{exam.time ?? 'nie podano'}</dd>
        <dt className="text-muted">Sala</dt>
        <dd>{exam.room ?? 'nie podano'}</dd>
        {exam.createdByName && (
          <>
            <dt className="text-muted">Dodał(a)</dt>
            <dd>{exam.createdByName}</dd>
          </>
        )}
      </dl>
      {exam.note && <p className="bg-bg rounded-xl p-3 text-sm whitespace-pre-wrap">{exam.note}</p>}

      <section>
        <h3 className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Grupy z tym terminem</h3>
        {exam.onlyFor ? (
          <p className="text-muted text-sm">Termin prywatny — widzisz go tylko Ty.</p>
        ) : wholeSubject ? (
          <p className="text-sm">Cały przedmiot (wszystkie grupy).</p>
        ) : grouped ? (
          groups.length === 0 ? (
            <p className="text-muted text-sm">{scopeTitle(examScope(exam)!)}</p>
          ) : (
            <ul className="space-y-1">
              {groups.map((g) => {
                const entry = entryFor(g)
                const k = `${g.form}|${g.group}`
                const disabled = busy !== null || (!!entry && entry.createdBy !== user!.uid && !isAdmin)
                return (
                  <li key={k}>
                    <label className={`flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        className="accent-accent h-5 w-5"
                        checked={!!entry}
                        disabled={disabled}
                        onChange={() => toggle(g)}
                      />
                      <span>
                        {scopeTitle(g)}
                        {mine.some((m) => sameScope(m, g)) && <span className="text-muted"> (Twoja grupa)</span>}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )
        ) : null}
        {grouped && !wholeSubject && (
          <p className="text-muted mt-1 text-xs">Zaznacz grupę, aby dodać jej ten sam termin; odznaczyć można wpisy, które sam(a) dodałeś(aś).</p>
        )}
      </section>

      {error && <p className="text-danger text-sm">{error}</p>}
      {canEdit && (
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => onEdit(exam)}>
            Edytuj
          </button>
          <button className="btn-danger" onClick={remove}>
            Usuń termin
          </button>
        </div>
      )}
    </div>
  )
}
