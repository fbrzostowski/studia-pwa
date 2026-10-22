import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import MaterialForm from './MaterialForm'
import { TYPE_LABEL, type Material, type Subject } from './types'

export default function MaterialsPage() {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [materials, setMaterials] = useState<Material[]>([])
  const [newSubject, setNewSubject] = useState('')
  const [adding, setAdding] = useState(false)
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
    <section className="mt-6">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <h2 className="text-lg font-semibold">Przedmioty</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {subjects.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => {
                setSelected(s.id)
                setAdding(false)
              }}
              className={`rounded border px-3 py-1 ${selected === s.id ? 'bg-indigo-600 text-white' : ''}`}
            >
              {s.name}
            </button>
          </li>
        ))}
        {subjects.length === 0 && <li className="text-sm text-gray-500">Brak przedmiotów — dodaj pierwszy.</li>}
      </ul>
      <form onSubmit={addSubject} className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border p-2"
          placeholder="Nowy przedmiot"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
        />
        <button className="rounded border px-3 py-1">Dodaj</button>
      </form>

      {current && (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{current.name}</h2>
            <span className="flex gap-2">
              {!adding && (
                <button className="rounded bg-indigo-600 px-3 py-1 text-white" onClick={() => setAdding(true)}>
                  Dodaj materiał
                </button>
              )}
              {canEdit(current.createdBy) && (
                <button className="rounded border px-3 py-1" onClick={() => removeSubject(current)}>
                  Usuń przedmiot
                </button>
              )}
            </span>
          </div>

          {adding && <MaterialForm subjectId={current.id} onDone={() => setAdding(false)} />}

          <ul className="mt-3 divide-y rounded border">
            {materials.length === 0 && <li className="p-3 text-sm text-gray-500">Brak materiałów.</li>}
            {materials.map((m) => (
              <li key={m.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">{TYPE_LABEL[m.type]}</span>
                    {m.type === 'link' && (
                      <a className="text-indigo-600 underline" href={m.url} target="_blank" rel="noopener noreferrer">
                        {m.title}
                      </a>
                    )}
                    {m.type === 'slide' && (
                      <button className="text-indigo-600 underline" onClick={() => openFile(m)}>
                        {m.title}
                      </button>
                    )}
                    {m.type === 'note' && <strong>{m.title}</strong>}
                    <span className="ml-2 text-xs text-gray-500">{m.ownerName}</span>
                  </span>
                  {canEdit(m.ownerId) && (
                    <button className="text-sm text-red-600" onClick={() => removeMaterial(m)}>
                      Usuń
                    </button>
                  )}
                </div>
                {m.type === 'note' && <p className="mt-2 whitespace-pre-wrap text-sm">{m.content}</p>}
                {m.type === 'slide' && m.fileName && <p className="mt-1 text-xs text-gray-500">{m.fileName}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
