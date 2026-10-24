import { useSyncExternalStore } from 'react'
import { isUpdateReady, reload, subscribe } from '../pwa'

/** Pasek „Dostępna nowa wersja”: stary kod w otwartej karcie bywa niezgodny z serwerem (np. z nowymi regułami). */
export default function UpdateBanner() {
  const ready = useSyncExternalStore(subscribe, isUpdateReady)
  if (!ready) return null
  return (
    <div
      className="bg-accent flex items-center justify-center gap-3 px-4 py-2 text-sm text-white"
      role="status"
    >
      <span>Dostępna jest nowa wersja aplikacji.</span>
      <button className="rounded-lg bg-white/20 px-3 py-1 font-medium hover:bg-white/30" onClick={reload}>
        Odśwież
      </button>
    </div>
  )
}
