import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useSheetLock } from '../../components/Sheet'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { norm } from '../../lib/text'
import { findExisting } from '../schedule/match'
import { eventsForCandidate, summarizeClasses, toCandidates } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'
import { KIND_LABEL, SUBJECT_KINDS, type SubjectKind } from './types'
import { useSubjects } from './useSubjects'

/**
 * Nowy przedmiot. Pole nazwy filtruje listę przedmiotów z planu USOS (wybór uzupełnia nazwę, rodzaj
 * zajęć, kod USOS i Twoje grupy z pliku); nazwa, której nie ma w planie, dodaje przedmiot ręcznie.
 * Twórca od razu należy do przedmiotu.
 */
export default function AddSubjectForm({ initialName = '', onDone }: { initialName?: string; onDone: () => void }) {
  const { user, profile } = useAuth()
  const events = usePlanEvents()
  const { subjects } = useSubjects()
  const [name, setName] = useState(initialName)
  const [pick, setPick] = useState<string | null>(null) // klucz wybranego przedmiotu z planu
  const [kind, setKind] = useState<SubjectKind>('WYK')
  const [busy, setBusy] = useState(false)
  useSheetLock(busy)
  const [error, setError] = useState<string | null>(null)
  const touched = useRef(false)

  // Wszystkie przedmioty z planu; te, które już są w aplikacji, są wyszarzone i niewybieralne.
  const all = useMemo(
    () => (events ? toCandidates(events).candidates : []).map((c) => ({ ...c, exists: !!findExisting(c, subjects) })),
    [events, subjects],
  )
  const selected = all.find((c) => c.key === pick && !c.exists)

  // Nazwa z podpowiedzi (np. folder podręczników) pasująca do przedmiotu z planu wybiera go od razu.
  useEffect(() => {
    if (touched.current || !initialName) return
    const m = all.find((c) => !c.exists && norm(c.name) === norm(initialName))
    if (m) {
      setPick(m.key)
      setName(m.name)
    }
  }, [all, initialName])

  useEffect(() => {
    if (selected) setKind(selected.kind)
  }, [selected?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const q = norm(name)
  // Po wyborze pokazujemy całą listę, bo pole zawiera już nazwę wybranego przedmiotu.
  const visible = selected || !q ? all : all.filter((c) => norm(c.name).includes(q))
  const finalName = selected ? selected.name : name.trim()
  const selectable = all.some((c) => !c.exists)

  const onType = (v: string) => {
    touched.current = true
    setName(v)
    if (selected && norm(v) !== norm(selected.name)) setPick(null) // edycja = ręczna nazwa
  }

  const choose = (key: string, n: string) => {
    touched.current = true
    setPick(key)
    setName(n)
  }

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
    <form onSubmit={submit} className="space-y-3">
      <input
        autoFocus
        required
        className="input"
        placeholder={all.length > 0 ? 'Nazwa przedmiotu — wpisz, aby wyszukać w planie' : 'Nazwa przedmiotu'}
        value={name}
        onChange={(e) => onType(e.target.value)}
      />

      {events === undefined && <p className="text-muted text-sm">Ładowanie planu…</p>}

      {events === null && (
        <p className="text-muted text-sm">
          Zaimportuj plan z USOS (zakładka Plan), żeby wybierać przedmioty z listy. Na razie wpisz nazwę ręcznie.
        </p>
      )}

      {all.length > 0 && (
        <div>
          <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
            Z Twojego planu{q && !selected ? ` (${visible.length} z ${all.length})` : ''}
          </p>
          {visible.length > 0 ? (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {visible.map((o) => (
                <li key={o.key}>
                  <button
                    type="button"
                    disabled={o.exists}
                    aria-pressed={selected?.key === o.key}
                    onClick={() => choose(o.key, o.name)}
                    className="border-line aria-pressed:border-accent aria-pressed:bg-accent-soft flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-50"
                  >
                    <span className="min-w-0 break-words">{o.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {o.exists && <span className="text-muted text-xs">już w aplikacji</span>}
                      <span className="badge bg-accent-soft text-accent">{o.kind}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!selectable && !q && (
            <p className="text-muted mt-1.5 text-xs">Wszystkie przedmioty z planu są już w aplikacji.</p>
          )}
          {!selected && finalName && (
            <p className="text-muted mt-1.5 text-xs">
              {visible.length > 0
                ? `Wybierz przedmiot z listy albo zostaw wpisaną nazwę, aby dodać „${finalName}” jako nowy (bez grup z planu).`
                : `Nie ma go w Twoim planie — zostanie dodany jako nowy przedmiot „${finalName}” (bez grup z planu).`}
            </p>
          )}
        </div>
      )}

      {finalName && (
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
        <button disabled={busy || !finalName} className="btn-primary">
          {busy ? 'Zapisuję…' : 'Dodaj przedmiot'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
