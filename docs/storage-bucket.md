# Gdzie leżą pliki (bucket w us-central1)

Wszystkie pliki aplikacji (materiały, wgrania, podręczniki) są w buckecie **`studia-pwa-podreczniki`** w regionie
**us-central1**. Domyślny bucket projektu `studia-pwa.firebasestorage.app` jest w `europe-west1`; jego regionu nie da
się zmienić i **nie ma tam bezpłatnego limitu** — Firebase daje go tylko bucketom w `us-central1`, `us-west1`
i `us-east1` (5 GB przechowywania i 100 GB pobrań miesięcznie). Dlatego domyślny bucket ma reguły „wszystko
zablokowane” (`storage.deny.rules`) i nie jest używany.

Nazwę bucketu trzymają dwa miejsca (muszą się zgadzać): `src/firebase/config.ts` (`STORAGE_BUCKET`) oraz
`functions/src/config.ts`.

## Reguły i targety

`firebase.json` odwołuje się do targetów `files` i `closed`, a `.firebaserc` mapuje je na buckety (osobno dla projektu
produkcyjnego i testowego, którego używa emulator). `firebase deploy --only storage` wydaje oba zestawy reguł.

## Wdrażanie

Reguły Storage odwołują się do Firestore (`firestore.get`), więc agent usługi Storage musi mieć rolę
`roles/firebaserules.firestoreServiceAgent`. `firebase-tools` nadaje ją tylko w trybie interaktywnym, a wykrywając agenta AI
albo brak terminala wymusza tryb nieinteraktywny. Wdrażaj więc z flagą **`--interactive`**:

```sh
npx firebase-tools deploy --only functions,storage --project studia-pwa --interactive --force
```

## Koszty poza limitem

Przy przekroczeniu 5 GB lub 100 GB pobrań obowiązuje zwykły cennik Cloud Storage (przechowywanie około 0,02 USD/GB/mies.,
pobrania około 0,12 USD/GB). Dla tej skali to rzędu kilku złotych miesięcznie; alert budżetowy jest ustawiony w konsoli.
