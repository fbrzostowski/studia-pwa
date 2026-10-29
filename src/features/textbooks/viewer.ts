/** Formaty, które przeglądarka wyświetla sama w ramce (bez wysyłania pliku do osób trzecich). */
const INLINE = new Set(['application/pdf', 'text/html', 'text/plain', 'image/png', 'image/jpeg'])

const base = (mime: string) => mime.split(';')[0]!.trim().toLowerCase()

/** Czy podręcznik o tym typie pokazujemy w ramce w aplikacji (reszta, np. Word, otwiera się w nowej karcie). */
export const canPreview = (mime: string) => INLINE.has(base(mime))

/**
 * Atrybut `sandbox` ramki albo undefined. Tylko HTML jest treścią aktywną, więc tylko on dostaje piaskownicę
 * (bez allow-same-origin i allow-top-navigation). PDF, obrazy i tekst nie mogą jej mieć, bo przeglądarka
 * nie uruchomi wtedy własnego podglądu PDF; i tak są obcym origin (Storage), więc nie sięgną do aplikacji.
 */
export const sandboxFor = (mime: string) =>
  base(mime) === 'text/html' ? 'allow-scripts allow-popups allow-popups-to-escape-sandbox' : undefined

/** Podpowiedź pod ramką: PDF w ramce bywa niepełny na telefonach. */
export const hintFor = (mime: string) =>
  base(mime) === 'application/pdf'
    ? 'Na telefonie PDF w ramce bywa pokazany tylko częściowo. Wtedy użyj „Otwórz w nowej karcie”.'
    : 'Nie wyświetla się poprawnie? Użyj „Otwórz w nowej karcie”.'
