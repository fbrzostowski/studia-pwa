# Plan: PWA do organizacji zajęć na studiach

Dokument planistyczny — do wykorzystania jako punkt wyjścia przy kodowaniu (np. w Claude Code). Zakres i decyzje poniżej: backend = **Firebase**, model udostępniania materiałów/kont = **jedna wspólna przestrzeń dla wszystkich zalogowanych**, offline = **pełny cache materiałów (Service Worker)**, źródło wspólnych podręczników/prezentacji = **Twój Google Drive, synchronizowany przez service account do Firebase**.

## 1. Cel i zakres

Aplikacja PWA (instalowalna na iPhone, dostępna też jako zwykła strona na komputerze) do organizacji zajęć na studiach:

- logowanie/rejestracja przez Google OAuth2,
- wspólne materiały z zajęć (notatki, slajdy, linki) widoczne dla wszystkich zalogowanych,
- wspólna lista/repozytorium podręczników i prezentacji — źródłem jest Twój Google Drive,
- opcjonalna integracja z Google Calendar — wpisywanie terminów kolokwiów ("kolosów"),
- działanie offline (ostatnio otwarte materiały dostępne bez internetu).

Hosting frontendu: GitHub Pages (statyczny hosting — to ważne ograniczenie, patrz pkt 3).

## 2. Stos technologiczny

| Warstwa | Wybór | Uzasadnienie / alternatywa |
|---|---|---|
| Frontend | React + Vite + TypeScript | Szybki setup, `vite-plugin-pwa` daje Service Worker "za darmo" (Workbox pod maską). Alternatywa: Svelte (lżejszy) lub czysty JS (mniej narzutu, trudniej o typy). |
| Stylowanie | Tailwind CSS | Szybkie prototypowanie layoutu panelu. |
| Backend / dane | Firebase (Firestore + Firebase Auth + Firebase Storage + Cloud Functions) | Zero własnego serwera dla frontu — kluczowe, bo GitHub Pages nie hostuje backendu. Cloud Functions wymaga planu **Blaze** (patrz pkt 7). |
| Logowanie | Firebase Auth, provider Google (OAuth2) | Wbudowany, parę linii kodu. |
| Źródło podręczników/prezentacji | Twój Google Drive (jeden udostępniony folder) + Google Drive API v3 | Wygodne miejsce pracy dla Ciebie — wrzucasz plik na Drive, appka go "zauważa" przy kolejnej synchronizacji. |
| Mechanizm synchronizacji | Service account (Google Cloud) + Cloud Function | Service account ma dostęp tylko do jednego udostępnionego folderu na Twoim prywatnym Drive — nic więcej. Function kopiuje pliki do Firebase Storage i zapisuje metadane w Firestore. |
| Kalendarz | Google Calendar API (Google Identity Services, osobny scope, per użytkownik) | Niezależne od logowania w appce — patrz pkt 6. |
| Hosting | GitHub Pages + GitHub Actions (build + deploy) | Darmowe, HTTPS "z pudełka". |
| PWA / offline | `vite-plugin-pwa` (Workbox) | Cache-first dla zasobów statycznych, strategia dla danych — patrz pkt 8. |

## 3. Kluczowe ograniczenie: GitHub Pages = tylko frontend

GitHub Pages serwuje statyczne pliki — nie ma tam kodu serwerowego, bazy danych ani sesji. Wszystko, co wymaga trwałego zapisu albo dostępu do sekretów (token service account, komunikacja z Google Drive API w Twoim imieniu), musi iść przez Firebase. Klucze konfiguracyjne Firebase w kodzie klienta są z natury publiczne — bezpieczeństwo zapewniają **Firestore/Storage Security Rules**, nie tajność kluczy. Firebase Auth wymaga dodania domeny GitHub Pages do **Authorized domains**, inaczej logowanie Google nie zadziała na produkcji. Jeśli użyjesz routingu klienckiego (React Router w trybie "history"), GitHub Pages zwróci 404 po odświeżeniu podstrony — rozwiązanie: kopia `index.html` jako `404.html`, albo prościej `HashRouter`.

## 4. Model danych (Firestore)

Firestore to baza dokumentowa (NoSQL) — inaczej niż relacyjne ERD z Twojego kursu: bez JOIN-ów, dane bywa sensowniej duplikować niż łączyć kluczami.

**users** (dokument per użytkownik, id = UID z Firebase Auth)
- `displayName`, `email`, `photoURL`, `createdAt`,
- `role`: `"user"` | `"admin"`,
- `status`: `"pending"` | `"approved"` | `"rejected"`,
- `reviewedBy`, `reviewedAt` (kto i kiedy zatwierdził/odrzucił).

Przy pierwszym logowaniu klient tworzy własny dokument z `role: "user"`, `status: "pending"` (reguły wymuszają dokładnie te wartości). Zmieniać `role` i `status` może tylko admin.

