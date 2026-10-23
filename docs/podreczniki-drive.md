# Podręczniki z Google Drive — uruchomienie

Zakładka **Podręczniki** pokazuje pliki z jednego folderu na Twoim Google Drive. Kopiuje je tam Cloud Function `syncTextbooks` (przycisk „Synchronizuj z Drive” u admina) oraz `syncTextbooksDaily` (codziennie o 4:00). Funkcja działa jako konto techniczne `drive-sync`, które widzi **tylko** udostępniony mu folder. Użytkownicy aplikacji nie mają dostępu do Twojego Drive — dostają kopie ze Storage, chronione regułami (tylko zatwierdzeni).

- Folder główny to `lom.sgh.podreczniki`; w nim leży jeden folder na przedmiot (nazwa = nazwa przedmiotu w aplikacji), a w nich ewentualne podfoldery (np. `Mikroekonomia / Prezentacje`).
- Folder przedmiotu powstaje sam: w zakładce Podręczniki wybierz **+ Przedmiot** (lista przedmiotów bez folderu), a funkcja `createSubjectFolder` założy go w folderze głównym.
- Dokumenty, Prezentacje i Arkusze Google są eksportowane do PDF. Inne pliki Google (Formularze, skróty) są pomijane.
- Limit pliku: 100 MB. Pliki usunięte z folderu znikają z aplikacji przy kolejnej synchronizacji.

Kroki 1–5 robisz raz w przeglądarce (nadają się dla Claude in Chrome — zasady niżej). Krok 6 to polecenia w terminalu.

## Zasady dla agenta przeglądarkowego

- Pracuj na zalogowanym koncie Google — tym, które jest właścicielem projektu `studia-pwa`.
- **Krok 1 (plan Blaze i karta) wykonuje użytkownik osobiście.** Nie wpisuj danych karty. Jeśli konsola o nie prosi, zatrzymaj się i oddaj użytkownikowi.
- Nie zmieniaj niczego poza opisanymi krokami. Gdy interfejs wygląda inaczej, opisz, co widzisz, i zapytaj.

## 1. Plan Blaze i alert budżetowy (użytkownik)

1. https://console.firebase.google.com/project/studia-pwa/usage/details → **Modify plan / Zmień abonament** → **Blaze**, podpięcie konta rozliczeniowego z kartą.
2. Ustaw alert budżetowy, żeby nic Cię nie zaskoczyło: https://console.cloud.google.com/billing → wybierz konto rozliczeniowe → **Budżety i alerty** → **Utwórz budżet** → kwota np. **10 zł**, alerty na 50%, 90%, 100%.

Przy synchronizacji raz dziennie i małej grupie realny koszt to 0 zł (darmowe limity), ale Cloud Functions i Storage w tym projekcie bez Blaze nie ruszą.

## 2. Włącz Storage (jeśli jeszcze nie)

Instrukcja: `docs/firebase-storage.md` (region europejski, tryb produkcyjny).

## 3. Włącz Google Drive API

1. https://console.cloud.google.com/apis/library/drive.googleapis.com?project=studia-pwa
2. Kliknij **Włącz** (Enable).

Pozostałe API (Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Cloud Scheduler) włączy samo polecenie deploy w kroku 6.

## 4. Konto techniczne `drive-sync`

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=studia-pwa → **Utwórz konto usługi**.
2. Nazwa: `drive-sync`. Identyfikator musi wyjść `drive-sync` → e-mail `drive-sync@studia-pwa.iam.gserviceaccount.com`. **Utwórz i kontynuuj.**
3. Nadaj role (przycisk **Dodaj kolejną rolę** dla każdej):
   - **Użytkownik Cloud Datastore** (Cloud Datastore User) — zapis listy podręczników w Firestore,
   - **Administrator obiektów pamięci masowej** (Storage Object Admin) — kopiowanie plików do Storage,
   - **Zapisujący logi** (Logs Writer) — logi funkcji,
   - **Wywołujący Cloud Run** (Cloud Run Invoker) — uruchamianie nocnej synchronizacji przez harmonogram.
4. **Gotowe.** Nie twórz kluczy (JSON) — nie są potrzebne, funkcja działa jako to konto bez pliku z kluczem.

## 5. Folder na Drive

1. Na swoim Google Drive utwórz folder, np. `LOM.SGH – podręczniki`, i wrzuć do niego pliki (podfoldery wg przedmiotów).
2. Prawy przycisk na folderze → **Udostępnij** → wpisz `drive-sync@studia-pwa.iam.gserviceaccount.com` → rola **Edytujący** → odznacz „Powiadom” → **Udostępnij**.
   Rola Edytujący jest potrzebna tylko do zakładania folderów przedmiotów; konto widzi i zmienia wyłącznie ten jeden folder.
   Nie zmieniaj ogólnego dostępu folderu — ma zostać „Ograniczony”.
   Jeśli folder ma inną nazwę, zmień ją na `lom.sgh.podreczniki` (ID w adresie się nie zmienia, więc konfiguracja zostaje).
3. Otwórz folder i skopiuj jego ID z adresu: `https://drive.google.com/drive/folders/`**`TO_JEST_ID`**.

## 6. Deploy (terminal, w katalogu `studia-pwa`)

```sh
npx firebase-tools login --no-localhost        # jeśli jeszcze nie
cp functions/.env.example functions/.env       # i wpisz DRIVE_FOLDER_ID z kroku 5.3
npx firebase-tools deploy --only functions,firestore:rules,storage --project studia-pwa
```

Pierwszy deploy trwa kilka minut. Gdy CLI zapyta o włączenie API albo o politykę czyszczenia obrazów w Artifact Registry — zgódź się (domyślne odpowiedzi są w porządku).

## 7. Sprawdzenie

W aplikacji (jako admin): **Podręczniki → Synchronizuj z Drive**. Pod przyciskiem pojawi się podsumowanie (nowe / zaktualizowane / usunięte / pominięte), a pliki — na liście.

Najczęstsze problemy:

- **„Konto drive-sync nie może zakładać folderów”** — na folderze głównym konto ma rolę Przeglądający; zmień ją na Edytujący.
- **„File not found” / pusta lista** — folder nie jest udostępniony kontu `drive-sync…` albo `DRIVE_FOLDER_ID` jest błędne.
- **Błąd uprawnień do Firestore/Storage w logach** — brakuje roli z kroku 4.3. Logi: https://console.cloud.google.com/logs/query?project=studia-pwa
- **„Synchronizację uruchamia tylko administrator”** — zalogowane konto nie ma `role: admin` i `status: approved`.
