# Włączenie Firebase Storage — instrukcja krok po kroku

Dla agenta przeglądarkowego (Claude in Chrome) albo do ręcznego wyklikania. Projekt `studia-pwa` już istnieje (patrz `firebase-setup.md`).

## Zasady dla agenta

- Pracuj na zalogowanym koncie Google. Nie zakładaj nowego.
- **Jeśli konsola wymaga planu Blaze (karta płatnicza) do utworzenia bucketu, ZATRZYMAJ SIĘ** i napisz o tym użytkownikowi. Nie podawaj danych karty i nie włączaj Blaze bez wyraźnej zgody użytkownika.
- Nie zmieniaj niczego poza Storage.

## Kroki

1. Wejdź na https://console.firebase.google.com i otwórz projekt `studia-pwa`.
2. W lewym menu: **Kompilacja → Storage**.
3. Kliknij **Rozpocznij** (Get started).
4. Tryb zabezpieczeń: **Uruchom w trybie produkcyjnym** (reguły wgramy z repozytorium).
5. Lokalizacja: wybierz tę samą co Firestore (`eur3` / `europe-central2`) — jeśli konsola proponuje inną, wybierz region europejski. Lokalizacji nie da się zmienić.
6. Kliknij **Gotowe** (Done) i poczekaj na utworzenie bucketu.
7. Sprawdź, że nazwa bucketu to `studia-pwa.firebasestorage.app` (taka jest w `firebaseConfig`). Jeśli jest inna, zgłoś użytkownikowi.

## Po zakończeniu

Wypisz użytkownikowi: czy bucket powstał, jaka jest jego nazwa i region, oraz czy konsola wymagała Blaze.
