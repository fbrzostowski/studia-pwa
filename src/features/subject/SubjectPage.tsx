import { useMemo, useState } from 'react'
import Avatar from '../../components/Avatar'
import EmojiPicker from '../../components/EmojiPicker'
import SubjectIcon from '../../components/SubjectIcon'
import { useAuth } from '../../firebase/AuthContext'
import { plural } from '../../lib/plural'
import SubjectGroups from '../groups/SubjectGroups'
import { useClassDocs, useMemberships } from '../groups/hooks'
import { KIND_LABEL, type Subject } from '../materials/types'
import { setSubjectEmoji, useSubjects } from '../materials/useSubjects'
import { academicHours, fmtHours, summarizeHours } from '../schedule/hours'
import { findSubjectForEvent } from '../schedule/match'
import { classKey, normGroup, summarizeClasses, type IcsEvent } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'
import { useLiveSubjects } from '../schedule/useLive'
import { fromDateKey, toLocalIso } from '../schedule/weeks'

const FORM_TITLE: Record<string, string> = { WYK: 'Wykłady', CW: 'Ćwiczenia', KON: 'Konwersatorium', LAB: 'Laboratorium' }

const day = (key: string, long = false) =>
  fromDateKey(key).toLocaleDateString('pl-PL', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' })

/**
 * Strona przedmiotu: ikona (zmienialna), godziny w semestrze z planu, najbliższe zajęcia,
 * kto jeszcze jest w Twoich grupach oraz skrót do materiałów. Otwiera się z każdego miejsca z przedmiotem.
 */
export default function SubjectPage({
  subjectId,
  onBack,
  onOpenMaterials,
}: {
  subjectId: string
  onBack: () => void
  onOpenMaterials: () => void
}) {
  const { subjects } = useSubjects()
  const subject = subjects.find((s) => s.id === subjectId)
  const events = usePlanEvents()
  if (!subject) {
    return (
      <div>
        <BackButton onBack={onBack} />
        <p className="text-muted mt-4 text-sm">{subjects.length === 0 ? 'Ładowanie…' : 'Ten przedmiot już nie istnieje.'}</p>
      </div>
    )
  }
  return <Page subject={subject} events={events ?? []} onBack={onBack} onOpenMaterials={onOpenMaterials} />
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="btn-ghost -ml-3 gap-1" onClick={onBack}>
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Wstecz
    </button>
  )
}

