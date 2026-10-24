/**
 * Czytelny komunikat dla błędu wgrywania pliku. `storage/unauthorized` bywa skutkiem nieaktualnej karty
 * (stary kod wysyła do bucketu, który już zamknięto), więc podpowiadamy odświeżenie.
 */
export function uploadErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  if (/storage\/unauthorized/.test(raw)) {
    return 'Brak uprawnień do wgrania pliku. Jeśli aplikacja jest otwarta od dawna, odśwież stronę (Ctrl+Shift+R, na telefonie zamknij i otwórz aplikację) i spróbuj ponownie.'
  }
  if (/storage\/canceled/.test(raw)) return 'Wysyłanie zostało przerwane.'
  if (/storage\/retry-limit-exceeded|network/i.test(raw)) {
    return 'Nie udało się wysłać pliku — sprawdź połączenie i spróbuj ponownie.'
  }
  return raw
}
