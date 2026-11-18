/** Formaty, które przeglądarka wyświetla sama w ramce (bez wysyłania pliku do osób trzecich). */
const INLINE = new Set(['application/pdf', 'text/html', 'text/plain', 'image/png', 'image/jpeg'])

const base = (mime: string) => mime.split(';')[0]!.trim().toLowerCase()

/**
 * Czy otworzyć plik od razu w nowej karcie pod stałym linkiem na osobnym origin (htmlTab.ts) zamiast w ramce.
 * Tak dla strony HTML, która korzysta z pamięci przeglądarki (`usesStorage`, ustalane raz przy dodawaniu pliku):
 * w ramce z sandboxem localStorage nie działa, więc np. zapis postępu by przepadał. Pliki dodane przed tym
 * sprawdzeniem (brak pola) też idą do karty, bo tam działa każda strona.
 */
export const opensInTab = (mime: string, usesStorage?: boolean) => base(mime) === 'text/html' && usesStorage !== false

/** Czy przeglądarka potrafi pokazać ten typ w ramce (Word i podobne nie). */
export const canPreview = (mime: string) => INLINE.has(base(mime))

/** Szerokość (px), poniżej której uznajemy ekran za telefon: ta sama, od której aplikacja pokazuje dolny pasek (sm w Tailwind). */
export const PHONE_MAX_WIDTH = 639

/**
 * Czy otworzyć podręcznik w ramce w aplikacji. Na telefonie nie: tam plik otwiera się jak po „Otwórz w nowej karcie”,
 * bo ramka z PDF-em lub stroną na małym ekranie bywa niepełna i niewygodna. Na tablecie i komputerze w ramce.
 */
export const previewInApp = (mime: string, phone: boolean) => !phone && canPreview(mime)

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