**subjects** (przedmioty — wspólna lista)
- `name`, `createdBy`, `createdAt`.

**materials** (wspólne materiały z zajęć — notatki/slajdy/linki dodawane ręcznie przez użytkowników appki)
- `subjectId`, `title`, `type` (notatka / slajd / link),
- `url` lub `storagePath`,
- `ownerId`, `createdAt`.

**textbooks** (wspólne podręczniki i prezentacje — pochodzące z Google Drive)
- `title`, `subjectId` (opcjonalnie),
- `storagePath` (plik skopiowany do Firebase Storage przez Cloud Function),
- `driveFileId` (żeby wiedzieć, który plik na Drive to jest — do wykrywania zmian przy kolejnej synchronizacji),
- `lastSyncedAt`, `addedBy: "drive-sync"`.

**exams** (kolosy)
- `subjectId`, `title`, `date`, `createdBy`, `googleCalendarEventId`.

Model udostępniania to "jedna wspólna przestrzeń dla zatwierdzonych użytkowników" — każdy użytkownik ze `status: "approved"` ma te same prawa odczytu, bez kolekcji grup/uprawnień. Konto Google samo w sobie nie wystarcza: nowa osoba czeka na zatwierdzenie przez admina (patrz pkt 5). Koszt: brak izolacji między np. rocznikami, jeśli appka się rozrośnie (łatwo dodać `groupId` później).

## 5. Role, zatwierdzanie kont i uprawnienia

### Role
- **user** — po zatwierdzeniu czyta wszystko, dodaje materiały/kolokwia, edytuje i usuwa tylko własne.
- **admin** — wszystko co user, plus: zatwierdza/odrzuca konta, nadaje i odbiera rolę admina, usuwa cudze treści, uruchamia "Sync now" z Drive.

### Przepływ rejestracji
1. Ktoś loguje się Google po raz pierwszy → klient tworzy `users/{uid}` z `role: "user"`, `status: "pending"`.
2. Użytkownik `pending` widzi tylko ekran "Konto czeka na zatwierdzenie" (UI), a reguły blokują mu odczyt jakichkolwiek danych poza własnym dokumentem `users`.
3. Admin w panelu "Wnioski o dostęp" widzi listę `status == "pending"` i klika Zatwierdź/Odrzuć → ustawia `status`, `reviewedBy`, `reviewedAt`.
4. Użytkownik `approved` dostaje dostęp (klient nasłuchuje na swój dokument `users/{uid}` przez `onSnapshot`, więc ekran odświeża się sam).
5. `rejected` widzi komunikat o odmowie; ponowny wniosek tylko przez admina (zmiana statusu z powrotem na `pending`).

### Pierwszy admin (bootstrap)
Nikt nie może zatwierdzić pierwszego admina, więc robisz to ręcznie: logujesz się raz do appki, po czym w Firebase Console → Firestore ręcznie ustawiasz w swoim dokumencie `role: "admin"`, `status: "approved"`. Kolejnych adminów mianuje już panel.

### Firestore Security Rules — szkic

