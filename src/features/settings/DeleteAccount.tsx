import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'
import { useSheetLock } from '../../components/Sheet'
import { describeAccount, type AccountCounts } from '../subjects/logic'

export const DELETED_KEY = 'accountDeleted'
export const CONFIRM_WORD = 'USUŃ'

const call = httpsCallable<{ dryRun?: boolean; confirm?: boolean }, { counts: AccountCounts }>(functions, 'deleteAccount')
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Usunięcie własnego konta. Serwer czyści dane osobiste, a materiały, podręczniki, przedmioty i grupy zostają.
 * Potwierdzenie wymaga wpisania słowa USUŃ; podgląd (co zniknie) liczy serwer, on też pilnuje ostatniego admina.
 */
export default function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [counts, setCounts] = useState<AccountCounts | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useSheetLock(busy)

  useEffect(() => {
    let live = true
    call({ dryRun: true })
      .then((r) => live && setCounts(r.data.counts))
      .catch((e) => live && setPreviewError(messageOf(e)))
    return () => {
      live = false
    }
  }, [])

  const lines = useMemo(() => (counts ? describeAccount(counts) : []), [counts])
  const confirmed = typed.trim().toLocaleUpperCase('pl') === CONFIRM_WORD

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await call({ confirm: true })
      try {
        sessionStorage.setItem(DELETED_KEY, '1')
      } catch {
        // tryb prywatny: komunikat po wylogowaniu się nie pokaże, konto i tak jest usunięte
      }
      onDeleted()
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">Usunięcie konta jest nieodwracalne.</p>

      <div className="border-line rounded-xl border p-3 text-sm" aria-live="polite">
        {previewError ? (
          <p className="text-danger">{previewError}</p>
        ) : !counts ? (
          <p className="text-muted">Liczę, co zostanie usunięte…</p>
        ) : (
          <>
            <p>
              <strong>Zostanie usunięte:</strong> {lines.length ? lines.join(', ') : 'tylko profil'}, nazwa użytkownika i konto logowania.
            </p>
            <p className="text-muted mt-2">
              <strong>Zostanie:</strong> Twoje materiały i podręczniki razem z Twoim podpisem (usunąć je będzie mógł tylko
              administrator) oraz przedmioty i grupy.
            </p>
          </>
        )}
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Aby potwierdzić, wpisz {CONFIRM_WORD}
        <input
          className="input"
          value={typed}
          disabled={!counts || busy}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          aria-label={`Wpisz ${CONFIRM_WORD}, aby potwierdzić`}
        />
      </label>

      {error && <p className="text-danger text-sm">{error}</p>}
      <button className="btn-danger w-full" disabled={!counts || !confirmed || busy} onClick={submit}>
        {busy ? 'Usuwanie…' : 'Usuń moje konto'}
      </button>
    </div>
  )
}
