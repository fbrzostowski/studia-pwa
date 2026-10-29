import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import { useSheetLock } from '../../components/Sheet'
import { plural } from '../../lib/plural'
import { KIND_LABEL, type Subject } from '../materials/types'
import { describeDeleted, type DeleteCounts } from '../subjects/logic'

interface Result {
  subject: { name: string }
  counts: DeleteCounts
}
const call = httpsCallable<{ id: string; dryRun?: boolean }, Result>(functions, 'deleteSubject')
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Usuwanie przedmiotu razem z tym, co do niego należy (uczestnictwa, materiały i ich pliki, terminy zaliczeń).
 * Serwer liczy podgląd skutków i sprawdza uprawnienia (autor przedmiotu albo admin).
 */
export default function DeleteSubject({ subject, onDone }: { subject: Subject; onDone: (summary: string) => void }) {
  const [preview, setPreview] = useState<DeleteCounts | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useSheetLock(busy)

  useEffect(() => {
    let live = true
    call({ id: subject.id, dryRun: true })
      .then((r) => live && setPreview(r.data.counts))
      .catch((e) => live && setPreviewError(messageOf(e)))
    return () => {
      live = false
    }
  }, [subject.id])

  const lines = useMemo(() => (preview ? describeDeleted(preview) : []), [preview])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await call({ id: subject.id })
      onDone(`Usunięto przedmiot „${subject.name}”${lines.length ? ` razem z: ${lines.join(', ')}` : ''}.`)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Usuwasz przedmiot <strong>{subject.name}</strong> ({KIND_LABEL[subject.kind]}).
      </p>

      <div className="border-line rounded-xl border p-3 text-sm" aria-live="polite">
        {previewError ? (
          <p className="text-danger">{previewError}</p>
        ) : !preview ? (
          <p className="text-muted">Liczę, co zostanie usunięte…</p>
        ) : (
          <>
            <p>
              Razem z przedmiotem zniknie: {lines.length ? <strong>{lines.join(', ')}</strong> : 'nic więcej (nie ma powiązanych danych)'}.
            </p>
            <p className="text-muted mt-1">
              Materiały i pliki należą do różnych osób, więc znikną im też. Listy do nauki ({preview.todoLists}{' '}
              {plural(preview.todoLists, 'lista', 'listy', 'list')}) zostają, tracą tylko powiązanie z przedmiotem. Podręczniki
              się nie zmieniają.
            </p>
          </>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sure} disabled={!preview || busy} onChange={(e) => setSure(e.target.checked)} />
        <span>Rozumiem, że tego nie da się cofnąć w aplikacji.</span>
      </label>

      {error && <p className="text-danger text-sm">{error}</p>}
      <button className="btn-danger w-full" disabled={!preview || !sure || busy} onClick={submit}>
        {busy ? 'Usuwanie…' : `Usuń „${subject.name}”`}
      </button>
    </div>
  )
}
