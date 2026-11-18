import { useEffect, useState } from 'react'
import { useAuth } from '../../firebase/AuthContext'
import { VIEWER_ORIGIN, type PageSpec } from './htmlTab'

/**
 * Przekazuje sesję do stałego linku strony HTML (`studia-pwa.web.app/p/…`): wysyła token zalogowanego użytkownika
 * formularzem POST do funkcji `pages`, która ustawia ciasteczko sesji i od razu otwiera stronę w tej samej karcie.
 *
 * Trafiamy tu, gdy funkcja nie znalazła ważnej sesji (pierwsze otwarcie, wygasła po 14 dniach, inna przeglądarka)
 * albo z linku `?open=` do strony HTML. Token idzie w treści POST, nie w adresie, i tylko na nasz origin.
 */
export default function PageHandoff({ spec }: { spec: PageSpec }) {
  const { user } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    user!
      .getIdToken(true)
      .then((idToken) => {
        if (!live) return
        // „Wstecz” z podręcznika ma wrócić do aplikacji, a nie znów tutaj (pętla przekierowań)
        window.history.replaceState(null, '', window.location.pathname)
        const form = document.createElement('form')
        form.method = 'POST'
        form.action = `${VIEWER_ORIGIN}/p/login`
        for (const [name, value] of Object.entries({ idToken, next: `/p/${spec.kind}/${spec.id}` })) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = name
          input.value = value
          form.appendChild(input)
        }
        document.body.appendChild(form)
        form.submit()
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [user, spec])

  return error ? <p className="text-danger mt-4 text-sm">Nie udało się otworzyć podręcznika: {error}</p> : <p className="text-muted mt-4">Otwieranie podręcznika…</p>
}
