import { fromDateKey } from '../schedule/weeks'
import { examScope, scopeTitle } from './groups'
import { countdown, daysUntil } from './logic'
import { EXAM_LABEL, EXAM_STYLE, type Exam } from './types'
import { SubjectLink } from '../subject/SubjectPageContext'

export const fmtDate = (k: string) =>
  fromDateKey(k).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export default function ExamRow({
  e,
  subjectName,
  emoji,
  todayKey,
  onOpen,
}: {
  e: Exam
  subjectName?: string
  emoji?: string
  todayKey: string
  onOpen: (e: Exam) => void
}) {
  const n = daysUntil(e.date, todayKey)

  return (
    <div
      className="border-line cursor-pointer rounded-xl border p-3 transition-colors hover:bg-bg"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(e)}
      onKeyDown={(ev) => {
        if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
          ev.preventDefault()
          onOpen(e)
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subjectName && (
            <p className="mb-1 font-medium break-words">
              {emoji && <span aria-hidden="true" className="mr-1.5">{emoji}</span>}
              <span onClick={(ev) => ev.stopPropagation()}>
                <SubjectLink id={e.subjectId}>{subjectName}</SubjectLink>
              </span>
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${EXAM_STYLE[e.type]}`}>{EXAM_LABEL[e.type]}</span>
            {e.onlyFor ? (
              <span className="badge bg-accent-soft text-accent">Tylko Ty</span>
            ) : (
              examScope(e) && <span className="badge bg-accent-soft text-accent">{scopeTitle(examScope(e)!)}</span>
            )}
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
      </div>
    </div>
  )
}

