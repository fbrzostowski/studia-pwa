/** Osobny origin (Firebase Hosting, bez sesji aplikacji): na nim działa strona z wgranym HTML-em; patrz hosting/viewer.html. */
export const VIEWER_ORIGIN = 'https://studia-pwa.web.app'

/**
 * Otwiera pobrany plik HTML w nowej karcie na osobnym origin. Skrypty podręcznika mają tam własne localStorage, ale nie
 * dostają loginu ani danych aplikacji. Wołaj bezpośrednio z kliknięcia (inaczej przeglądarka zablokuje nową kartę).
 */
export function openHtmlInIsolatedTab(blob: Blob) {
  const w = window.open(`${VIEWER_ORIGIN}/viewer.html`, '_blank')
  if (!w) throw new Error('Przeglądarka zablokowała nową kartę. Zezwól na wyskakujące okna dla tej strony.')
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== VIEWER_ORIGIN || e.source !== w || (e.data as { type?: string } | null)?.type !== 'ready') return
    window.removeEventListener('message', onMessage)
    w.postMessage({ type: 'html', blob }, VIEWER_ORIGIN)
  }
  window.addEventListener('message', onMessage)
  setTimeout(() => window.removeEventListener('message', onMessage), 30_000)
}
