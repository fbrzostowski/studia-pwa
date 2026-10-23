import { useState, type FormEvent } from 'react'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import type { ExamSection } from './logic'
import { EXAM_LABEL, EXAM_TYPES, type Exam, type ExamType } from './types'

/** Dodawanie i edycja terminu mid-term / final exam. */
export default function ExamForm({
  sections,
  exam,
  preset,
  onDone,
}: {
  sections: Pick<ExamSection, 'key' | 'name' | 'subjects'>[]
  exam?: Exam // edycja istniejącego terminu
  preset?: { sectionKey?: string; type?: ExamType; date?: string }
  onDone: () => void
}) {
  const { user, profile } = useAuth()
  const initialSection =
    sections.find((s) => exam && s.subjects.some((x) => x.id === exam.subjectId)) ??
    sections.find((s) => s.key === preset?.sectionKey) ??
    sections[0]
  const [sectionKey, setSectionKey] = useState(initialSection?.key ?? '')
  const [type, setType] = useState<ExamType>(exam?.type ?? preset?.type ?? 'MID')
  const [date, setDate] = useState(exam?.date ?? preset?.date ?? '')
  const [time, setTime] = useState(exam?.time ?? '')
  const [room, setRoom] = useState(exam?.room ?? '')
  const [note, setNote] = useState(exam?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const section = sections.find((s) => s.key === sectionKey)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!section || !date) return
    setBusy(true)
    setError(null)
    // przy edycji zostajemy przy tym samym przedmiocie, jeśli nadal należy do wybranej sekcji
    const subjectId =
      exam && section.subjects.some((s) => s.id === exam.subjectId) ? exam.subjectId : section.subjects[0].id
    // Firestore nie przyjmuje undefined, więc puste pola pomijamy
    const data = {
      subjectId,
      type,
      date,
      ...(time ? { time } : {}),
      ...(room.trim() ? { room: room.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      createdBy: exam?.createdBy ?? user!.uid,
      createdByName: exam?.createdByName ?? memberName(profile!).slice(0, 60),
      createdAt: exam?.createdAt ?? serverTimestamp(),
    }
    try {
      if (exam) await setDoc(doc(db, 'exams', exam.id), data)
      else await addDoc(collection(db, 'exams'), data)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-3 space-y-3 p-3">
      <select
        required
        className="input"
        value={sectionKey}
        onChange={(e) => setSectionKey(e.target.value)}
        aria-label="Przedmiot"
      >
        {sections.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="bg-bg border-line flex gap-1 rounded-xl border p-1" role="group" aria-label="Rodzaj zaliczenia">
        {EXAM_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className="text-muted aria-pressed:bg-surface aria-pressed:text-text flex-1 rounded-lg px-2 py-1.5 text-sm font-medium aria-pressed:shadow-sm"
          >
            {EXAM_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-muted text-xs">
          Data
          <input required type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-muted text-xs">
          Godzina (opcjonalnie)
          <input type="time" className="input mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      <input
        className="input"
        placeholder="Sala (opcjonalnie)"
        maxLength={100}
        value={room}
        onChange={(e) => setRoom(e.target.value)}
      />
      <textarea
        className="input resize-y"
        rows={2}
        placeholder="Uwagi, zakres materiału (opcjonalnie)"
        maxLength={300}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !date || !section} className="btn-primary">
          {busy ? 'Zapisuję…' : exam ? 'Zapisz zmiany' : 'Dodaj termin'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
