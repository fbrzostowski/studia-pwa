import { useMemo, useState } from 'react'
import Avatar from '../../components/Avatar'
import Sheet from '../../components/Sheet'
import SubjectIcon from '../../components/SubjectIcon'
import { norm } from '../../lib/text'
import { plural } from '../../lib/plural'
import { useMemberships } from '../groups/hooks'
import { KIND_LABEL } from '../materials/types'
import { useSubjects } from '../materials/useSubjects'
import { useOpenSubjectPage } from '../subject/SubjectPageContext'
import { duplicateIds } from './logic'
import MergeSubjects from './MergeSubjects'

/** Wszystkie przedmioty w aplikacji z osobami, które na nie uczęszczają, i łączenie zdublowanych. */
export default function SubjectsPage() {
  const { subjects, error } = useSubjects()
  const memberships = useMemberships()
  const openSubjectPage = useOpenSubjectPage()
  const [q, setQ] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [merging, setMerging] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const people = useMemo(() => {
    const m = new Map<string, typeof memberships>()
    for (const x of memberships) m.set(x.subjectId, [...(m.get(x.subjectId) ?? []), x])
    return m
  }, [memberships])
  const count = (id: string) => people.get(id)?.length ?? 0
  const dups = useMemo(() => duplicateIds(subjects), [subjects])

  const shown = subjects.filter((s) => !q.trim() || norm(s.name).includes(norm(q)))
  const chosen = picked.map((id) => subjects.find((s) => s.id === id)).filter((s) => !!s)

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? [p[1], id] : [...p, id]))
  const stopSelecting = () => {
    setSelecting(false)
    setPicked([])
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Przedmioty</h2>
        {selecting ? (
          <button className="btn-secondary" onClick={stopSelecting}>
            Anuluj łączenie
          </button>
        ) : (
          <button className="btn-secondary" onClick={() => setSelecting(true)} disabled={subjects.length < 2}>
            Połącz przedmioty
          </button>
        )}
      </div>

      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
      {notice && (
        <p className="bg-accent-soft text-accent mt-3 flex items-start justify-between gap-3 rounded-xl p-3 text-sm">
          <span>{notice}</span>
          <button className="shrink-0 underline" onClick={() => setNotice(null)}>
            Zamknij
          </button>
        </p>
      )}
      {selecting && (
        <p className="text-muted mt-3 text-sm">
          Zaznacz dwa przedmioty, które chcesz połączyć w jeden{dups.size > 0 ? '. Możliwe duplikaty są oznaczone' : ''}.
        </p>
      )}

      <input className="input mt-3" type="search" placeholder={`Szukaj wśród ${subjects.length} przedmiotów…`} value={q} onChange={(e) => setQ(e.target.value)} />

      {shown.length === 0 ? (
        <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
          {subjects.length === 0 ? 'Brak przedmiotów.' : 'Nic nie pasuje do wyszukiwania.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((s) => {
            const ppl = people.get(s.id) ?? []
            const on = picked.includes(s.id)
            return (
              <li key={s.id}>
                <button
                  className={`card hover:bg-accent-soft flex w-full items-center gap-3 p-3 text-left ${on ? 'ring-accent bg-accent-soft ring-2' : ''}`}
                  aria-pressed={selecting ? on : undefined}
                  onClick={() => (selecting ? toggle(s.id) : openSubjectPage(s.id))}
                >
                  {selecting && (
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${on ? 'bg-accent border-accent text-white' : 'border-line'}`}
                    >
                      {on ? '✓' : ''}
                    </span>
                  )}
                  <SubjectIcon emoji={s.emoji} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium break-words">{s.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="badge bg-accent-soft text-accent" title={KIND_LABEL[s.kind]}>
                        {s.kind}
                      </span>
                      {dups.has(s.id) && <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">możliwy duplikat</span>}
                    </span>
                    <span className="mt-2 flex items-center gap-2">
                      {ppl.length === 0 ? (
                        <span className="text-muted text-xs">Nikt nie uczęszcza</span>
                      ) : (
                        <>
                          <span className="flex -space-x-1.5">
                            {ppl.slice(0, 6).map((m) => (
                              <Avatar key={m.uid} name={m.username} photoURL={m.photoURL} size={24} className="ring-surface ring-2" />
                            ))}
                          </span>
                          <span className="text-muted text-xs" title={ppl.map((m) => m.username).join(', ')}>
                            {ppl.length > 6 ? `+${ppl.length - 6} · ` : ''}
                            {ppl.length} {plural(ppl.length, 'osoba', 'osoby', 'osób')}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selecting && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] mt-4 sm:bottom-4">
          <button className="btn-primary w-full shadow-lg" disabled={chosen.length !== 2} onClick={() => setMerging(true)}>
            {chosen.length === 2 ? 'Połącz zaznaczone (2)' : `Zaznaczono ${chosen.length} z 2`}
          </button>
        </div>
      )}

      <Sheet open={merging && chosen.length === 2} title="Połącz przedmioty" onClose={() => setMerging(false)}>
        {merging && chosen.length === 2 && (
          <MergeSubjects
            key={picked.join('|')}
            a={chosen[0]!}
            b={chosen[1]!}
            members={count}
            onDone={(summary) => {
              setMerging(false)
              stopSelecting()
              setNotice(summary)
            }}
          />
        )}
      </Sheet>
    </div>
  )
}
