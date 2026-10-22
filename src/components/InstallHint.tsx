import { useState } from 'react'

const KEY = 'installHintDismissed'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
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

// iOS nie ma przycisku „zainstaluj” — podpowiadamy ręczny krok w Safari.
export default function InstallHint() {
  const [hidden, setHidden] = useState(wasDismissed)

  if (hidden || !isIos() || isStandalone()) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // tryb prywatny — ukryj tylko na tę sesję
    }
    setHidden(true)
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
      <p>
        Zainstaluj aplikację: w Safari dotknij <strong>Udostępnij</strong> (kwadrat ze strzałką), a potem{' '}
        <strong>Dodaj do ekranu głównego</strong>.
      </p>
      <button className="shrink-0 underline" onClick={dismiss}>
        Zamknij
      </button>
    </div>
  )
}
