import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { useSheetLock } from '../../components/Sheet'
import { usePlanEvents } from '../schedule/usePlan'
import { suggestSlots, type ExamSection } from './logic'
import { EXAM_LABEL, EXAM_TYPES, type Exam, type ExamType } from './types'

/** Dodawanie i edycja terminu: mid-term, final exam albo quiz. */
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
  useSheetLock(busy)

  // --- godzina i sala z planu: wpisujemy je jako wartości domyślne, ale użytkownik musi je zatwierdzić ---
  const events = usePlanEvents()
  const allSubjects = useMemo(() => sections.flatMap((s) => s.subjects), [sections])
  const auto = useRef({ time: '', room: '' }) // ostatnio podpowiedziane wartości (odróżniamy je od wpisanych ręcznie)
  const sectionChosen = useRef(!!exam || !!preset?.sectionKey)
  const initialPick = useRef(false)
  const [pickIdx, setPickIdx] = useState(0)
  const [confirmed, setConfirmed] = useState(false)

  const suggestions = useMemo(
    () =>
      exam || !events || !section
        ? []
        : suggestSlots(events, allSubjects, new Set(section.subjects.map((s) => s.id)), date),
    [events, allSubjects, section, date, exam],
  )

  // Termin dodawany z kalendarza (jest data, brak przedmiotu): wybierz przedmiot, który ma tego dnia lekcję.
  useEffect(() => {
    if (exam || sectionChosen.current || initialPick.current || !events || !date) return
    initialPick.current = true
    const hit = sections.find((sec) =>
      suggestSlots(events, allSubjects, new Set(sec.subjects.map((s) => s.id)), date).length > 0,
    )
    if (hit) setSectionKey(hit.key)
  }, [events, date, sections, allSubjects, exam])

  const applySlot = (slot?: { time: string; room?: string }) => {
    const old = auto.current
    const next = { time: slot?.time ?? '', room: slot?.room ?? '' }
    // nadpisujemy tylko pola puste albo wypełnione wcześniejszą podpowiedzią — wpisanych ręcznie nie ruszamy
    setTime((cur) => (cur === '' || cur === old.time ? next.time : cur))
    setRoom((cur) => (cur === '' || cur === old.room ? next.room : cur))
    auto.current = next
  }

  useEffect(() => {
    setPickIdx(0)
    setConfirmed(false)
    applySlot(suggestions[0])
  }, [suggestions]) // eslint-disable-line react-hooks/exhaustive-deps

  const chosen = suggestions[pickIdx]
  const choose = (i: number) => {
    setPickIdx(i)
    setTime(suggestions[i].time)
    setRoom(suggestions[i].room ?? '')
    auto.current = { time: suggestions[i].time, room: suggestions[i].room ?? '' }
    setConfirmed(false)
  }
  const needsConfirm = suggestions.length > 0

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
    <form onSubmit={submit} className="space-y-3">
      <select
        required
        className="input"
        value={sectionKey}
        onChange={(e) => {
          sectionChosen.current = true
          setSectionKey(e.target.value)
        }}
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
      {chosen && (
        <div className="border-accent bg-accent-soft rounded-xl border p-3 text-sm" role="group" aria-label="Podpowiedź z planu">
          <p className="font-medium">Godzina i sala zostały wpisane z Twojego planu</p>
          <p className="mt-1">
            {chosen.name} ({chosen.form}), {chosen.time}–{chosen.end}
            {chosen.room ? `, sala ${chosen.room}` : ', bez sali'}
          </p>
          <p className="text-muted mt-1 text-xs">
            To tylko domyślne wartości — zaliczenie bywa o innej godzinie lub w innej sali niż zajęcia. Sprawdź je i w
            razie potrzeby popraw powyżej.
          </p>
          {suggestions.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-muted text-xs">Inna lekcja tego dnia:</span>
              {suggestions.map((sg, idx) => (
                <button
                  key={`${sg.time}-${sg.form}-${sg.room ?? ''}`}
                  type="button"
                  aria-pressed={idx === pickIdx}
                  onClick={() => choose(idx)}
                  className="chip"
                >
                  {sg.time} {sg.form}
                  {sg.room ? ` · ${sg.room}` : ''}
                </button>
              ))}
            </div>
          )}
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 font-medium">
            <input
              type="checkbox"
              required
              className="accent-accent mt-0.5 h-5 w-5 shrink-0"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>Sprawdziłem godzinę i salę — są poprawne</span>
          </label>
        </div>
      )}
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
        <button disabled={busy || !date || !section || (needsConfirm && !confirmed)} className="btn-primary">
          {busy ? 'Zapisuję…' : exam ? 'Zapisz zmiany' : 'Dodaj termin'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
