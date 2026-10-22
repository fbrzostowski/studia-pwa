import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const profile = (role: string, status: string) => ({
  displayName: 'X',
  email: 'x@example.com',
  photoURL: '',
  role,
  status,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'studia-pwa-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin'), profile('admin', 'approved'))
    await setDoc(doc(db, 'users/alice'), profile('user', 'approved'))
    await setDoc(doc(db, 'users/bob'), profile('user', 'approved'))
    await setDoc(doc(db, 'users/pending'), profile('user', 'pending'))
    await setDoc(doc(db, 'users/rejected'), profile('user', 'rejected'))
    await setDoc(doc(db, 'subjects/s1'), { name: 'Analiza', createdBy: 'alice' })
    await setDoc(doc(db, 'materials/m1'), { title: 'Notatki', ownerId: 'alice' })
    await setDoc(doc(db, 'exams/e1'), { title: 'Kolos', createdBy: 'alice' })
    await setDoc(doc(db, 'textbooks/t1'), { title: 'Podręcznik' })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

describe('users: tworzenie konta', () => {
  it('nowy użytkownik może utworzyć własny dokument jako user/pending', async () => {
    await assertSucceeds(
      setDoc(doc(as('new'), 'users/new'), { ...profile('user', 'pending'), createdAt: serverTimestamp() }),
    )
  })
  it('nie może utworzyć się jako approved', async () => {
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('user', 'approved')))
  })
  it('nie może utworzyć się jako admin', async () => {
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('admin', 'pending')))
  })
  it('nie może utworzyć dokumentu innej osoby', async () => {
    await assertFails(setDoc(doc(as('new'), 'users/other'), profile('user', 'pending')))
  })
  it('niezalogowany nie może nic utworzyć ani odczytać', async () => {
    await assertFails(setDoc(doc(anon(), 'users/new'), profile('user', 'pending')))
    await assertFails(getDoc(doc(anon(), 'users/alice')))
  })
})

describe('users: odczyt', () => {
  it('użytkownik czyta własny dokument, także jako pending', async () => {
    await assertSucceeds(getDoc(doc(as('pending'), 'users/pending')))
  })
  it('zwykły użytkownik nie czyta cudzego dokumentu', async () => {
    await assertFails(getDoc(doc(as('alice'), 'users/bob')))
  })
  it('admin czyta dowolny dokument', async () => {
    await assertSucceeds(getDoc(doc(as('admin'), 'users/pending')))
  })
})

describe('users: eskalacja uprawnień', () => {
  it('user nie może zmienić własnej roli', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { role: 'admin' }))
  })
  it('pending nie może zatwierdzić sam siebie', async () => {
    await assertFails(updateDoc(doc(as('pending'), 'users/pending'), { status: 'approved' }))
  })
  it('rejected nie może wrócić do pending ani approved', async () => {
    await assertFails(updateDoc(doc(as('rejected'), 'users/rejected'), { status: 'approved' }))
    await assertFails(updateDoc(doc(as('rejected'), 'users/rejected'), { status: 'pending' }))
  })
  it('user nie może wpisać sobie reviewedBy', async () => {
    await assertFails(updateDoc(doc(as('pending'), 'users/pending'), { reviewedBy: 'admin' }))
  })
  it('user może zmienić własne pola profilu', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'users/alice'), { displayName: 'Nowa' }))
  })
  it('user nie może zmienić cudzego profilu', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/bob'), { displayName: 'Hack' }))
  })
  it('admin zatwierdza wniosek i nadaje rolę', async () => {
    await assertSucceeds(
      updateDoc(doc(as('admin'), 'users/pending'), {
        status: 'approved',
        reviewedBy: 'admin',
        reviewedAt: serverTimestamp(),
      }),
    )
    await assertSucceeds(updateDoc(doc(as('admin'), 'users/bob'), { role: 'admin' }))
  })
  it('zatwierdzony nie-admin nie zatwierdza cudzych kont', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/pending'), { status: 'approved' }))
  })
})

describe('dane wspólne: dostęp tylko dla approved', () => {
  for (const path of ['subjects/s1', 'materials/m1', 'exams/e1', 'textbooks/t1']) {
    it(`approved czyta ${path}`, async () => {
      await assertSucceeds(getDoc(doc(as('alice'), path)))
    })
    it(`pending, rejected i anonim nie czytają ${path}`, async () => {
      await assertFails(getDoc(doc(as('pending'), path)))
      await assertFails(getDoc(doc(as('rejected'), path)))
      await assertFails(getDoc(doc(anon(), path)))
    })
  }
  it('użytkownik bez dokumentu users nie czyta nic', async () => {
    await assertFails(getDoc(doc(as('ghost'), 'subjects/s1')))
  })
})

describe('własność treści', () => {
  it('approved tworzy materiał jako właściciel, ale nie jako ktoś inny', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'materials/m2'), { title: 'A', ownerId: 'bob' }))
    await assertFails(setDoc(doc(as('bob'), 'materials/m3'), { title: 'A', ownerId: 'alice' }))
  })
  it('pending nie tworzy treści', async () => {
    await assertFails(setDoc(doc(as('pending'), 'materials/m2'), { title: 'A', ownerId: 'pending' }))
  })
  it('właściciel edytuje i usuwa swoje, cudzych nie', async () => {
    await assertSucceeds(updateDoc(doc(as('alice'), 'materials/m1'), { title: 'Zmiana' }))
    await assertFails(updateDoc(doc(as('bob'), 'materials/m1'), { title: 'Hack' }))
    await assertFails(deleteDoc(doc(as('bob'), 'materials/m1')))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'materials/m1')))
  })
  it('admin usuwa cudze treści', async () => {
    await assertSucceeds(deleteDoc(doc(as('admin'), 'materials/m1')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'subjects/s1')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'exams/e1')))
  })
  it('exams i subjects: te same zasady własności', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'exams/e2'), { title: 'K', createdBy: 'bob' }))
    await assertFails(setDoc(doc(as('bob'), 'exams/e3'), { title: 'K', createdBy: 'alice' }))
    await assertFails(deleteDoc(doc(as('bob'), 'exams/e1')))
    await assertSucceeds(setDoc(doc(as('bob'), 'subjects/s2'), { name: 'N', createdBy: 'bob' }))
    await assertFails(updateDoc(doc(as('bob'), 'subjects/s1'), { name: 'Hack' }))
  })
})

describe('textbooks: zapis tylko przez Admin SDK', () => {
  it('nikt, nawet admin, nie zapisuje z klienta', async () => {
    await assertFails(setDoc(doc(as('admin'), 'textbooks/t2'), { title: 'X' }))
    await assertFails(updateDoc(doc(as('admin'), 'textbooks/t1'), { title: 'X' }))
    await assertFails(deleteDoc(doc(as('admin'), 'textbooks/t1')))
    await assertFails(setDoc(doc(as('alice'), 'textbooks/t2'), { title: 'X' }))
  })
})
