# Konfiguracja Firebase — instrukcja krok po kroku

Instrukcja dla agenta przeglądarkowego (Claude in Chrome) albo do ręcznego wyklikania. Cel: projekt Firebase z logowaniem Google i bazą Firestore, plus na końcu obiekt `firebaseConfig` do przekazania do kodu.

## Zasady dla agenta

- Pracuj na koncie Google, które jest już zalogowane w przeglądarce. Nie zakładaj nowego konta.
- Zostań na darmowym planie **Spark**. **Nie włączaj planu Blaze** i **nie podawaj danych karty płatniczej**. Jeśli konsola o to poprosi, zatrzymaj się i zapytaj użytkownika.
- **Nie włączaj** Storage, Hosting, Cloud Functions ani Analytics. To późniejsze etapy.
- Nie klikaj nic, czego nie ma w krokach poniżej. Jeśli interfejs wygląda inaczej niż opisano, opisz użytkownikowi, co widzisz, i zapytaj.
- Nazwy przycisków mogą być po polsku albo po angielsku, zależnie od języka konsoli.

Konsola: https://console.firebase.google.com

## Krok 1 — Utwórz projekt

1. Wejdź na https://console.firebase.google.com.
2. Kliknij **Utwórz projekt** (Create a project / Add project).
3. Nazwa projektu: `studia-pwa`. Zatwierdź identyfikator, który zaproponuje konsola (może mieć dopisany sufiks), i kliknij **Dalej**.
4. Jeśli pojawi się pytanie o Gemini w Firebase, wyłącz je albo pomiń.
5. **Google Analytics: wyłącz** i kliknij **Utwórz projekt**.
6. Poczekaj na komunikat, że projekt jest gotowy, i kliknij **Dalej** (Continue).

## Krok 2 — Włącz logowanie Google

1. W lewym menu wybierz **Kompilacja → Authentication** (Build → Authentication).
2. Kliknij **Rozpocznij** (Get started).
3. Na karcie **Sign-in method** wybierz dostawcę **Google**.
4. Przełącz **Włącz** (Enable) na włączone.
5. W polu **Publiczna nazwa projektu** zostaw domyślną albo wpisz `Łomiankowe SGH`.
6. W polu **Adres e-mail pomocy** wybierz konto użytkownika z listy.
7. Kliknij **Zapisz**.

## Krok 3 — Dodaj autoryzowaną domenę

1. W Authentication wejdź w **Ustawienia** (Settings) → **Autoryzowane domeny** (Authorized domains).
2. Kliknij **Dodaj domenę** (Add domain).
3. Wpisz dokładnie: `fbrzostowski.github.io` (bez `https://` i bez ukośnika) i zatwierdź.
4. Sprawdź, że na liście jest też `localhost`. Jeśli go nie ma, dodaj.

## Krok 4 — Utwórz bazę Firestore

1. W lewym menu wybierz **Kompilacja → Firestore Database**.
2. Kliknij **Utwórz bazę danych** (Create database).
3. Edycja: **Standard**. Identyfikator bazy zostaw `(default)`.
4. Lokalizacja: wybierz **`eur3 (europe-west)`** albo **`europe-central2 (Warsaw)`**. Lokalizacji nie da się później zmienić.
5. Reguły zabezpieczeń: wybierz **Uruchom w trybie produkcyjnym** (Start in production mode). Reguły wgramy później z repozytorium.
6. Kliknij **Utwórz** i poczekaj, aż baza będzie gotowa.

## Krok 5 — Zarejestruj aplikację webową i pobierz konfigurację

1. Kliknij ikonę zębatki obok „Przegląd projektu” → **Ustawienia projektu** (Project settings).
2. Na karcie **Ogólne** przewiń do sekcji **Twoje aplikacje** (Your apps).
3. Kliknij ikonę **`</>`** (Web).
4. Pseudonim aplikacji: `studia-pwa-web`.
5. Pole **Firebase Hosting: zostaw niezaznaczone**.
6. Kliknij **Zarejestruj aplikację** (Register app).
7. Konsola pokaże kod z obiektem `firebaseConfig`. Skopiuj wartości z tego obiektu:
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
   Jeśli `measurementId` jest, też je przepisz, ale nie jest wymagane.
8. Kliknij **Przejdź do konsoli** (Continue to console). Nie instaluj niczego przez npm.

## Krok 6 — Zwróć wynik użytkownikowi

Wypisz użytkownikowi w czacie obiekt w tym formacie, z prawdziwymi wartościami:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

To nie są sekrety — każdy odwiedzający stronę i tak je widzi. Ochronę danych zapewniają reguły Firestore, nie tajność tych kluczy.

## Lista kontrolna po zakończeniu

- [ ] Projekt `studia-pwa` utworzony, Analytics wyłączone.
- [ ] Authentication → Sign-in method: Google włączony.
- [ ] Autoryzowane domeny zawierają `fbrzostowski.github.io` i `localhost`.
- [ ] Firestore utworzony w trybie produkcyjnym, region w Europie.
- [ ] Aplikacja webowa zarejestrowana, `firebaseConfig` przekazany użytkownikowi.
- [ ] Plan nadal Spark (bez karty).

## Co dalej (nie dotyczy tej instrukcji)

Po przekazaniu `firebaseConfig` kod podepnie logowanie, wgra `firestore.rules`, a użytkownik po pierwszym zalogowaniu ręcznie ustawi sobie w Firestore, w dokumencie `users/{jego uid}`, pola `role: "admin"` i `status: "approved"`.
