import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFunctions } from 'firebase/functions'
import { getStorage } from 'firebase/storage'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

// Klucze webowe Firebase są publiczne z założenia — dostęp chronią Security Rules.
const firebaseConfig = {
  apiKey: 'AIzaSyDSV-YNoRBiB79hTv_0bJ4SlOY-9ZbbSNQ',
  authDomain: 'studia-pwa.firebaseapp.com',
  projectId: 'studia-pwa',
  storageBucket: 'studia-pwa.firebasestorage.app',
  messagingSenderId: '101028346633',
  appId: '1:101028346633:web:3ddb140a3c642aa35e71d8',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
// Trwały cache w IndexedDB: odczytane dokumenty są dostępne offline, zapisy czekają na sieć.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
export const storage = getStorage(app)
// ten sam region co w functions/src/index.ts
export const functions = getFunctions(app, 'europe-central2')
export const googleProvider = new GoogleAuthProvider()
