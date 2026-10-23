import { useState, type FormEvent } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { KIND_LABEL, SUBJECT_KINDS, type SubjectKind } from './types'

/** Nowy przedmiot z rodzajem zajęć; twórca od razu do niego należy. */
export default function AddSubjectForm({ initialName = '', onDone }: { initialName?: string; onDone: () => void }) {
  const { user, profile } = useAuth()
  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<SubjectKind>('WYK')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setError(null)
    try {
      // Reguły sprawdzają istnienie przedmiotu w tej samej paczce zapisów (existsAfter).
      const batch = writeBatch(db)
      const ref = doc(collection(db, 'subjects'))
      batch.set(ref, { name: n, kind, createdBy: user!.uid, createdAt: serverTimestamp() })
      batch.set(doc(db, 'memberships', `${ref.id}_${user!.uid}`), {
        uid: user!.uid,
        subjectId: ref.id,
        username: memberName(profile!),
        classes: [],
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
      <input
        autoFocus
        required
        className="input"
        placeholder="Nazwa przedmiotu"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
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
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-primary">
          {busy ? 'Zapisuję…' : 'Dodaj przedmiot'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
