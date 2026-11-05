# MCP: LOM.SGH w Claude i ChatGPT

Aplikacja ma serwer MCP (Cloud Function `mcp`, region `europe-west1`, Streamable HTTP bez stanu) z logowaniem OAuth 2.1.
Claude i ChatGPT mogą w imieniu użytkownika czytać plan, materiały, podręczniki, zaliczenia i listy do nauki oraz dodawać
materiały, punkty do nauki i terminy zaliczeń.

Adres do wklejenia w kliencie: **`https://studia-pwa.web.app/mcp`** (bez żadnych kluczy).

## Podpięcie (użytkownik)

1. **Claude** (claude.ai): Ustawienia → Konektory → Dodaj własny konektor → wklej adres.
   Claude Code: `claude mcp add --transport http lom-sgh https://studia-pwa.web.app/mcp`.
   **ChatGPT**: Ustawienia → Aplikacje → Zaawansowane → tryb dewelopera → Utwórz → wklej adres, uwierzytelnianie OAuth.
2. Klient otwiera LOM.SGH (`app.lomiankowe-sgh.pl/?mcp_authorize=…`): logujesz się przez Google i klikasz „Zezwól”.
3. Połączone aplikacje widać w Ustawieniach → „Claude i ChatGPT (MCP)”, tam też „Odłącz”.

## Jak to działa

```
klient ──401 + resource_metadata──▶ /mcp
klient ──▶ /.well-known/oauth-protected-resource/mcp, /.well-known/oauth-authorization-server
klient ──▶ POST /register          (rejestracja klienta, RFC 7591)
klient ──▶ GET  /authorize         (PKCE S256) ─302─▶ aplikacja: logowanie Google + „Zezwól”
aplikacja ──callable mcpAuthorize──▶ kod (5 min, jednorazowy) ─▶ powrót do klienta
klient ──▶ POST /token             (kod + code_verifier → access 1 h + refresh 60 dni, z rotacją)
klient ──▶ POST /mcp               (Authorization: Bearer …)
```

- Firebase Hosting (`firebase.json`) tylko przekierowuje `/mcp`, `/register`, `/authorize`, `/token` i `/.well-known/**` na
  adres `studia-pwa.web.app` do funkcji `mcp`; strona aplikacji zostaje na GitHub Pages.
- Kolekcje `mcpClients`, `mcpAuthRequests`, `mcpCodes`, `mcpGrants`, `mcpTokens` są niedostępne dla klienta (reguły),
  a tokeny, kody i refresh_token są w bazie wyłącznie jako skróty SHA-256.
- Klienci są publiczni (bez sekretu), PKCE S256 jest obowiązkowe; adres powrotny musi być `https` albo `http://localhost`
  i zgadzać się dokładnie z zarejestrowanym. Konto niezatwierdzone lub usunięte traci dostęp od razu.
- „Odłącz” kasuje uprawnienie i wszystkie jego tokeny; `deleteAccount` robi to samo przy usuwaniu konta.
- Serwer pisze do bazy przez Admin SDK (omija reguły), więc `mcpLogic.ts` powtarza walidację z `firestore.rules`.

## Narzędzia

| Narzędzie | Co robi |
|---|---|
| `list_subjects` | przedmioty z aplikacji |
| `get_schedule` | plan z USOS na dzień/zakres (`date`, `from`, `to`, `subject`), domyślnie dziś |
| `get_materials` | materiały z danego dnia: podpięte do lekcji i dodane tego dnia; opcjonalnie `subject` |
| `get_material` | pełna notatka/link/plik (plik ma `openLink` do aplikacji) |
| `add_material` | notatka lub link do przedmiotu, opcjonalnie podpięte do lekcji (`date`, `form`, `group`) |
| `search_textbooks` | szukanie podręczników po tytule, nazwie pliku, przedmiocie |
| `get_textbook_link` | link do podręcznika w aplikacji (otwiera się po zalogowaniu Google) |
| `get_exams` | terminy zaliczeń (nadchodzące albo zakres) |
| `add_exam` | mid-term (MID), final exam (FIN), quiz (QUIZ); domyślnie dla grupy autora, bez grupy tylko dla niego; `form`+`group` albo `whole_subject` |
| `get_todos` | prywatne listy do nauki |
| `add_todo` | punkty do listy „Nauka: {przedmiot}” (zakłada ją) albo do listy o podanej nazwie; duplikaty pomija |

Pliki (slajdy, PDF-y) dodaje się tylko w aplikacji — przez MCP nie da się ich wgrać.

## Wdrożenie (jednorazowo + przy zmianach)

```sh
npx firebase-tools deploy --only functions,firestore:rules,hosting --project studia-pwa --interactive --force
```

Hosting jest potrzebny tylko do przekierowań (katalog `hosting/` ma stronę-przekierowanie na aplikację). Jeśli projekt nie
ma jeszcze witryny Hosting `studia-pwa`, `firebase init hosting` albo konsola Firebase → Hosting → „Rozpocznij” ją tworzy.
Adresy są w `functions/src/config.ts` (`MCP_BASE`, `APP_URL`) i w `src/features/settings/McpSettings.tsx`.

Bucket musi mieć CORS, żeby aplikacja pobierała pliki z logowaniem (SDK Storage):

```sh
gcloud storage buckets update gs://studia-pwa-podreczniki --cors-file=storage.cors.json --project=studia-pwa
```

Wygasłe tokeny i kody sprząta się same przy użyciu; dla porządku można włączyć w Firestore politykę TTL na polu `expiresAt`
(kolekcje `mcpTokens`, `mcpCodes`, `mcpAuthRequests`).

## Testy

`tests/mcpLogic.test.ts`, `tests/mcpProtocol.test.ts` (`npm run test:unit`) oraz `tests/mcpTools.test.ts` i
`tests/mcpOAuth.test.ts` (emulator Firestore, `npm run test:rules`). Podpisywanie linków i przekierowania Hostingu
nie są testowane lokalnie.

## Pliki i linki

Linki ze Storage (z tokenem `getDownloadURL` ani podpisane) działają dla każdego, kto je ma, więc nigdzie ich nie używamy.

- **Aplikacja:** `FileViewer` pobiera plik przez SDK Storage z tokenem zalogowanego użytkownika (reguły Storage wpuszczają
  tylko zatwierdzone konta) i pokazuje go z adresu `blob:` istniejącego tylko w tej karcie. HTML jest w ramce z `sandbox`
  bez `allow-same-origin`, a w nowej karcie otwierają się tylko typy bierne (PDF, obraz, tekst).
- **MCP (Claude/ChatGPT):** zwracają link do aplikacji `https://app.lomiankowe-sgh.pl/?open=textbook:ID` (albo `material:ID`).
  Bez zalogowania widać ekran logowania, po zalogowaniu plik się otwiera.
- Stare adresy z tokenem działają, dopóki ich nie unieważnisz (po wdrożeniu nowej wersji aplikacji):

```sh
node functions/scripts/revoke-download-tokens.mjs --apply   # bez --apply tylko podgląd
```
