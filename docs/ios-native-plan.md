# Plan: wygląd „iPhone-native” (styl Apple)

Status: **zaplanowane, nic jeszcze nie zrobione.** Plan na później, do wykonania w dwóch etapach.

Wytyczne ruchu i materiałów bierzemy ze skilla `apple-design` (`.claude/skills/apple-design/`, instalacja lokalna, poza gitem).
Część sprężyn, arkuszy, gumowania i obsługi `prefers-reduced-motion` / `prefers-reduced-transparency` już jest
(patrz `src/components/Sheet.tsx`, `src/components/sheetLogic.ts`, koniec `src/index.css`).

## Ograniczenia (PWA w Safari, nie aplikacja ze sklepu)

- **Haptyki:** brak API. Obejście: `<input type="checkbox" switch>` daje mikro-wibrację w iOS 17.4+; można użyć przy odznaczaniu punktów.
- **SF Symbols i czcionka SF:** nie wolno ich osadzać na stronie (licencja Apple). Używamy systemowego stosu czcionek (na iPhonie to SF Pro,
  jest na urządzeniu) i podobnych otwartych ikon.
- **Gest „wstecz”:** w PWA nie ma przycisku Wstecz przeglądarki, więc przesunięcie od krawędzi trzeba zbudować samemu.
- **Poza zasięgiem PWA:** Face ID, widgety, natywne powiadomienia ekranu blokady.
- Wygląd trzeba oceniać **na prawdziwym iPhonie** (po dodaniu do ekranu głównego), nie tylko w przeglądarce na komputerze.

## Stan obecny (punkt wyjścia)

- Czcionka: `system-ui, -apple-system, …` (na iPhonie SF Pro); tryb pełnoekranowy; `safe-area`; jasny i ciemny motyw.
- Półprzezroczysty nagłówek i dolny pasek z rozmyciem, arkusze z gestami, pasek „nowa wersja”.
- Do zmiany: akcent fioletowy, osobne karty zamiast list grupowanych, logo w nagłówku zamiast dużych tytułów,
  7 okienek `confirm()` przeglądarki, 5 checkboxów i 4 selecty w stylu webowym, `status-bar-style: default`,
  brak ekranów startowych (biały błysk przy uruchomieniu).

## Etap 1 — wygląd (największy efekt, jeden przebieg)

1. **Kolory i tła systemowe.** Jasny: tło grupowane `#F2F2F7`, powierzchnie białe. Ciemny: tło `#000`, powierzchnie `#1C1C1E`.
   Akcent systemowy `#007AFF` (ciemny `#0A84FF`), czerwony `#FF3B30`, zielony `#34C759`. Zaokrąglenia 10–14 px.
   Zmienne CSS już istnieją w `src/index.css` — podmieniamy wartości.
2. **Duże tytuły:** 34 px, pogrubione, `letter-spacing: -0.02em`, zwijające się do małego tytułu w pasku przy przewijaniu.
   Nagłówek: tytuł ekranu zamiast logo; ustawienia i konto jako przycisk w pasku.
3. **Listy grupowane** (jak Ustawienia iOS): jedna zaokrąglona sekcja, wiersze min. 44 px, cienkie separatory z wcięciem, szewrony.
   Najpierw w widokach: Materiały (lista przedmiotów i materiałów), Podręczniki, Zaliczenia (lista), ustawienia.
4. **Dolny pasek kart:** ikony wypełnione dla aktywnej, etykiety 10 px, rozmycie, wysokość 49 pt + obszar bezpieczny.
5. **Własne okna dialogowe i arkusze akcji** zamiast `confirm()`: komponent `ConfirmSheet`/`ActionSheet` oparty na `Sheet`
   (mieści się w istniejącej pracy z arkuszami). Miejsca: usuwanie przedmiotu, materiału, podręcznika, terminu, listy, planu, opuszczenie przedmiotu.
6. **Przełączniki (switch)** zamiast checkboxów (potwierdzenia, „ukryj opanowane”, wybór importu), selecty jako „pickery”.
7. **Pasek stanu i uruchamianie:** `apple-mobile-web-app-status-bar-style: black-translucent`, `viewport-fit=cover` (jest),
   ekrany startowe `apple-touch-startup-image` dla popularnych rozmiarów iPhone’ów, `touch-action: manipulation`
   (bez opóźnienia i zoomu przy podwójnym dotknięciu), wyłączenie podświetlenia dotknięć i zaznaczania w elementach interfejsu.

## Etap 2 — zachowanie

8. **Przejścia nawigacji** (wsuwanie/wysuwanie ekranów, sprężyny wg skilla) i **interaktywne cofanie przesunięciem od lewej krawędzi**
   (rzutowanie pędu, rozstrzyganie zgodnie ze znakiem prędkości).
9. **Arkusze z dwoma wysokościami** (medium/large) i uchwytem; sprężyste przełączanie kart na dolnym pasku.
10. **Opcjonalnie: „Liquid Glass” (iOS 26)** — pływające, półprzezroczyste, mocno zaokrąglone paski i kapsułowe przyciski
    (`backdrop-filter` + jasna krawędź u góry, wg sekcji „Materials” skilla).

## Decyzje do podjęcia przed startem

- **Akcent:** systemowy niebieski iOS (rekomendowane, najbardziej natywny wygląd) czy zostajemy przy obecnym fiolecie marki.
- **Zakres etapu 1:** cała aplikacja naraz czy najpierw Plan i Materiały jako próbka do oceny na iPhonie.
- **Liquid Glass:** robić czy pominąć.

## Jak sprawdzać

- Zrzuty w zestawie podglądowym (`.harness/`) w jasnym i ciemnym motywie, 390 px i komputer; testy zachowania gestów jak dla arkuszy.
- Ocena końcowa na iPhonie: dodać do ekranu głównego, uruchomić z ikony, sprawdzić pasek stanu, ekran startowy, przewijanie
  i gesty. Ograniczony ruch (Ustawienia → Dostępność → Ruch) i ograniczona przezroczystość mają nadal działać.

## Rozmiar i wydajność

Główny plik ma ok. 1,07 MB (325 kB po kompresji). Przy okazji etapu 1 warto podzielić aplikację na części ładowane na żądanie
(Firebase i `motion` osobno), żeby start z ekranu głównego był szybszy.
