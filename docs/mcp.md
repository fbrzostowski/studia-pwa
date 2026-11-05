# MCP: LOM.SGH w Claude i ChatGPT

Aplikacja ma serwer MCP (Cloud Function `mcp`, region `europe-west1`, Streamable HTTP bez stanu). Dzięki niemu Claude
i ChatGPT mogą w imieniu użytkownika czytać plan, materiały, podręczniki, zaliczenia i listy do nauki oraz dodawać
materiały, punkty do nauki i terminy zaliczeń.

Adres serwera: `https://europe-west1-studia-pwa.cloudfunctions.net/mcp/{klucz}`

## Podpięcie (użytkownik)

1. Aplikacja → Ustawienia → **Claude i ChatGPT (MCP)** → „Utwórz klucz”. Adres z kluczem widać tylko raz.
2. **Claude** (claude.ai): Ustawienia → Konektory → Dodaj własny konektor → wklej adres, bez uwierzytelniania.
   Claude Code: `claude mcp add --transport http lom-sgh <adres>`.
3. **ChatGPT**: Ustawienia → Aplikacje → Zaawansowane → tryb dewelopera → Utwórz aplikację → wklej adres,
   uwierzytelnianie: brak.
4. Klucz jest jak hasło. „Unieważnij” w Ustawieniach odcina klienta od razu; „Wygeneruj nowy” zastępuje stary.

Klient, który potrafi wysłać nagłówek, może zamiast adresu z kluczem użyć `Authorization: Bearer {klucz}` (a także `?key=`).

## Narzędzia

| Narzędzie | Co robi |
|---|---|
| `list_subjects` | przedmioty z aplikacji |
| `get_schedule` | plan z USOS na dzień/zakres (`date`, `from`, `to`, `subject`), domyślnie dziś |
| `get_materials` | materiały z danego dnia: podpięte do lekcji i dodane tego dnia; opcjonalnie `subject` |
| `get_material` | pełna notatka/link/plik (plik z linkiem na 60 min) |
| `add_material` | notatka lub link do przedmiotu, opcjonalnie podpięte do lekcji (`date`, `form`, `group`) |
| `search_textbooks` | szukanie podręczników po tytule, nazwie pliku, przedmiocie |
| `get_textbook_link` | link do pobrania podręcznika z Firebase Storage (podpisany, 60 min) |
| `get_exams` | terminy zaliczeń (nadchodzące albo zakres) |
| `add_exam` | mid-term (MID), final exam (FIN), quiz (QUIZ); domyślnie dla grupy autora, bez grupy tylko dla niego; `form`+`group` albo `whole_subject` |
| `get_todos` | prywatne listy do nauki |
| `add_todo` | punkty do listy „Nauka: {przedmiot}” (zakłada ją) albo do listy o podanej nazwie; duplikaty pomija |

Pliki (slajdy, PDF-y) dodaje się tylko w aplikacji — przez MCP nie da się ich wgrać.

## Bezpieczeństwo

- Klucz to 256 bitów losowości (`lom_…`); w Firestore (`mcpTokens/{sha256}`) jest tylko skrót, reguły blokują klienta.
- Jeden klucz na użytkownika, znika razem z kontem (`deleteAccount`). Wyłączone konto (`status != approved`) nie przejdzie.
- Serwer pisze przez Admin SDK (omija reguły), więc `mcpLogic.ts` powtarza walidację z `firestore.rules`
  (`validExam`, limity notatek/list). Listy do nauki i terminy „tylko dla mnie” są dostępne wyłącznie właścicielowi.
- Adres z kluczem może trafić do logów po stronie klienta/hostingu AI — dlatego jest unieważnialny. Pełne OAuth
  (zamiast klucza w adresie) można dodać później bez zmiany narzędzi.

## Wdrożenie

```sh
npx firebase-tools deploy --only functions,firestore:rules --project studia-pwa --interactive --force
```

Linki do plików są podpisywane (V4) przez konto funkcji `drive-sync@studia-pwa.iam.gserviceaccount.com`. Jednorazowo trzeba
mu dać prawo podpisywania samym sobą:

```sh
gcloud iam service-accounts add-iam-policy-binding drive-sync@studia-pwa.iam.gserviceaccount.com \
  --member=serviceAccount:drive-sync@studia-pwa.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator --project studia-pwa
```

Bez tego `get_textbook_link` i pliki w `get_material` zwrócą błąd uprawnień (reszta działa).

## Testy

`tests/mcpLogic.test.ts`, `tests/mcpProtocol.test.ts` (`npm run test:unit`) i `tests/mcpTools.test.ts` (emulator Firestore,
`npm run test:rules`). Podpisywanie linków nie jest testowane lokalnie.

## Linki do plików w aplikacji

Aplikacja nie używa już `getDownloadURL` (stały adres z tokenem, działający bez logowania dla każdego, kto go zdobędzie).
Pliki otwiera przez funkcję `fileLink`, która dla zatwierdzonego konta zwraca podpisany adres ważny 10 minut.
Stare adresy z tokenem działają, dopóki nie uruchomisz jednorazowo (po wdrożeniu funkcji):

```sh
node functions/scripts/revoke-download-tokens.mjs --apply   # bez --apply tylko podgląd
```
