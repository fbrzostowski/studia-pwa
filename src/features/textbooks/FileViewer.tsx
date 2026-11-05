import { useEffect, useState } from 'react'
import { getBlob, ref } from 'firebase/storage'
import { storage } from '../../firebase/config'
import { openHtmlInIsolatedTab } from './htmlTab'
import { canPreview, hintFor, sandboxFor } from './viewer'

const baseMime = (m: string) => m.split(';')[0]!.trim().toLowerCase()

/**
 * Plik (podręcznik albo załącznik materiału) pokazany na całym ekranie.
 *
 * Plik pobieramy przez SDK Storage z tokenem zalogowanego użytkownika (reguły Storage wpuszczają tylko zatwierdzone konta)
 * i pokazujemy z adresu `blob:`, który istnieje tylko w tej karcie. Nie ma więc linku, który ktoś mógłby skopiować do
 * przeglądarki bez logowania (stałe adresy z tokenem i podpisane adresy działają dla każdego, kto je ma).
 *
 * Bezpieczeństwo: adres `blob:` dziedziczy origin aplikacji, więc HTML (treść wgrana przez użytkownika) pokazujemy tylko
 * w ramce z `sandbox` bez `allow-same-origin` (pusty origin, bez dostępu do logowania i Firestore; localStorage tam nie działa).
 * Strony z localStorage otwiera „Otwórz w nowej karcie”: na osobnym origin (htmlTab.ts, hosting/viewer.html). W nowej karcie
 * bezpośrednio z adresu `blob:` otwieramy tylko typy bierne (PDF, obraz, tekst). Resztę (Word itp.) można tylko pobrać.
 */
export default function FileViewer({
  storagePath,
  title,
  mimeType,
  fileName,
  onClose,
}: {
  storagePath: string
  title: string
  mimeType: string
  fileName?: string
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const previewable = canPreview(mimeType)
  const activeContent = baseMime(mimeType) === 'text/html'

  useEffect(() => {
    let live = true
    let objectUrl: string | null = null
    getBlob(ref(storage, storagePath))
      .then((blob) => {
        // typ ustalamy sami (z bazy), a nie z tego, co odesłał serwer
        const typed = new Blob([blob], { type: baseMime(mimeType) })
        objectUrl = URL.createObjectURL(typed)
        if (live) {
          setBlob(typed)
          setUrl(objectUrl)
        }
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [storagePath, mimeType])

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
        {blob && activeContent && (
          <button
            className="btn-secondary shrink-0"
            onClick={() => {
              try {
                openHtmlInIsolatedTab(blob)
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e))
              }
            }}
          >
            Otwórz w nowej karcie
          </button>
        )}
        {url && previewable && !activeContent && (
          <a className="btn-secondary shrink-0" href={url} target="_blank" rel="noopener noreferrer">
            Otwórz w nowej karcie
          </a>
        )}
        {url && (
          <a className="btn-secondary shrink-0" href={url} download={fileName ?? title}>
            Pobierz
          </a>
        )}
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        {error ? (
          <p className="text-danger p-4 text-sm">Nie udało się otworzyć pliku: {error}</p>
        ) : !url ? (
          <p className="text-muted p-4 text-sm">Ładowanie…</p>
        ) : previewable ? (
          <iframe title={title} src={url} sandbox={sandboxFor(mimeType)} referrerPolicy="no-referrer" className="h-full w-full border-0" />
        ) : (
          <p className="text-muted p-4 text-sm">Tego typu pliku nie da się podejrzeć w aplikacji. Użyj „Pobierz”.</p>
        )}
      </div>
      {previewable && (
        <p className="text-muted border-line bg-surface border-t px-3 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-xs">
          {hintFor(mimeType)}
        </p>
      )}
    </div>
  )
}
