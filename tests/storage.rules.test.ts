import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { doc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

const profile = (role: string, status: string) => ({
  displayName: 'X',
  email: 'x@example.com',
  photoURL: '',
  role,
  status,
})
const bytes = (n: number) => new Uint8Array(n)

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'studia-pwa-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})
afterAll(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin'), profile('admin', 'approved'))
    await setDoc(doc(db, 'users/alice'), profile('user', 'approved'))
    await setDoc(doc(db, 'users/bob'), profile('user', 'approved'))
    await setDoc(doc(db, 'users/pending'), profile('user', 'pending'))
    await uploadBytes(ref(ctx.storage(), 'materials/alice/a.pdf'), bytes(10))
    await uploadBytes(ref(ctx.storage(), 'textbooks/book.pdf'), bytes(10))
  })
})

const st = (uid: string) => env.authenticatedContext(uid).storage()

describe('storage: materials/{uid}/', () => {
  it('approved czyta cudzy plik', async () => {
    await assertSucceeds(getBytes(ref(st('bob'), 'materials/alice/a.pdf')))
  })
  it('pending i anonim nie czytają', async () => {
    await assertFails(getBytes(ref(st('pending'), 'materials/alice/a.pdf')))
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'materials/alice/a.pdf')))
  })
  it('właściciel wgrywa do własnego katalogu', async () => {
    await assertSucceeds(uploadBytes(ref(st('bob'), 'materials/bob/b.pdf'), bytes(100)))
  })
  it('nie wgrasz do katalogu innej osoby', async () => {
    await assertFails(uploadBytes(ref(st('bob'), 'materials/alice/x.pdf'), bytes(100)))
  })
  it('pending nie wgrywa nawet do własnego katalogu', async () => {
    await assertFails(uploadBytes(ref(st('pending'), 'materials/pending/p.pdf'), bytes(100)))
  })
  it('plik od 25 MB jest odrzucany', async () => {
    await assertFails(uploadBytes(ref(st('bob'), 'materials/bob/big.bin'), bytes(25 * 1024 * 1024)))
  })
  it('nie nadpiszesz istniejącego pliku', async () => {
    await assertFails(uploadBytes(ref(st('alice'), 'materials/alice/a.pdf'), bytes(20)))
  })
  it('usuwa właściciel i admin, ale nie inny użytkownik', async () => {
    await assertFails(deleteObject(ref(st('bob'), 'materials/alice/a.pdf')))
    await assertSucceeds(deleteObject(ref(st('alice'), 'materials/alice/a.pdf')))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'materials/alice/a.pdf'), bytes(10))
    })
    await assertSucceeds(deleteObject(ref(st('admin'), 'materials/alice/a.pdf')))
  })
})

describe('storage: textbooks/', () => {
  it('approved czyta, nikt nie zapisuje', async () => {
    await assertSucceeds(getBytes(ref(st('alice'), 'textbooks/book.pdf')))
    await assertFails(getBytes(ref(st('pending'), 'textbooks/book.pdf')))
    await assertFails(uploadBytes(ref(st('admin'), 'textbooks/new.pdf'), bytes(10)))
    await assertFails(deleteObject(ref(st('admin'), 'textbooks/book.pdf')))
  })
})
