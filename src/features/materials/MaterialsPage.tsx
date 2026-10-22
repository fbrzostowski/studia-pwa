import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import MaterialForm from './MaterialForm'
import { TYPE_LABEL, TYPE_STYLE, type Material, type Subject } from './types'

export default function MaterialsPage() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [adding, setAdding] = useState(false)
  const [addingSubject, setAddingSubject] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'subjects'),
        (snap) =>
          setSubjects(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, 'id'>) }))
              .sort((a, b) => a.name.localeCompare(b.name, 'pl')),
          ),
        (e) => setError(e.message),
      ),
    [],
  )

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
      await addDoc(collection(db, 'subjects'), { name, createdBy: user!.uid, createdAt: serverTimestamp() })
      setNewSubject('')
      setAddingSubject(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const canEdit = (ownerId: string) => isAdmin || ownerId === user!.uid

  const removeSubject = async (s: Subject) => {
    if (!confirm(`Usunąć przedmiot „${s.name}”? Materiały z tego przedmiotu zostaną w bazie.`)) return
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
        <form onSubmit={addSubject} className="mt-2 flex gap-2">
          <input
            autoFocus
            className="input min-w-0 flex-1"
            placeholder="Nazwa przedmiotu"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
          />
          <button className="btn-primary">Dodaj</button>
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
            <h2 className="text-xl font-semibold tracking-tight">{current.name}</h2>
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
