import { useMemo, useState, type ChangeEvent } from 'react'
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { KIND_LABEL, SUBJECT_KINDS, type Subject, type SubjectKind } from '../materials/types'
import { plural } from '../../lib/plural'
import { findExisting } from './match'
import { eventsForCandidate, parseIcs, summarizeClasses, toCandidates, type Candidate, type IcsEvent, type Skipped } from './parseIcs'

const MAX_BYTES = 2 * 1024 * 1024

interface Row extends Candidate {
  include: boolean
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })

export default function ImportPlan({ subjects, onDone }: { subjects: Subject[]; onDone: () => void }) {
  const { user, profile } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [skipped, setSkipped] = useState<Skipped[]>([])
  const [events, setEvents] = useState<IcsEvent[]>([])
  const [fileName, setFileName] = useState('')
  const [savePlan, setSavePlan] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setRows(null)
    if (file.size > MAX_BYTES) return setError('Plik jest za duży jak na plan zajęć (limit 2 MB).')
    try {
      const events = parseIcs(await file.text())
      if (events.length === 0) return setError('Nie znalazłem w tym pliku zajęć. Czy to plik .ics z planem z USOS?')
      const res = toCandidates(events)
      setEvents(events)
      setFileName(file.name)
      setSkipped(res.skipped)
      setRows(res.candidates.map((c) => ({ ...c, include: true })))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...p } : r)))

  // Wiersze z już istniejącym przedmiotem są wyłączone z tworzenia.
  const view = useMemo(
    () => (rows ?? []).map((r) => ({ r, existing: findExisting(r, subjects) })),
    [rows, subjects],
  )
  const toCreate = view.filter((v) => v.r.include && !v.existing && v.r.name.trim())

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const batch = writeBatch(db)
      // Do każdego nowego i już istniejącego przedmiotu z planu dołączamy importującego.
      const joins: { subjectId: string; row: Row }[] = []
      for (const { r } of toCreate) {
        const ref = doc(collection(db, 'subjects'))
        batch.set(ref, {
          name: r.name.trim(),
          kind: r.kind,
          ...(r.code ? { usosCode: r.code } : {}),
          createdBy: user!.uid,
          createdAt: serverTimestamp(),
        })
        joins.push({ subjectId: ref.id, row: r })
      }
      for (const { r, existing } of view) if (existing) joins.push({ subjectId: existing.id, row: r })
      if (savePlan) {
        // Firestore nie przyjmuje wartości undefined, więc pomijamy puste pola.
        const compact = events.map((e) =>
          Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== '')),
        )
        // merge: ponowny import podmienia zajęcia, ale nie kasuje innych pól dokumentu
        batch.set(doc(db, 'plans', user!.uid), { events: compact, fileName, importedAt: serverTimestamp() }, { merge: true })
        for (const { subjectId, row } of joins) {
          const rowEvents = eventsForCandidate(events, row)
          batch.set(doc(db, 'memberships', `${subjectId}_${user!.uid}`), {
            uid: user!.uid,
            subjectId,
            username: memberName(profile!),
            classes: summarizeClasses(rowEvents),
            updatedAt: serverTimestamp(),
          })
        }
      }
      await batch.commit()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div className="card mt-2 space-y-3 p-4">
      <div>
        <h3 className="font-medium">Import planu z USOS</h3>
        <p className="text-muted mt-0.5 text-sm">
          Wgraj plik .ics wyeksportowany z kalendarza USOS. Utworzę brakujące przedmioty; wykład i ćwiczenia z
          tego samego przedmiotu połączę w WYK+CW.
        </p>
      </div>

      <input
        type="file"
        accept=".ics,text/calendar"
        onChange={onFile}
        className="text-muted file:bg-accent-soft file:text-accent block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3.5 file:py-2 file:text-sm file:font-medium"
      />

      {error && <p className="text-danger text-sm">{error}</p>}

      {rows && (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-accent mt-0.5 h-4 w-4 shrink-0"
              checked={savePlan}
              onChange={(e) => setSavePlan(e.target.checked)}
            />
            <span>
              Zapisz mój plan ({events.length} {plural(events.length, 'termin', 'terminy', 'terminów')}) i dołącz do
              przedmiotów. Plan widzisz tylko Ty, ale Twoja nazwa i grupy będą widoczne dla innych na stronie
              przedmiotu (dzięki temu widać, kto ma z kim zajęcia). Zastąpi poprzednio zaimportowany plan.
            </span>
          </label>

          <ul className="divide-line border-line divide-y rounded-xl border">
            {view.map(({ r, existing }) => (
              <li key={r.key} className="space-y-2 p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="accent-accent mt-3 h-4 w-4 shrink-0"
                    checked={r.include && !existing}
                    disabled={!!existing}
                    onChange={(e) => patch(r.key, { include: e.target.checked })}
                    aria-label={`Utwórz ${r.name}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      className="input py-2"
                      value={r.name}
                      onChange={(e) => patch(r.key, { name: e.target.value })}
                      aria-label="Nazwa przedmiotu"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="input max-w-full py-1.5 sm:w-auto"
                        value={r.kind}
                        onChange={(e) => patch(r.key, { kind: e.target.value as SubjectKind })}
                        aria-label="Rodzaj zajęć"
                      >
                        {SUBJECT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k} — {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      {existing && (
                        <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          {savePlan ? 'Już istnieje — dołączysz do niego' : 'Już istnieje'}
                        </span>
                      )}
                    </div>
                    <p className="text-muted text-xs">
                      Z pliku: {r.forms.join(' + ')} · {r.count} {plural(r.count, 'termin', 'terminy', 'terminów')} ·{' '}
                      {fmt(r.firstDate)} – {fmt(r.lastDate)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {skipped.length > 0 && (
            <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
              Pominąłem formy zajęć, których aplikacja nie obsługuje:{' '}
              {skipped.map((s) => `${s.name} (${s.form}, ${s.count})`).join('; ')}.
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        {rows && (
          <button className="btn-primary" disabled={busy || (toCreate.length === 0 && !savePlan)} onClick={create}>
            {busy
              ? 'Zapisuję…'
              : [
                  toCreate.length > 0 &&
                    `Utwórz ${toCreate.length} ${plural(toCreate.length, 'przedmiot', 'przedmioty', 'przedmiotów')}`,
                  savePlan && 'zapisz plan',
                ]
                  .filter(Boolean)
                  .join(' i ')
                  .replace(/^./, (c) => c.toUpperCase()) || 'Nic do zrobienia'}
          </button>
        )}
        <button className="btn-ghost" onClick={onDone}>
          {rows ? 'Anuluj' : 'Zamknij'}
        </button>
      </div>
    </div>
  )
}
