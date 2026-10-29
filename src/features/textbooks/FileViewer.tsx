import { useEffect, useState } from 'react'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../../firebase/config'
import { hintFor, sandboxFor } from './viewer'

/**
 * Podręcznik pokazany w iframe na całym ekranie (PDF, HTML, TXT, obrazy).
 *
 * Bezpieczeństwo: HTML to treść wgrana przez użytkownika, więc jego ramka ma `sandbox` bez `allow-same-origin`
 * (strona dostaje „pusty” origin, nie widzi naszych danych logowania ani Firestore), bez `allow-top-navigation`
 * (nie przekieruje aplikacji) i bez formularzy. Pozostałe typy nie mają piaskownicy (inaczej przeglądarka nie
 * pokaże PDF), ale plik i tak jest z obcego origin (Storage). Adres pliku w `src` nie wymaga CORS.
 * Gdyby ramka się nie wyświetlała (np. PDF na telefonie), zostaje „Otwórz w nowej karcie”.
 */
export default function FileViewer({ storagePath, title, mimeType, onClose }: { storagePath: string; title: string; mimeType: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getDownloadURL(ref(storage, storagePath))
      .then((u) => live && setUrl(u))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [storagePath])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="border-line bg-surface flex items-center gap-2 border-b px-3 py-2">
        <button className="btn-ghost -ml-1 shrink-0" onClick={onClose}>
          Zamknij
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{title}</p>
        {url && (
          <a className="btn-secondary shrink-0" href={url} target="_blank" rel="noopener noreferrer">
            Otwórz w nowej karcie
          </a>
        )}
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {error ? (
          <p className="text-danger p-4 text-sm">Nie udało się otworzyć strony: {error}</p>
        ) : !url ? (
          <p className="text-muted p-4 text-sm">Ładowanie…</p>
        ) : (
          <iframe
            title={title}
            src={url}
            sandbox={sandboxFor(mimeType)}
            referrerPolicy="no-referrer"
            className="h-full w-full border-0"
          />
        )}
      </div>
      <p className="text-muted border-line bg-surface border-t px-3 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-xs">
        {hintFor(mimeType)}
      </p>
    </div>
  )
}
