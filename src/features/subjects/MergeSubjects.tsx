import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import { useSheetLock } from '../../components/Sheet'
import SubjectIcon from '../../components/SubjectIcon'
import { KIND_LABEL, type Subject } from '../materials/types'
import { defaultMain, describeCounts, type MergeCounts } from './logic'

interface Preview {
  kind: string
  counts: MergeCounts
}

type Call = { fromId: string; intoId: string; dryRun?: boolean }
const merge = httpsCallable<Call, Preview & { from: { name: string }; into: { name: string } }>(functions, 'mergeSubjects')
/** Nazwa z rodzajem zajęć, bo zdublowane przedmioty często mają identyczne nazwy. */
const label = (s: Subject) => `${s.name} (${s.kind})`
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Łączenie dwóch przedmiotów. Wybierasz, który zostaje (jego nazwa i kod), drugi znika, a wszystko, co do niego
 * należy, przechodzi do pierwszego. Podgląd skutków liczy serwer, on też sprawdza uprawnienia.
 */
export default function MergeSubjects({
  a,
  b,
  members,
  onDone,
}: {
  a: Subject
  b: Subject
  members: (id: string) => number
  onDone: (summary: string) => void
}) {
  const [mainId, setMainId] = useState(() => defaultMain(a, b, members))
  const main = mainId === a.id ? a : b
  const other = mainId === a.id ? b : a
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useSheetLock(busy)

  useEffect(() => {
    let live = true
    setPreview(null)
    setPreviewError(null)
    setSure(false)
    merge({ fromId: other.id, intoId: main.id, dryRun: true })
      .then((r) => live && setPreview(r.data))
      .catch((e) => live && setPreviewError(messageOf(e)))
    return () => {
      live = false
    }
  }, [main.id, other.id])

  const lines = useMemo(() => (preview ? describeCounts(preview.counts) : []), [preview])

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await merge({ fromId: other.id, intoId: main.id })
      onDone(`Połączono „${label(other)}” z „${label(main)}”${lines.length ? `: przeniesiono ${lines.join(', ')}` : ''}.`)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Który przedmiot zostaje?</legend>
        <div className="space-y-2">
          {[a, b].map((s) => (
            <label
              key={s.id}
              className="card has-[:checked]:ring-accent has-[:checked]:bg-accent-soft flex cursor-pointer items-center gap-3 p-3 has-[:checked]:ring-2"
            >
              <input type="radio" name="main" className="sr-only" checked={mainId === s.id} disabled={busy} onChange={() => setMainId(s.id)} />
              <SubjectIcon emoji={s.emoji} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words">{s.name}</span>
                <span className="text-muted block text-xs">
                  {KIND_LABEL[s.kind]} · {members(s.id)} {members(s.id) === 1 ? 'osoba' : 'osób'}
                  {s.usosCode ? ` · ${s.usosCode}` : ''}
                </span>
              </span>
              {mainId === s.id && <span className="badge bg-accent text-white">Zostaje</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-line rounded-xl border p-3 text-sm" aria-live="polite">
        {previewError ? (
          <p className="text-danger">{previewError}</p>
        ) : !preview ? (
          <p className="text-muted">Liczę, co zostanie przeniesione…</p>
        ) : (
          <>
            <p>
              „<strong>{label(other)}</strong>” zostanie usunięty, a do „<strong>{label(main)}</strong>” przejdzie:{' '}
              {lines.length ? lines.join(', ') : 'nic (nie ma żadnych powiązanych danych)'}.
            </p>
            <p className="text-muted mt-1">
              Rodzaj zajęć po połączeniu: <strong>{preview.kind}</strong>.
            </p>
          </>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={sure} disabled={!preview || busy} onChange={(e) => setSure(e.target.checked)} />
        <span>Rozumiem, że połączenia nie da się cofnąć w aplikacji.</span>
      </label>

      {error && <p className="text-danger text-sm">{error}</p>}
      <button className="btn-danger w-full" disabled={!preview || !sure || busy} onClick={submit}>
        {busy ? 'Łączenie…' : `Połącz i usuń „${label(other)}”`}
      </button>
    </div>
  )
}
