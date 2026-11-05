import { useCallback, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'

type Status = { exists: boolean; createdAt: number | null; lastUsedAt: number | null }
const call = httpsCallable<{ action: 'status' | 'create' | 'revoke' }, Status & { token?: string }>(functions, 'mcpToken')
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
// ten sam region i projekt co w functions/src/index.ts
const MCP_URL = 'https://europe-west1-studia-pwa.cloudfunctions.net/mcp'

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'jeszcze nie')

/** Podpięcie LOM.SGH do Claude, ChatGPT i innych klientów MCP: osobisty klucz (adres), który widać tylko po utworzeniu. */
export default function McpSettings() {
  const [status, setStatus] = useState<Status | null>(null)
  const [url, setUrl] = useState<string | null>(null) // pełny adres z kluczem, tylko tuż po utworzeniu
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(() => call({ action: 'status' }).then((r) => setStatus(r.data)).catch((e) => setError(messageOf(e))), [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: 'create' | 'revoke') => {
    if (action === 'create' && status?.exists && !confirm('Nowy klucz zastąpi poprzedni — podłączone aplikacje przestaną działać, dopóki nie wkleisz nowego adresu. Kontynuować?')) return
    if (action === 'revoke' && !confirm('Unieważnić klucz? Claude i ChatGPT stracą dostęp do Twojego konta.')) return
    setBusy(true)
    setError(null)
    try {
      const r = await call({ action })
      setUrl(action === 'create' && r.data.token ? `${MCP_URL}/${r.data.token}` : null)
      setCopied(false)
      await refresh()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Nie udało się skopiować — zaznacz adres i skopiuj ręcznie.')
    }
  }

  return (
    <div className="card space-y-3 p-4 text-sm">
      <p>
        Podłącz LOM.SGH do <b>Claude</b> albo <b>ChatGPT</b> (MCP) i pytaj o plan, materiały z danego dnia i podręczniki oraz dodawaj
        materiały, punkty do nauki i terminy zaliczeń (mid-term, final exam, quiz).
      </p>

      {url && (
        <div className="border-accent bg-accent-soft space-y-2 rounded-xl border p-3">
          <p className="font-medium">Twój adres MCP — zobaczysz go tylko teraz</p>
          <input className="input font-mono text-xs" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Adres serwera MCP" />
          <button className="btn-primary" onClick={copy}>
            {copied ? 'Skopiowano' : 'Kopiuj adres'}
          </button>
          <p className="text-muted text-xs">
            To jak hasło: kto ma adres, działa na Twoim koncie. Wklej go w Claude (Ustawienia → Konektory → Dodaj własny) albo ChatGPT
            (Ustawienia → Aplikacje → tryb dewelopera → Utwórz), bez uwierzytelniania.
          </p>
        </div>
      )}

      {status && (
        <p className="text-muted text-xs">
          {status.exists ? `Klucz utworzony: ${when(status.createdAt)}. Ostatnio użyty: ${when(status.lastUsedAt)}.` : 'Nie masz jeszcze klucza.'}
        </p>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" disabled={busy || !status} onClick={() => run('create')}>
          {status?.exists ? 'Wygeneruj nowy klucz' : 'Utwórz klucz'}
        </button>
        {status?.exists && (
          <button className="btn-danger" disabled={busy} onClick={() => run('revoke')}>
            Unieważnij
          </button>
        )}
      </div>
    </div>
  )
}
