import { useEffect, useState, type FormEvent } from 'react'
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import MaterialForm from './MaterialForm'
import { useSubjects } from './useSubjects'
import SubjectGroups from '../groups/SubjectGroups'
import { KIND_LABEL, SUBJECT_KINDS, TYPE_LABEL, TYPE_STYLE, type Material, type Subject, type SubjectKind } from './types'

export default function MaterialsPage({ initialSubjectId = null }: { initialSubjectId?: string | null }) {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { subjects, error: subjectsError } = useSubjects()
  const [selected, setSelected] = useState<string | null>(initialSubjectId)
  const [materials, setMaterials] = useState<Material[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [newKind, setNewKind] = useState<SubjectKind>('WYK')
  const [adding, setAdding] = useState(false)
  const [addingSubject, setAddingSubject] = useState(false)
  const [localError, setError] = useState<string | null>(null)
  const error = localError ?? subjectsError

  useEffect(() => {
    if (!selected) return
    return onSnapshot(
      query(collection(db, 'materials'), where('subjectId', '==', selected)),
      (snap) =>
        setMaterials(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Material, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity)),
        ),
      (e) => setError(e.message),
    )
  }, [selected])

  const addSubject = async (e: FormEvent) => {
    e.preventDefault()
    const name = newSubject.trim()
    if (!name) return
    try {
      // Twórca od razu należy do przedmiotu (reguły sprawdzają istnienie przedmiotu w tej samej paczce).
      const batch = writeBatch(db)
      const ref = doc(collection(db, 'subjects'))
      batch.set(ref, { name, kind: newKind, createdBy: user!.uid, createdAt: serverTimestamp() })
      batch.set(doc(db, 'memberships', `${ref.id}_${user!.uid}`), {
        uid: user!.uid,
        subjectId: ref.id,
        username: memberName(profile!),
        classes: [],
        updatedAt: serverTimestamp(),
      })
      await batch.commit()
      setNewSubject('')
      setAddingSubject(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const canEdit = (ownerId: string) => isAdmin || ownerId === user!.uid

  const removeSubject = async (s: Subject) => {
    if (!confirm(`Usunąć przedmiot „${s.name} (${s.kind})”? Materiały z tego przedmiotu zostaną w bazie.`)) return
    await deleteDoc(doc(db, 'subjects', s.id)).catch((e) => setError(e.message))
    if (selected === s.id) setSelected(null)
  }

  const removeMaterial = async (m: Material) => {
    if (!confirm(`Usunąć „${m.title}”?`)) return
    try {
      await deleteDoc(doc(db, 'materials', m.id))
      if (m.storagePath) await deleteObject(ref(storage, m.storagePath)).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const openFile = async (m: Material) => {
    try {
      window.open(await getDownloadURL(ref(storage, m.storagePath!)), '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const current = subjects.find((s) => s.id === selected)

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Przedmioty</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <li key={s.id}>
            <button
              className="chip"
              aria-pressed={selected === s.id}
              onClick={() => {
                setSelected(s.id)
                setAdding(false)
              }}
            >
              {s.name}
              {s.kind && <span className="ml-1.5 text-xs font-semibold opacity-70">{s.kind}</span>}
            </button>
          </li>
        ))}
        <li>
          <button
            className="chip border-dashed text-accent"
            onClick={() => setAddingSubject((v) => !v)}
            aria-expanded={addingSubject}
          >
            + Przedmiot
          </button>
        </li>
      </ul>

      {addingSubject && (
        <form onSubmit={addSubject} className="card mt-2 space-y-3 p-3">
          <input
            autoFocus
            required
            className="input"
            placeholder="Nazwa przedmiotu"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
          />
          <div>
            <p className="text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">Rodzaj zajęć</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  aria-pressed={newKind === k}
                  title={KIND_LABEL[k]}
                  onClick={() => setNewKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <p className="text-muted mt-1.5 text-xs">{KIND_LABEL[newKind]}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary">Dodaj przedmiot</button>
            <button type="button" className="btn-ghost" onClick={() => setAddingSubject(false)}>
              Anuluj
            </button>
          </div>
        </form>
      )}

      {!current && (
        <p className="border-line text-muted mt-6 rounded-2xl border border-dashed p-8 text-center text-sm">
          {subjects.length === 0 ? 'Brak przedmiotów — dodaj pierwszy.' : 'Wybierz przedmiot, żeby zobaczyć materiały.'}
        </p>
      )}

      {current && (
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">
              {current.name}
              {current.kind && (
                <span className="badge bg-accent-soft text-accent ml-2 align-middle" title={KIND_LABEL[current.kind]}>
                  {current.kind}
                </span>
              )}
            </h2>
            <div className="flex gap-1">
              {canEdit(current.createdBy) && (
                <button className="btn-danger" onClick={() => removeSubject(current)}>
                  Usuń przedmiot
                </button>
              )}
              {!adding && (
                <button className="btn-primary" onClick={() => setAdding(true)}>
                  Dodaj materiał
                </button>
              )}
            </div>
          </div>

          <SubjectGroups key={current.id} subject={current} />

          <h3 className="text-muted mt-6 text-xs font-semibold tracking-wide uppercase">Materiały</h3>
          {adding && <MaterialForm subjectId={current.id} onDone={() => setAdding(false)} />}

          {materials.length === 0 ? (
            <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
              Brak materiałów w tym przedmiocie.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {materials.map((m) => (
                <li key={m.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`badge ${TYPE_STYLE[m.type]}`}>{TYPE_LABEL[m.type]}</span>
                      <h3 className="mt-1.5 font-medium break-words">{m.title}</h3>
                      <p className="text-muted mt-0.5 text-xs">
                        {m.ownerName}
                        {m.createdAt && ` · ${m.createdAt.toDate().toLocaleDateString('pl-PL')}`}
                      </p>
                    </div>
                    {canEdit(m.ownerId) && (
                      <button className="btn-danger -mt-1 -mr-2 shrink-0" onClick={() => removeMaterial(m)}>
                        Usuń
                      </button>
                    )}
                  </div>

                  {m.type === 'note' && <p className="mt-3 text-sm whitespace-pre-wrap">{m.content}</p>}
                  {m.type === 'link' && (
                    <a
                      className="btn-secondary mt-3"
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Otwórz link
                    </a>
                  )}
                  {m.type === 'slide' && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button className="btn-secondary" onClick={() => openFile(m)}>
                        Otwórz plik
                      </button>
                      {m.fileName && <span className="text-muted min-w-0 truncate text-xs">{m.fileName}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
