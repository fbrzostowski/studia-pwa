import { setGlobalOptions } from 'firebase-functions/v2'

// Osobny moduł importowany jako pierwszy przez każdy plik z funkcjami: importy ESM wykonują się przed kodem
// index.ts, więc ustawienie tam dochodziło za późno (mcp trafiło do us-central1 i na domyślne konto).
// Funkcje działają jako konto techniczne (role: Firestore i Storage w tym projekcie), bez pliku z kluczem.
setGlobalOptions({
  region: 'europe-west1',
  serviceAccount: 'drive-sync@studia-pwa.iam.gserviceaccount.com',
  memory: '512MiB',
  timeoutSeconds: 120,
  maxInstances: 3,
})

