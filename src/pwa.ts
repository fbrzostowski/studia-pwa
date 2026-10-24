import { registerSW } from 'virtual:pwa-register'

// Karta otwarta od dawna trzyma stary kod, mimo że Service Worker już się zaktualizował. Zamiast cicho
// przeładowywać (to przerwałoby np. wgrywanie pliku), pokazujemy pasek z przyciskiem „Odśwież”.
let ready = false
const subscribers = new Set<() => void>()

export const subscribe = (fn: () => void) => {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}
export const isUpdateReady = () => ready
export const reload = () => window.location.reload()

const CHECK_EVERY_MS = 30 * 60 * 1000

export function registerPwa() {
  registerSW({
    immediate: true,
    onNeedReload() {
      ready = true
      subscribers.forEach((fn) => fn())
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => {})
      setInterval(check, CHECK_EVERY_MS)
      // wracasz na starą kartę — od razu sprawdź, czy jest nowa wersja
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}
