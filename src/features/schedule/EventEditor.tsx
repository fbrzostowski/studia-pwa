import { useState, type FormEvent } from 'react'
import { useSheetLock } from '../../components/Sheet'
import { draftOf, EVENT_FORMS, eventFromDraft } from './eventEdit'
import type { IcsEvent } from './parseIcs'

/** Formularz jednych zajęć (dodanie, zmiana albo usunięcie) w planie innej osoby, dla admina. */
export default function EventEditor({
  event,
  defaultDate,
  onSave,
  onDelete,
}: {
  event?: IcsEvent // brak = nowe zajęcia
  defaultDate: string
  onSave: (e: IcsEvent) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [d, setD] = useState(() => draftOf(event, defaultDate))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useSheetLock(busy)
  const set = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }))

  const run = async (job: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await job()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = eventFromDraft(d, event?.code ?? '')
    if ('error' in r) return setError(r.error)
    void run(() => onSave(r.event))
  }

  const field = 'space-y-1 text-sm font-medium'
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className={`block ${field}`}>
        Nazwa
        <input className="input" value={d.name} maxLength={200} disabled={busy} onChange={(e) => set('name')(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={field}>
          Forma
          <select className="input" value={d.form} disabled={busy} onChange={(e) => set('form')(e.target.value)}>
            {EVENT_FORMS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className={field}>
          Grupa
          <input className="input" value={d.group} maxLength={20} disabled={busy} onChange={(e) => set('group')(e.target.value)} />
        </label>
      </div>
      <label className={`block ${field}`}>
        Sala
        <input className="input" value={d.room} maxLength={100} disabled={busy} onChange={(e) => set('room')(e.target.value)} />
      </label>
      <div className="grid grid-cols-3 gap-3">
        <label className={field}>
          Data
          <input type="date" className="input" value={d.date} disabled={busy} onChange={(e) => set('date')(e.target.value)} />
        </label>
        <label className={field}>
          Od
          <input type="time" className="input" value={d.from} disabled={busy} onChange={(e) => set('from')(e.target.value)} />
        </label>
        <label className={field}>
          Do
          <input type="time" className="input" value={d.to} disabled={busy} onChange={(e) => set('to')(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz'}
        </button>
        {onDelete && (
          <button
            type="button"
            className="btn-danger"
            disabled={busy}
            onClick={() => confirm('Usunąć te zajęcia z planu?') && void run(onDelete)}
          >
            Usuń
          </button>
        )}
      </div>
    </form>
  )
}
