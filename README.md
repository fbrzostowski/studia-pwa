# Łomiankowe SGH (LOM.SGH)

Aplikacja do organizacji zajęć na studiach: plan z USOS, wspólne materiały, podręczniki, zaliczenia i listy do nauki.
Działa jako zwykła strona na komputerze i jako PWA (dodana do ekranu głównego) na telefonie.

**Strona:** https://fbrzostowski.github.io/studia-pwa/

## Co potrafi

- **Plan** — import pliku `.ics` z USOS, widok „dziś i dalej”, grupy zajęciowe i informacja, kto z nas ma razem zajęcia.
- **Materiały** — kalendarz miesiąca z notatkami podpiętymi do lekcji oraz materiały per przedmiot (notatki, pliki, linki).
- **Podręczniki** — pliki wgrywane przez aplikację, podział na przedmioty i podfoldery.
- **Zaliczenia** — terminy mid-term i final exam (kalendarz, lista) oraz prywatne listy do nauki.
- Konta przez Google; nowe konto czeka na zatwierdzenie przez administratora.

## Stos

React + Vite + TypeScript, Tailwind CSS, `vite-plugin-pwa`; backend Firebase (Auth, Firestore, Storage, Cloud Functions);
hosting GitHub Pages.

## Praca lokalna

```sh
npm install --legacy-peer-deps
npm run dev            # serwer deweloperski
npm run build          # build produkcyjny
npm run test:rules     # testy reguł Firestore/Storage i logiki (emulator Firebase, wymaga Javy)
npm run test:unit      # tylko testy logiki, bez emulatora
```

## Wdrażanie

- **Strona** wdraża się sama po pushu na `main` (GitHub Actions, `.github/workflows/deploy.yml`).
- **Funkcje i reguły** wdrażaj z flagą `--interactive` (inaczej krok z rolą IAM dla Storage jest pomijany):

  ```sh
  npx firebase-tools deploy --only functions,firestore:rules,storage --project studia-pwa --interactive --force
  ```

Szczegóły: [`PLAN.md`](PLAN.md) (założenia), [`docs/podreczniki.md`](docs/podreczniki.md) (podręczniki),
[`docs/storage-bucket.md`](docs/storage-bucket.md) (bucket w us-central1 i koszty).
