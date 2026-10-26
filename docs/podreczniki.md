# Podręczniki

Podręczniki są przechowywane **w aplikacji** (Firebase Storage + Firestore), bez Dysku Google. Zrezygnowaliśmy z Dysku,
bo konto usługi (`drive-sync`) może zakładać foldery, ale nie może tworzyć plików w cudzym folderze — konta usługi
nie mają własnego miejsca na Dysku (błąd `storageQuotaExceeded`). Obejście wymagałoby OAuth z kontem właściciela.

## Jak to działa

- **Przedmiot z folderem:** przycisk „+ Przedmiot” zakłada przedmiot (jeśli go nie ma) i folder w podręcznikach
  (kolekcja `textbookFolders`, funkcja `createSubjectFolder`). Podręcznik można dodać tylko do przedmiotu z folderem —
  sprawdza to i formularz, i funkcja.
- **Dodanie podręcznika:** formularz wysyła plik do katalogu tymczasowego `uploads/{uid}/` w buckecie
  `studia-pwa-podreczniki`, a funkcja `addTextbook` sprawdza typ (po rozszerzeniu) i rozmiar (do 100 MB), przenosi plik
  do `textbooks/{id}/` i zapisuje wpis w kolekcji `textbooks`. Opcjonalny podfolder to tylko podział w aplikacji.
- **Usuwanie:** funkcja `removeTextbook` (autor wgrania albo admin) kasuje plik i wpis.
- **Odczyt:** wszyscy zatwierdzeni przez reguły Firestore i Storage.

Bucket i koszty: patrz `docs/storage-bucket.md`.

## Sprzątanie po Dysku

Funkcje `syncTextbooks` i `syncTextbooksDaily` oraz konfiguracja Dysku zostały usunięte. W Twoim Dysku Google zostały
foldery założone wcześniej przez aplikację (m.in. `Mathematics`, `Microeconomics I`) — możesz je skasować ręcznie.
Konto `drive-sync` zostaje tożsamością funkcji (role: Firestore i Storage); Drive API można wyłączyć w konsoli Google Cloud.
