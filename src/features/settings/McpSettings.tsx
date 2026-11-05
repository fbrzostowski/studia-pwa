import { useCallback, useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'

type Connection = { id: string; name: string; createdAt: number | null; lastUsedAt: number | null }
const call = httpsCallable<{ action: 'list' | 'revoke'; id?: string }, { connections?: Connection[] }>(functions, 'mcpConnections')
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))
// adres serwera MCP (Firebase Hosting → funkcja mcp, patrz firebase.json)
const MCP_URL = 'https://studia-pwa.web.app/mcp'
// okno „Dodaj własny konektor” w Claude (claude.ai)
const CLAUDE_CONNECTOR_URL = 'https://claude.ai/new?redirect=claude.com&via=cookie&modal=add-custom-connector#customize/connectors/yours'

const when = (ms: number | null) => (ms ? new Date(ms).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : 'jeszcze nie')

/** Claude i ChatGPT łączą się przez OAuth: wystarczy wkleić adres serwera, logowanie i zgoda są w aplikacji. */
export default function McpSettings() {
  const [list, setList] = useState<Connection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    () =>
      call({ action: 'list' })
        .then((r) => setList(r.data.connections ?? []))
        .catch((e) => setError(messageOf(e))),
    [],
  )
  useEffect(() => {
    void refresh()
  }, [refresh])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
    } catch {
      setError('Nie udało się skopiować — zaznacz adres i skopiuj ręcznie.')
    }
  }

  const revoke = async (c: Connection) => {
    if (!confirm(`Odłączyć „${c.name}”? Ta aplikacja straci dostęp do Twojego konta.`)) return
    setBusy(true)
    setError(null)
    try {
      await call({ action: 'revoke', id: c.id })
      await refresh()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card space-y-3 p-4 text-sm">
      <p>
        Podłącz LOM.SGH do <b>Claude</b> albo <b>ChatGPT</b> i pytaj o plan, materiały z danego dnia i podręczniki oraz dodawaj
        materiały, punkty do nauki i terminy zaliczeń (mid-term, final exam, quiz).
      </p>
      <div className="space-y-2">
        <input className="input font-mono text-xs" readOnly value={MCP_URL} onFocus={(e) => e.currentTarget.select()} aria-label="Adres serwera MCP" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={copy}>
            {copied ? 'Skopiowano' : 'Kopiuj adres'}
          </button>
          <a className="btn-primary" href={CLAUDE_CONNECTOR_URL} target="_blank" rel="noopener noreferrer">
            Dodaj do Claude
          </a>
        </div>
        <p className="text-muted text-xs">
          Claude: „Dodaj do Claude” otwiera okno dodawania konektora (wklej skopiowany adres). ChatGPT: Ustawienia → Aplikacje → tryb dewelopera → Utwórz. Wklej adres,
          a potem zaloguj się i zatwierdź dostęp tutaj, w LOM.SGH. Żadnych kluczy.
        </p>
      </div>

      {list && list.length > 0 && (
        <div>
          <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">Połączone aplikacje</p>
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id} className="border-line flex items-center justify-between gap-3 rounded-xl border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="text-muted text-xs">
                    Połączono: {when(c.createdAt)}. Ostatnio: {when(c.lastUsedAt)}.
                  </p>
                </div>
                <button className="btn-danger shrink-0" disabled={busy} onClick={() => revoke(c)}>
                  Odłącz
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  )
}
