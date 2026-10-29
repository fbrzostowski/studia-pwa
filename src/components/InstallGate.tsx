import { useEffect, useState, type ReactNode } from 'react'
import { canTryHandoff, needsInstallGuide, safariUrl } from '../lib/install'
import { InstallGuide, useInstallContext } from './InstallHint'

const SKIP_KEY = 'installGateSkipped'
const HANDOFF_KEY = 'safariHandoffTried'
const logo = `${import.meta.env.BASE_URL}favicon.svg`

const flag = (key: string) => {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
const setFlag = (key: string) => {
  try {
    sessionStorage.setItem(key, '1')
  } catch {
    // tryb prywatny: pamiętamy tylko do przeładowania strony
  }
}

/**
 * Na iPhonie i iPadzie, gdy aplikacja jest otwarta w przeglądarce (nie z ekranu głównego), pokazuje poradnik instalacji
 * na całej stronie, także zalogowanym. Poniżej jest mały przycisk „Kontynuuj w przeglądarce” (do końca tej sesji karty).
 * W Chrome, Firefoksie, Edge i Operie zamiast poradnika jest jeden przycisk „Zainstaluj przez Safari” (działa po dotknięciu)
 * i zapasowe „Skopiuj adres”; dodatkowo raz na sesję próbujemy przejść automatycznie w ukrytej ramce (nic nie psuje,
 * gdy się nie uda). W przeglądarce wbudowanej w aplikację (Messenger, Instagram) przycisk by nie zadziałał, więc są tylko
 * dwa kroki: „Więcej” → „Otwórz w przeglądarce”.
 */
export default function InstallGate({ children }: { children: ReactNode }) {
  const ctx = useInstallContext()
  const [skipped, setSkipped] = useState(() => flag(SKIP_KEY))
  const [copied, setCopied] = useState(false)
  const gated = needsInstallGuide(ctx) && !skipped
  const handoff = canTryHandoff(ctx)

  useEffect(() => {
    if (!gated || !handoff || flag(HANDOFF_KEY)) return
    setFlag(HANDOFF_KEY)
    const t = setTimeout(() => {
      const f = document.createElement('iframe')
      f.hidden = true
      f.src = safariUrl(location.href)
      document.body.appendChild(f)
      setTimeout(() => f.remove(), 3000)
    }, 1200)
    return () => clearTimeout(t)
  }, [gated, handoff])

  if (!gated) return <>{children}</>

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setCopied(true)
    } catch {
      window.prompt('Skopiuj adres i wklej go w Safari:', location.href)
    }
  }
  const skip = () => {
    setFlag(SKIP_KEY)
    setSkipped(true)
  }

  return (
    <main
      className="bg-bg fixed inset-0 z-50 overflow-y-auto px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      aria-label="Instalacja aplikacji"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <div className="text-center">
          <img src={logo} alt="" className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{ctx.browser === 'inapp' ? 'Łomiankowe SGH' : 'Zainstaluj aplikację'}</h1>
          <p className="text-muted mt-1 text-sm">
            {handoff
              ? 'Instalacja działa tylko z Safari. Jedno dotknięcie i przejdziesz do niego.'
              : ctx.browser === 'inapp'
                ? 'Otwórz tę stronę w przeglądarce:'
                : 'Łomiankowe SGH działa najlepiej dodane do ekranu głównego.'}
          </p>
        </div>

        {handoff ? (
          // Chrome, Firefox, Edge, Opera: bez ściany tekstu, jeden przycisk. Kroki pokaże dopiero Safari.
          <section className="mt-10 text-center" aria-label="Przejście do Safari">
            <a className="btn-primary flex w-full justify-center py-3.5 text-base" href={safariUrl(location.href)}>
              Zainstaluj przez Safari
            </a>
            <button className="text-muted hover:text-text mt-4 text-sm underline underline-offset-4" onClick={copy}>
              {copied ? 'Skopiowano. Wklej adres w Safari' : 'Nie działa? Skopiuj adres'}
            </button>
          </section>
        ) : (
          <section className="mt-6" aria-label="Poradnik instalacji">
            <InstallGuide ctx={ctx} />
          </section>
        )}

        <div className="mt-auto pt-10 text-center">
          <button className="text-muted hover:text-text text-sm underline underline-offset-4" onClick={skip}>
            Kontynuuj w przeglądarce
          </button>
        </div>
      </div>
    </main>
  )
}
