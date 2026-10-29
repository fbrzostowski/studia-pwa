import { useMemo } from 'react'
import { browserName, detectInstall, installSteps, type InstallContext } from '../lib/install'
import Sheet from './Sheet'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

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
export function InstallGuide({ ctx, stepsFor }: { ctx: InstallContext; stepsFor?: InstallContext }) {
  // `stepsFor`: kroki dla innej przeglądarki niż wykryta (np. Safari, gdy prowadzimy tam z Chrome)
  const steps = installSteps(stepsFor ?? ctx)
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
