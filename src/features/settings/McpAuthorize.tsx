import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'

type Info = { clientName: string; redirectHost: string }
const call = httpsCallable<{ id: string; action: 'info' | 'approve' | 'deny' }, Partial<Info> & { redirect?: string }>(functions, 'mcpAuthorize')
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Ekran zgody OAuth: użytkownik (już zalogowany) zatwierdza albo odrzuca dostęp Claude/ChatGPT do swojego konta. */
export default function McpAuthorize({ id }: { id: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    call({ id, action: 'info' })
      .then((r) => live && setInfo(r.data as Info))
      .catch((e) => live && setError(messageOf(e)))
    return () => {
      live = false
    }
  }, [id])

  const decide = async (action: 'approve' | 'deny') => {
    setBusy(true)
    setError(null)
    try {
      const r = await call({ id, action })
      if (r.data.redirect) window.location.replace(r.data.redirect)
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 text-left">
      {info ? (
        <>
          <p className="text-center">
            <b>{info.clientName}</b> prosi o dostęp do Twojego konta LOM.SGH.
          </p>
          <ul className="text-muted mt-4 list-disc space-y-1 pl-5 text-sm">
            <li>odczyt planu, materiałów, podręczników, zaliczeń i Twoich list do nauki,</li>
            <li>dodawanie materiałów, terminów zaliczeń i punktów do nauki w Twoim imieniu.</li>
          </ul>
          <p className="text-muted mt-3 text-xs">
            Po zatwierdzeniu wrócisz do: {info.redirectHost}. Dostęp odłączysz w Ustawieniach → Claude i ChatGPT.
          </p>
          <div className="mt-5 flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => decide('approve')}>
              Zezwól
            </button>
            <button className="btn-secondary flex-1" disabled={busy} onClick={() => decide('deny')}>
              Odmów
            </button>
          </div>
        </>
      ) : !error ? (
        <p className="text-muted text-center">Ładowanie…</p>
      ) : null}
      {error && <p className="text-danger mt-3 text-center text-sm">{error}</p>}
      {error && (
        <a className="btn-secondary mt-4 block text-center" href="/">
          Wróć do aplikacji
        </a>
      )}
    </div>
  )
}
