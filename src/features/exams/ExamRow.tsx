import { useState } from 'react'
import { deleteDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { fromDateKey } from '../schedule/weeks'
import { countdown, daysUntil } from './logic'
import { EXAM_LABEL, EXAM_STYLE, type Exam } from './types'
import { SubjectLink } from '../subject/SubjectPageContext'

export const fmtDate = (k: string) =>
  fromDateKey(k).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export default function ExamRow({
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
          {subjectName && (
            <p className="mb-1 font-medium break-words">
              <SubjectLink id={e.subjectId}>{subjectName}</SubjectLink>
            </p>
          )}
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

