import { useEffect, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import Sheet from '../../components/Sheet'
import { useAuth } from '../../firebase/AuthContext'
import MaterialCard from './MaterialCard'
import MaterialForm from './MaterialForm'
import { useSubjects } from './useSubjects'
import SubjectGroups from '../groups/SubjectGroups'
import AddSubjectForm from './AddSubjectForm'
import { KIND_LABEL, type Material, type Subject } from './types'

export default function SubjectsView({ initialSubjectId = null }: { initialSubjectId?: string | null }) {
  const { user, profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { subjects, error: subjectsError } = useSubjects()
  const [selected, setSelected] = useState<string | null>(initialSubjectId)
  const [materials, setMaterials] = useState<Material[]>([])
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

  const canEdit = (ownerId: string) => isAdmin || ownerId === user!.uid

  const removeSubject = async (s: Subject) => {
    if (!confirm(`Usunąć przedmiot „${s.name} (${s.kind})”? Materiały z tego przedmiotu zostaną w bazie.`)) return
    await deleteDoc(doc(db, 'subjects', s.id)).catch((e) => setError(e.message))
    if (selected === s.id) setSelected(null)
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

      <Sheet open={addingSubject} title="Nowy przedmiot" onClose={() => setAddingSubject(false)}>
        {addingSubject && <AddSubjectForm onDone={() => setAddingSubject(false)} />}
      </Sheet>

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
                <li key={m.id}>
                  <MaterialCard m={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