Zasady: dostęp do danych ma tylko `approved`; modyfikuje/usuwa tylko własne treści (admin: dowolne); `role`/`status` zmienia wyłącznie admin; `textbooks` zapisuje tylko Cloud Function (Admin SDK, poza regułami).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function me() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function signedIn() { return request.auth != null; }
    function isApproved() {
      return signedIn()
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && me().status == 'approved';
    }
    function isAdmin() { return isApproved() && me().role == 'admin'; }

    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAdmin());
      // pierwsze logowanie: wyłącznie pending/user
      allow create: if signedIn() && request.auth.uid == uid
                    && request.resource.data.status == 'pending'
                    && request.resource.data.role == 'user';
      // user może zmienić tylko pola profilu, nie role/status
      allow update: if signedIn() && request.auth.uid == uid
                    && request.resource.data.role == resource.data.role
                    && request.resource.data.status == resource.data.status;
      // admin zmienia wszystko (zatwierdzanie, role)
      allow update: if isAdmin();
      allow delete: if isAdmin();
    }

    match /subjects/{docId} {
      allow read: if isApproved();
      allow create: if isApproved() && request.resource.data.createdBy == request.auth.uid;
      allow update, delete: if isAdmin()
        || (isApproved() && resource.data.createdBy == request.auth.uid);
    }

    match /materials/{docId} {
      allow read: if isApproved();
      allow create: if isApproved() && request.resource.data.ownerId == request.auth.uid;
      allow update, delete: if isAdmin()
        || (isApproved() && resource.data.ownerId == request.auth.uid);
    }

    match /exams/{docId} {
      allow read: if isApproved();
      allow create: if isApproved() && request.resource.data.createdBy == request.auth.uid;
      allow update, delete: if isAdmin()
        || (isApproved() && resource.data.createdBy == request.auth.uid);
    }

    match /textbooks/{docId} {
      allow read: if isApproved();
      allow write: if false; // tylko Cloud Function (Admin SDK)
    }
  }
}
```

Uwagi:
- Każda reguła z `get()` kosztuje jeden dodatkowy odczyt dokumentu `users` (liczy się do limitu 50 000/dzień) — przy małej grupie pomijalne. Alternatywa na później: custom claims ustawiane przez Cloud Function przy zatwierdzeniu (`request.auth.token.approved`), bez dodatkowych odczytów.
- Reguły Storage robią to samo przez `firestore.get(...)` (funkcja dostępna w Storage Rules): odczyt plików tylko dla `approved`, zapis do `materials/{uid}/...` tylko dla właściciela, `textbooks/` tylko do odczytu.
- Ochrona przed zmianą `role`/`status` przez samego użytkownika jest w regule `update` na `users` — to najważniejszy fragment, przetestuj go w emulatorze Firebase.
- Opcjonalnie: powiadomienie admina o nowym wniosku (e-mail z Cloud Function) — poza zakresem MVP; na start admin sprawdza panel.

## 6. Trzy odrębne mechanizmy "Google" w tym projekcie — nie pomyl ich

- **Logowanie (kto jesteś)** — Firebase Auth, provider Google, minimalny scope (profil/e-mail). Dotyczy każdego użytkownika appki.
- **Dostęp do Google Calendar (kolosy)** — osobny, dodatkowy scope (`calendar.events`), osobna zgoda per użytkownik, własna konfiguracja w Google Cloud Console (OAuth consent screen). Dotyczy użytkownika, który chce dopisać termin do swojego kalendarza.
- **Dostęp do Twojego Google Drive (podręczniki/prezentacje)** — **nie** dotyczy zwykłych użytkowników appki w ogóle. To osobny mechanizm: service account (tożsamość techniczna w Google Cloud, nie login człowieka), której udostępniasz jeden folder na swoim prywatnym Drive. Żaden użytkownik appki nie loguje się do Twojego Drive i nie widzi go bezpośrednio — zawsze przechodzi przez Firestore/Storage.

## 7. Synchronizacja Google Drive → Firebase (service account)

Kroki konfiguracji (jednorazowe):

1. W konsoli Google Cloud (tym samym projekcie co Firebase) tworzysz **service account**, np. `drive-sync@twoj-projekt.iam.gserviceaccount.com`.
2. Na swoim prywatnym Google Drive udostępniasz **jeden konkretny folder** (ten z podręcznikami/prezentacjami) temu adresowi e-mail jako "Przeglądający". Service account nie widzi nic innego na Twoim Drive.
3. Włączasz Drive API w tym projekcie Google Cloud.
4. Włączasz plan **Blaze** w Firebase (wymagany dla Cloud Functions — patrz koszty w pkt 9).
5. Piszesz Cloud Function, która (pod tożsamością service account, bez trzymania żadnego pliku z kluczem w kodzie — Cloud Functions w tym samym projekcie mogą używać service account natywnie) woła Google Drive API po listę plików w folderze, i dla nowych/zmienionych plików: kopiuje treść do Firebase Storage, zapisuje/aktualizuje dokument w kolekcji `textbooks` (pola `storagePath`, `driveFileId`, `lastSyncedAt`).
6. Wyzwalacz tej funkcji: najprościej czasowy (Cloud Scheduler, np. raz dziennie) albo przycisk "Sync now" w panelu administracyjnym appki (funkcja HTTPS callable wywoływana ręcznie, kiedy akurat coś wgrałeś na Drive).

Dlaczego kopiować pliki do Storage, a nie tylko linkować do Drive: skoro folder jest udostępniony *tylko* service accountowi, zwykły użytkownik appki i tak nie mógłby otworzyć linku Drive bezpośrednio (brak uprawnień). Kopiowanie do Storage utrzymuje jeden, konsekwentny model bezpieczeństwa (Firestore/Storage Rules) dla wszystkich materiałów w appce — front-end nie musi wiedzieć, że część danych "przyszła" z Drive.

## 8. PWA i specyfika iPhone/Safari

- Instalacja tylko ręczna: Safari → "Udostępnij" → "Dodaj do ekranu głównego" — appka powinna sama podpowiedzieć ten krok przy pierwszym wejściu z iPhone'a.
- Limit pamięci offline mniejszy i mniej przewidywalny niż na Androidzie — projektuj offline jako "najczęściej działa", nie "gwarantowane".
- Push notifications na iOS dopiero od 16.4 i tylko dla appek zainstalowanych na ekranie głównym — osobny temat na później.
- Brak Background Sync API — jeśli appka offline zapisze coś lokalnie, synchronizacja "przy najbliższym otwarciu z sieciowym" trzeba zrobić samemu.

Strategia cache (`vite-plugin-pwa`):
- zasoby statyczne appki → `CacheFirst`,
- lista materiałów/podręczników z Firestore → `NetworkFirst` z fallbackiem do cache,
- same pliki (PDF-y, obrazki) z Firebase Storage → cache "on demand" przy otwarciu danego pliku, nie z góry wszystko.

## 9. Koszty (Firebase Blaze)

Blaze = pay-as-you-go, wymaga karty płatniczej na koncie Google Cloud, ale ma darmowe limity odnawiane co miesiąc:

- Cloud Functions: 2 mln wywołań, 400 000 GB-sekund, 200 000 GHz-sekund CPU, **5 GB ruchu wychodzącego** darmo/mies. — ruch Drive API → Cloud Function jest ruchem między usługami Google, więc **nie liczy się do tego limitu egress** (to jest różnica względem integracji z OneDrive/Microsoft Graph, gdzie ruch wychodzący do zewnętrznego API by się liczył).
- Firestore: 50 000 odczytów/dzień, 20 000 zapisów/dzień, 1 GB przechowywania darmo.
- Powyżej limitów: $0,40/mln wywołań, $0,0000025/GB-s, $0,00001/GHz-s, $0,12/GB egress.

Przy synchronizacji raz dziennie i małej grupie użytkowników realny koszt miesięczny: **$0**.

Źródła: [Firebase — plany cenowe](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Cloud Functions — cennik](https://cloud.google.com/functions/pricing-1stgen).

## 10. Struktura repozytorium (propozycja)

```
studia-pwa/
├─ public/
│  ├─ icons/
│  └─ manifest.webmanifest
├─ src/
│  ├─ firebase/           # inicjalizacja Firebase, auth helpers
│  ├─ calendar/           # integracja Google Calendar
│  ├─ features/
│  │  ├─ materials/
│  │  ├─ textbooks/
│  │  └─ exams/
│  ├─ components/
│  └─ App.tsx
├─ functions/              # Cloud Functions (sync z Drive)
│  └─ src/driveSync.ts
├─ .github/workflows/
│  └─ deploy.yml
├─ firestore.rules
└─ vite.config.ts
```

## 11. Proponowana kolejność pracy (etapy)

1. **Szkielet projektu**: Vite + React + Tailwind, repo na GitHubie, pierwszy deploy "Hello World" na GitHub Pages.
2. **Logowanie Google** (Firebase Auth) + pusty layout panelu + domena GitHub Pages w Authorized domains.
2a. **Role i zatwierdzanie kont**: dokument `users` (role/status), ekran "czeka na zatwierdzenie", panel admina "Wnioski o dostęp", reguły z pkt 5 przetestowane w emulatorze, ręczny bootstrap pierwszego admina.
3. **PWA od razu na tym etapie**: manifest, ikony, Service Worker.
4. **Wspólne materiały** — CRUD na `materials`/`subjects`, upload plików do Storage przez użytkowników.
5. **Synchronizacja Drive → Storage/Firestore** — service account, folder na Drive, Cloud Function, plan Blaze.
6. **Integracja z Google Calendar** — osobny scope, przycisk "dodaj kolos do kalendarza".
7. **Dopracowanie offline/iOS** — testy na realnym iPhone, strategia cache per typ danych.

## 12. Otwarte decyzje na później

- Limit wielkości/typu plików kopiowanych z Drive do Storage (żeby nie zapchać darmowego planu Firebase Storage).
- Częstotliwość synchronizacji z Drive (codziennie wystarczy, czy wolisz przycisk "sync now" na żądanie).
- Czy wprowadzić `groupId` (podział per rocznik/kierunek), jeśli "jedna wspólna przestrzeń" zacznie być za szeroka.
- Custom domena dla GitHub Pages (kosmetyczne, niewymagane).

## 13. Checklist przed startem kodowania

- [ ] Projekt w Firebase Console (Auth → provider Google, Firestore, Storage).
- [ ] Plan Blaze włączony w Firebase.
- [ ] Service account utworzony w Google Cloud, Drive API włączone.
- [ ] Folder z podręcznikami/prezentacjami na Twoim Drive udostępniony e-mailowi service account (Przeglądający).
- [ ] Projekt w Google Cloud Console pod Calendar API (gdy robisz integrację kalendarza) + OAuth consent screen.
- [ ] Repozytorium GitHub + włączony GitHub Pages.
- [ ] Domena `*.github.io` dodana do Authorized domains w Firebase Auth.
- [ ] Po pierwszym logowaniu ręcznie ustawione w Firestore `role: "admin"`, `status: "approved"` na własnym koncie.
- [ ] `firestore.rules` wgrane (nie zostawiać reguł domyślnych/testowych na produkcji).
