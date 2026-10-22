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
    <div className="card bg-accent-soft mb-4 flex items-start justify-between gap-3 p-3.5 text-sm">
      <p>
        Zainstaluj aplikację: w Safari dotknij <strong>Udostępnij</strong> (kwadrat ze strzałką), a potem{' '}
        <strong>Dodaj do ekranu głównego</strong>.
      </p>
      <button className="btn-ghost -m-1 shrink-0" onClick={dismiss}>
        Zamknij
      </button>
    </div>
  )
}
