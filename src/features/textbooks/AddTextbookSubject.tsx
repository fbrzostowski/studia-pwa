import { useMemo, useState, type FormEvent } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../firebase/config'
import { useSheetLock } from '../../components/Sheet'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { norm } from '../../lib/text'
import { KIND_LABEL, SUBJECT_KINDS, type SubjectKind } from '../materials/types'
import { useSubjects } from '../materials/useSubjects'
import { eventsForCandidate, summarizeClasses, toCandidates, type Candidate } from '../schedule/parseIcs'
import { usePlanEvents } from '../schedule/usePlan'

export interface FolderRef {
  id: string
  name: string
  createdBy?: string // autor folderu (usunąć może on albo admin)
}

interface Entry {
  key: string
  name: string
  kinds: SubjectKind[]
  inApp: boolean // przedmiot już istnieje w aplikacji (nie trzeba go zakładać)
  candidates: Candidate[] // przedmioty z planu do założenia, gdy go jeszcze nie ma
}

/**
 * Wybór przedmiotu, któremu ma powstać folder z podręcznikami. Lista to przedmioty
 * (z planu i z aplikacji) bez takiego folderu; pole nazwy ją filtruje. Przedmiot, którego jeszcze
 * nie ma w aplikacji, jest zakładany razem z folderem.
 */
export default function AddTextbookSubject({
  initialName = '',
  folders,
  onDone,
}: {
  initialName?: string
  folders: FolderRef[]
  onDone: (created?: { name: string; created: boolean }) => void
}) {
  const { user, profile } = useAuth()
  const events = usePlanEvents()
  const { subjects } = useSubjects()
  const [name, setName] = useState(initialName)
  const [pick, setPick] = useState<string | null>(null)
  const [kind, setKind] = useState<SubjectKind>('WYK')
  const [busy, setBusy] = useState(false)
  useSheetLock(busy)
  const [error, setError] = useState<string | null>(null)

  const folderKeys = useMemo(() => new Set(folders.map((f) => norm(f.name))), [folders])

  // Wszystkie znane przedmioty: z aplikacji oraz z planu (te jeszcze bez przedmiotu w aplikacji).
  const entries = useMemo(() => {
    const map = new Map<string, Entry>()
    for (const s of subjects) {
      const key = norm(s.name)
      const e = map.get(key) ?? { key, name: s.name, kinds: [], inApp: true, candidates: [] }
      if (!e.kinds.includes(s.kind)) e.kinds.push(s.kind)
      map.set(key, e)
    }
    for (const c of events ? toCandidates(events).candidates : []) {
      const key = norm(c.name)
      const e = map.get(key)
      if (!e) map.set(key, { key, name: c.name, kinds: [c.kind], inApp: false, candidates: [c] })
      else if (!e.inApp) {
        e.candidates.push(c)
        if (!e.kinds.includes(c.kind)) e.kinds.push(c.kind)
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  }, [subjects, events])

  const q = norm(name)
  const withoutFolder = entries.filter((e) => !folderKeys.has(e.key))
  const selected = withoutFolder.find((e) => e.key === (pick ?? q))
  const hasFolder = !selected && folderKeys.has(q)
  // Po wyborze pokazujemy całą listę, bo pole zawiera już nazwę wybranego przedmiotu.
  const visible = selected || !q ? withoutFolder : withoutFolder.filter((e) => e.key.includes(q))
  const finalName = selected ? selected.name : name.trim()
  const isNewSubject = !selected && !!finalName && !hasFolder && !entries.some((e) => e.key === q)

  const onType = (v: string) => {
    setName(v)
    if (pick && norm(v) !== pick) setPick(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!finalName || hasFolder) return
    setBusy(true)
    setError(null)
    try {
      // 1) przedmiot w aplikacji, jeśli jeszcze go nie ma (reguły sprawdzają go w tej samej paczce zapisów)
      const toCreate: { name: string; kind: SubjectKind; candidate?: Candidate }[] = selected
        ? selected.inApp
          ? []
          : selected.candidates.map((c) => ({ name: c.name, kind: c.kind, candidate: c }))
        : isNewSubject
          ? [{ name: finalName, kind }]
          : []
      if (toCreate.length > 0) {
        const batch = writeBatch(db)
        for (const s of toCreate) {
          const ref = doc(collection(db, 'subjects'))
          batch.set(ref, {
            name: s.name,
            kind: s.kind,
            ...(s.candidate?.code ? { usosCode: s.candidate.code } : {}),
            createdBy: user!.uid,
            createdAt: serverTimestamp(),
          })
          batch.set(doc(db, 'memberships', `${ref.id}_${user!.uid}`), {
            uid: user!.uid,
            subjectId: ref.id,
            username: memberName(profile!),
            classes: s.candidate && events ? summarizeClasses(eventsForCandidate(events, s.candidate)) : [],
            updatedAt: serverTimestamp(),
          })
        }
        await batch.commit()
      }

      // 2) folder podręczników (funkcja zakłada go albo zwraca istniejący)
      const res = await httpsCallable<{ name: string }, { id: string; name: string; created: boolean }>(
        functions,
        'createSubjectFolder',
      )({ name: finalName })
      onDone({ name: res.data.name, created: res.data.created })
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
        placeholder="Nazwa przedmiotu — wpisz, aby wyszukać"
        value={name}
        onChange={(e) => onType(e.target.value)}
      />

      {events === undefined && <p className="text-muted text-sm">Ładowanie planu…</p>}

      <div>
        <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
          Przedmioty bez folderu z podręcznikami
          {q && !selected ? ` (${visible.length} z ${withoutFolder.length})` : ''}
        </p>
        {visible.length > 0 ? (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {visible.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  aria-pressed={selected?.key === o.key}
                  onClick={() => {
                    setPick(o.key)
                    setName(o.name)
                  }}
                  className="border-line aria-pressed:border-accent aria-pressed:bg-accent-soft flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left"
                >
                  <span className="min-w-0 break-words">{o.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {!o.inApp && <span className="text-muted text-xs">z planu</span>}
                    {o.kinds.map((k) => (
                      <span key={k} className="badge bg-accent-soft text-accent">
                        {k}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">
            {withoutFolder.length === 0 ? 'Każdy przedmiot ma już swój folder.' : 'Nic nie pasuje do wpisanej nazwy.'}
          </p>
        )}
        {hasFolder && <p className="text-muted mt-1.5 text-xs">Ten przedmiot ma już folder z podręcznikami.</p>}
        {selected && !selected.inApp && (
          <p className="text-muted mt-1.5 text-xs">
            Przedmiotu nie ma jeszcze w aplikacji — zostanie dodany razem z folderem.
          </p>
        )}
        {isNewSubject && (
          <p className="text-muted mt-1.5 text-xs">
            Nowy przedmiot „{finalName}” — zostanie dodany razem z folderem podręczników.
          </p>
        )}
      </div>

      {isNewSubject && (
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
          <p className="text-muted mt-1.5 text-xs">{KIND_LABEL[kind]}</p>
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !finalName || hasFolder} className="btn-primary">
          {busy ? 'Tworzę folder…' : 'Utwórz folder'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => onDone()}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
