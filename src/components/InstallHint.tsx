import { useMemo, useState } from 'react'
import { browserName, detectInstall, installSteps, needsInstallGuide, type InstallContext } from '../lib/install'
import Sheet from './Sheet'

const KEY = 'installHintDismissed'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function wasDismissed() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Urządzenie i przeglądarka użytkownika oraz to, czy aplikacja jest już zainstalowana (uruchomiona z ekranu głównego). */
export function useInstallContext(): InstallContext {
  return useMemo(
    () => detectInstall({ ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints, standalone: isStandalone() }),
    [],
  )
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-5 w-5 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

/** Poradnik krok po kroku, jak dodać aplikację do ekranu głównego iPhone'a lub iPada. */
export function InstallGuide({ ctx }: { ctx: InstallContext }) {
  const steps = installSteps(ctx)
  return (
    <div>
      <p className="text-muted text-sm">
        Wykryto: {browserName(ctx.browser)} na {ctx.ipad ? 'iPadzie' : 'iPhonie'}. Zainstalowana aplikacja ma własną ikonę, działa na całym
        ekranie i szybciej się uruchamia.
      </p>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="bg-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" aria-hidden="true">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">
                {s.title}
                {/Udostępnij/.test(s.title) && (
                  <>
                    {' '}
                    <ShareIcon />
                  </>
                )}
              </span>
              {s.detail && <span className="text-muted mt-0.5 block text-sm">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-muted mt-5 text-xs">
        Adres aplikacji: <strong>{location.host}</strong>. Po instalacji logujesz się tak samo jak w przeglądarce.
      </p>
    </div>
  )
}

/** Poradnik w arkuszu; używany przez baner i przez Ustawienia. */
export function InstallGuideSheet({ open, onClose, ctx }: { open: boolean; onClose: () => void; ctx: InstallContext }) {
  return (
    <Sheet open={open} title="Zainstaluj aplikację" onClose={onClose}>
      <InstallGuide ctx={ctx} />
    </Sheet>
  )
}

/** Baner na iPhonie i iPadzie, gdy aplikacja jest otwarta w przeglądarce, a nie z ekranu głównego. */
export default function InstallHint() {
  const ctx = useInstallContext()
  const [hidden, setHidden] = useState(wasDismissed)
  const [open, setOpen] = useState(false)

  if (hidden || !needsInstallGuide(ctx)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // tryb prywatny: ukryj tylko na tę sesję
    }
    setHidden(true)
  }

  return (
    <>
      <div className="card bg-accent-soft mb-4 flex items-start justify-between gap-3 p-3.5 text-sm" role="region" aria-label="Instalacja aplikacji">
        <div>
          <p className="font-medium">Zainstaluj aplikację na {ctx.ipad ? 'iPadzie' : 'iPhonie'}</p>
          <p className="text-muted mt-0.5">Dodaj ją do ekranu głównego, żeby działała jak zwykła aplikacja.</p>
          <button className="btn-primary mt-2.5 min-h-9 py-1.5" onClick={() => setOpen(true)}>
            Jak to zrobić
          </button>
        </div>
        <button className="btn-ghost -m-1 shrink-0" onClick={dismiss}>
          Zamknij
        </button>
      </div>
      <InstallGuideSheet open={open} onClose={() => setOpen(false)} ctx={ctx} />
    </>
  )
}
