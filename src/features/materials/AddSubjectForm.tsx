import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { norm } from '../../lib/text'
import { findExisting } from '../schedule/match'
import { eventsForCandidate, summarizeClasses, toCandidates } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'
import { KIND_LABEL, SUBJECT_KINDS, type SubjectKind } from './types'
import { useSubjects } from './useSubjects'

/**
 * Nowy przedmiot: najlepiej wybrany z planu USOS (nazwa, rodzaj zajęć i grupy biorą się z pliku),
 * a gdy planu nie ma albo przedmiotu w nim brakuje — wpisany ręcznie. Twórca od razu do niego należy.
 */
export default function AddSubjectForm({ initialName = '', onDone }: { initialName?: string; onDone: () => void }) {
  const { user, profile } = useAuth()
  const events = usePlanEvents()
  const { subjects } = useSubjects()
  const [pick, setPick] = useState<string | null>(null) // klucz z planu, 'manual' albo jeszcze nic
  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<SubjectKind>('WYK')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Przedmioty z planu, których w aplikacji jeszcze nie ma.
  const all = useMemo(() => (events ? toCandidates(events).candidates : []), [events])
  const options = useMemo(() => all.filter((c) => !findExisting(c, subjects)), [all, subjects])
  const hidden = all.length - options.length

  // Nazwa z podpowiedzi (np. folder podręczników) pasująca do przedmiotu z planu wybiera go od razu.
  const preset = initialName ? options.find((o) => norm(o.name) === norm(initialName)) : undefined
  const manual = pick === 'manual' || (pick === null && !preset && (options.length === 0 || !!initialName))
  const selected = options.find((o) => o.key === (pick ?? preset?.key))
  const choosing = !!selected || manual

  useEffect(() => {
    if (selected) setKind(selected.kind)
  }, [selected?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const finalName = selected ? selected.name : name.trim()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!finalName) return
    setBusy(true)
    setError(null)
    try {
      // Reguły sprawdzają istnienie przedmiotu w tej samej paczce zapisów (existsAfter).
      const batch = writeBatch(db)
      const ref = doc(collection(db, 'subjects'))
      batch.set(ref, {
        name: finalName,
        kind,
        ...(selected?.code ? { usosCode: selected.code } : {}),
        createdBy: user!.uid,
        createdAt: serverTimestamp(),
      })
      batch.set(doc(db, 'memberships', `${ref.id}_${user!.uid}`), {
        uid: user!.uid,
        subjectId: ref.id,
        username: memberName(profile!),
        classes: selected && events ? summarizeClasses(eventsForCandidate(events, selected)) : [],
        updatedAt: serverTimestamp(),
      })
      await batch.commit()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-2 space-y-3 p-3">
      {events === undefined ? (
        <p className="text-muted text-sm">Ładowanie planu…</p>
      ) : options.length > 0 ? (
        <div>
          <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Przedmiot z Twojego planu</p>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {options.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  aria-pressed={selected?.key === o.key}
                  onClick={() => setPick(o.key)}
                  className="border-line aria-pressed:border-accent aria-pressed:bg-accent-soft flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left"
                >
                  <span className="min-w-0 break-words">{o.name}</span>
                  <span className="badge bg-accent-soft text-accent shrink-0">{o.kind}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                aria-pressed={manual}
                onClick={() => setPick('manual')}
                className="border-line text-accent aria-pressed:border-accent aria-pressed:bg-accent-soft w-full rounded-xl border border-dashed px-3 py-2 text-left"
              >
                Inny przedmiot (wpisz ręcznie)
              </button>
            </li>
          </ul>
          {hidden > 0 && (
            <p className="text-muted mt-1.5 text-xs">
              Pozostałe przedmioty z planu ({hidden}) są już w aplikacji.
            </p>
          )}
        </div>
      ) : (
        <p className="text-muted text-sm">
          {events === null
            ? 'Zaimportuj plan z USOS (zakładka Plan), żeby wybierać przedmioty z listy. Na razie wpisz nazwę ręcznie.'
            : 'Wszystkie przedmioty z Twojego planu są już w aplikacji. Możesz dodać inny, wpisując nazwę.'}
        </p>
      )}

      {manual && (
        <input
          autoFocus
          required
          className="input"
          placeholder="Nazwa przedmiotu"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}

      {choosing && (
        <div>
          <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Rodzaj zajęć</p>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                aria-pressed={kind === k}
                title={KIND_LABEL[k]}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
          <p className="text-muted mt-1.5 text-xs">
            {KIND_LABEL[kind]}
            {selected && kind === selected.kind && ' — wykryte z planu'}
          </p>
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !choosing || !finalName} className="btn-primary">
          {busy ? 'Zapisuję…' : 'Dodaj przedmiot'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
