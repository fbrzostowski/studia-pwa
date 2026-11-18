/**
 * Osobny origin (Firebase Hosting, bez sesji aplikacji): stałe linki do stron HTML z podręczników i materiałów,
 * `/p/textbook/ID` i `/p/material/ID`, wydaje funkcja `pages` (functions/src/pages.ts) tylko z ważną sesją.
 */
export const VIEWER_ORIGIN = 'https://studia-pwa.web.app'

export type PageSpec = { kind: 'textbook' | 'material'; id: string }

export const pageUrl = (s: PageSpec) => `${VIEWER_ORIGIN}/p/${s.kind}/${s.id}`

/** `?page=textbook:ID` (funkcja odsyła tu po sesję, gdy jej brak albo wygasła). */
export const pageFromUrl = (search: string): PageSpec | null => {
  const m = new URLSearchParams(search).get('page')?.match(/^(textbook|material):([A-Za-z0-9]{10,40})$/)
  return m ? { kind: m[1] as PageSpec['kind'], id: m[2]! } : null
}

/**
 * Otwiera stronę HTML w nowej karcie pod stałym adresem na osobnym origin. Skrypty strony mają tam własne, trwałe
 * localStorage (np. zapis postępu), ale nie dostają loginu ani danych aplikacji. Adres przeżywa odświeżenie i restart
 * przeglądarki; bez sesji funkcja odsyła do aplikacji, która po zalogowaniu wraca na niego sama (PageHandoff).
 *
 * Dlaczego nie w ramce w aplikacji: ramka z sandboxem nie ma localStorage, a ramka z osobnym origin to „third-party
 * storage” (Safari/Firefox/Brave blokują albo czyszczą, Chrome trzyma osobną kopię).
 *
 * Wołaj bezpośrednio z kliknięcia (inaczej przeglądarka zablokuje nową kartę).
 */
export function openHtmlInIsolatedTab(spec: PageSpec) {
  const w = window.open(pageUrl(spec), '_blank')
  if (!w) throw new Error('Przeglądarka zablokowała nową kartę. Zezwól na wyskakujące okna dla tej strony.')
  w.opener = null // strona podręcznika nie może sterować oknem aplikacji
}
