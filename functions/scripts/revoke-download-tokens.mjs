// Jednorazowo: usuwa z plików w buckecie tokeny pobierania (firebaseStorageDownloadTokens), przez co wszystkie
// dotychczasowe adresy z getDownloadURL przestają działać. Aplikacja używa teraz podpisanych, krótkich linków (fileLink).
//
//   node functions/scripts/revoke-download-tokens.mjs          # tylko pokazuje, co by zrobił
//   node functions/scripts/revoke-download-tokens.mjs --apply  # usuwa tokeny
//
// Wymaga zalogowania: `gcloud auth application-default login` (konto z rolą Storage Object Admin).
import { initializeApp } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

const apply = process.argv.includes('--apply')
initializeApp({ projectId: 'studia-pwa' })
const [files] = await getStorage().bucket('studia-pwa-podreczniki').getFiles()
let n = 0
for (const f of files) {
  const [meta] = await f.getMetadata()
  if (!meta.metadata?.firebaseStorageDownloadTokens) continue
  n++
  console.log(`${apply ? 'usuwam' : 'znaleziono'}: ${f.name}`)
  if (apply) await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } })
}
console.log(`${n} plików z tokenem${apply ? ' — tokeny usunięte.' : '. Uruchom z --apply, aby je usunąć.'}`)