function Page({
  subject,
  events,
  onBack,
  onOpenMaterials,
}: {
  subject: Subject
  events: IcsEvent[]
  onBack: () => void
  onOpenMaterials: () => void
}) {
  const { user } = useAuth()
  const memberships = useMemberships()
  const classDocs = useClassDocs()
  const live = useLiveSubjects([subject]).get(subject.id)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const now = toLocalIso(new Date())

  // Tylko zajęcia z Twojego planu, które należą do tego przedmiotu.
  const mine = useMemo(() => events.filter((e) => findSubjectForEvent([subject], e)?.id === subject.id), [events, subject])
  const hours = useMemo(() => summarizeHours(mine, now), [mine, now])
  const myClasses = useMemo(() => summarizeClasses(mine), [mine])
  const members = memberships.filter((m) => m.subjectId === subject.id && m.uid !== user!.uid)

  const inGroup = (form: string, group: string) =>
    members.filter((m) => (m.classes ?? []).some((c) => c.form === form && normGroup(c.group) === normGroup(group)))
  const grouped = new Set(myClasses.flatMap((c) => inGroup(c.form, c.group).map((m) => m.uid)))
  const others = members.filter((m) => !grouped.has(m.uid))

  const pct = hours.minutes > 0 ? Math.round((hours.doneMinutes / hours.minutes) * 100) : 0

  return (
    <div>
      <BackButton onBack={onBack} />

      {error && <p className="text-danger mt-2 text-sm">{error}</p>}

      <div className="mt-1 flex items-start gap-3">
        <button
          className="hover:bg-accent-soft -m-1 rounded-xl p-1"
          onClick={() => setPicking(true)}
          aria-label="Zmień ikonę przedmiotu"
          title="Zmień ikonę"
        >
          <SubjectIcon emoji={subject.emoji} size={48} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight break-words">{subject.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="badge bg-accent-soft text-accent">{KIND_LABEL[subject.kind]}</span>
            {live && <span className="badge bg-accent text-white">Trwa teraz</span>}
          </p>
        </div>
      </div>

      <EmojiPicker
        open={picking}
        subjectName={subject.name}
        current={subject.emoji}
        onPick={(e) => {
          setPicking(false)
          setSubjectEmoji(subject.id, e).catch((err) => setError(err.message))
        }}
        onClose={() => setPicking(false)}
      />

      {hours.count > 0 && (
        <section className="card mt-5 p-4" aria-labelledby="hours-h">
          <h3 id="hours-h" className="text-muted text-xs font-semibold tracking-wide uppercase">
            Godziny w semestrze
          </h3>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-3xl font-semibold tracking-tight tabular-nums">{fmtHours(hours.minutes)}</span>
            <span className="text-muted text-sm">
              {hours.count} {plural(hours.count, 'zajęcia', 'zajęcia', 'zajęć')} · {academicHours(hours.minutes)} godz. dydaktycznych
            </span>
          </p>

          <div
            className="bg-accent-soft mt-3 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Odbyte zajęcia"
          >
            <div className="bg-accent h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-muted mt-1.5 text-xs">
            Odbyte {hours.doneCount} z {hours.count} ({fmtHours(hours.doneMinutes)}), zostało {fmtHours(hours.minutes - hours.doneMinutes)}
            {hours.first && hours.last && ` · ${day(hours.first)} – ${day(hours.last)}`}
          </p>

          {hours.byForm.length > 1 && (
            <ul className="border-line mt-3 space-y-1 border-t pt-3 text-sm">
              {hours.byForm.map((f) => (
                <li key={f.form} className="flex justify-between gap-3">
                  <span>{FORM_TITLE[f.form] ?? f.form}</span>
                  <span className="text-muted tabular-nums">
                    {f.count} {plural(f.count, 'zajęcia', 'zajęcia', 'zajęć')} · {fmtHours(f.minutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {hours.next && (
        <section className="card mt-3 p-4" aria-labelledby="next-h">
          <h3 id="next-h" className="text-muted text-xs font-semibold tracking-wide uppercase">
            {live ? 'Teraz' : 'Najbliższe zajęcia'}
          </h3>
          <p className="mt-1 font-medium">
            {day(hours.next.start.slice(0, 10), true)}, {hours.next.start.slice(11)}–{hours.next.end.slice(11)}
          </p>
          <p className="text-muted text-sm">
            {FORM_TITLE[hours.next.form] ?? hours.next.form}
            {hours.next.room && ` · sala ${hours.next.room}`}
            {hours.next.group && ` · gr. ${hours.next.group}`}
          </p>
        </section>
      )}

      <section className="mt-5" aria-labelledby="grp-h">
        <h3 id="grp-h" className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
          Z kim masz ten przedmiot
        </h3>

        {myClasses.length === 0 && <p className="text-muted text-sm">Brak Twoich zajęć z tego przedmiotu w planie.</p>}

        <div className="space-y-3">
          {myClasses.map((c) => {
            const people = inGroup(c.form, c.group)
            const lecturer = classDocs[classKey(subject.id, c.form, c.group)]?.lecturer
            return (
              <div key={`${c.form}-${c.group}`} className="card p-4">
                <p className="font-medium">
                  {FORM_TITLE[c.form] ?? c.form} · gr. {c.group}
                </p>
                {lecturer && <p className="text-muted text-sm">{lecturer}</p>}
                {people.length === 0 ? (
                  <p className="text-muted mt-2 text-sm">Nikt inny z aplikacji nie jest jeszcze w tej grupie.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    {people.map((m) => (
                      <li key={m.uid} className="flex items-center gap-2 text-sm">
                        <Avatar name={m.username} photoURL={m.photoURL} size={32} />
                        {m.username}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        {others.length > 0 && (
          <div className="mt-3">
            <p className="text-muted mb-2 text-xs">Pozostali na przedmiocie (inne grupy)</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-2">
              {others.map((m) => (
                <li key={m.uid} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.username} photoURL={m.photoURL} size={24} />
                  {m.username}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <button className="btn-primary mt-6 w-full" onClick={onOpenMaterials}>
        Materiały z tego przedmiotu
      </button>

      <details className="mt-4">
        <summary className="text-accent cursor-pointer text-sm font-medium">Wszystkie grupy i prowadzący</summary>
        <SubjectGroups subject={subject} />
      </details>
    </div>
  )
}
