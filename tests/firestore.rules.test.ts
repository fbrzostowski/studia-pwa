import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'

let env: RulesTestEnvironment

const profile = (role: string, status: string, username?: string) => ({
  ...(username ? { username } : {}),
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
    await setDoc(doc(db, 'users/carol'), profile('user', 'approved', 'carol'))
    await setDoc(doc(db, 'users/pending'), profile('user', 'pending'))
    await setDoc(doc(db, 'users/rejected'), profile('user', 'rejected'))
    await setDoc(doc(db, 'subjects/s1'), { name: 'Analiza', kind: 'WYK', createdBy: 'alice' })
    await setDoc(doc(db, 'usernames/alice'), { uid: 'alice' })
    await setDoc(doc(db, 'materials/m1'), { title: 'Notatki', ownerId: 'alice' })
    await setDoc(doc(db, 'exams/e1'), { title: 'Kolos', createdBy: 'alice' })
    await setDoc(doc(db, 'textbooks/t1'), { title: 'Podręcznik' })
  })
})

const as = (uid: string) => env.authenticatedContext(uid).firestore()
const anon = () => env.unauthenticatedContext().firestore()

// zakłada konto jak aplikacja: rezerwacja nazwy + dokument users w jednej paczce
const signUp = (
  uid: string,
  data: Record<string, unknown>,
  reserve: { name: string; uid: string } | null = { name: String(data.username ?? '').toLowerCase(), uid },
) => {
  const db = as(uid)
  const batch = writeBatch(db)
  if (reserve) batch.set(doc(db, 'usernames', reserve.name), { uid: reserve.uid, createdAt: serverTimestamp() })
  batch.set(doc(db, 'users', uid), { ...data, createdAt: serverTimestamp() })
  return batch.commit()
}

describe('users: tworzenie konta', () => {
  it('nowy użytkownik zakłada konto jako user/pending z nazwą użytkownika', async () => {
    await assertSucceeds(signUp('new', profile('user', 'pending', 'Nowy_01')))
  })
  it('nie może utworzyć się jako approved ani admin', async () => {
    await assertFails(signUp('new', profile('user', 'approved', 'nowy')))
    await assertFails(signUp('new', profile('admin', 'pending', 'nowy')))
  })
  it('nie może utworzyć dokumentu innej osoby', async () => {
    await assertFails(
      setDoc(doc(as('new'), 'users/other'), profile('user', 'pending', 'inny')),
    )
  })
  it('bez nazwy użytkownika konto nie powstaje', async () => {
    await assertFails(signUp('new', profile('user', 'pending'), null))
    await assertFails(setDoc(doc(as('new'), 'users/new'), profile('user', 'pending')))
  })
  it('nazwa niedozwolona (za krótka, za długa, znaki specjalne) jest odrzucana', async () => {
    for (const bad of ['ab', 'a'.repeat(21), 'z spacją', 'zły@znak', 'ęśą']) {
      await assertFails(signUp('new', profile('user', 'pending', bad), { name: bad.toLowerCase(), uid: 'new' }))
    }
  })
  it('zajęta nazwa jest odrzucana, także w innej wielkości liter', async () => {
    await assertFails(signUp('new', profile('user', 'pending', 'alice')))
    await assertFails(signUp('new', profile('user', 'pending', 'ALICE')))
  })
  it('nie zarezerwujesz nazwy na cudze uid ani nie podepniesz cudzej rezerwacji', async () => {
    await assertFails(signUp('new', profile('user', 'pending', 'nowy'), { name: 'nowy', uid: 'ktos' }))
    // rezerwacja nazwy A, a w profilu nazwa B
    await assertFails(signUp('new', profile('user', 'pending', 'nowy'), { name: 'inna', uid: 'new' }))
  })
  it('sama rezerwacja bez profilu nie przechodzi', async () => {
    await assertFails(setDoc(doc(as('new'), 'usernames/nowy'), { uid: 'new', createdAt: serverTimestamp() }))
  })
  it('rezerwacji nie da się nadpisać ani usunąć (poza adminem)', async () => {
    await assertFails(setDoc(doc(as('bob'), 'usernames/alice'), { uid: 'bob', createdAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(as('alice'), 'usernames/alice')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'usernames/alice')))
  })
  it('zalogowany może sprawdzić dostępność nazwy, anonim nie', async () => {
    await assertSucceeds(getDoc(doc(as('new'), 'usernames/alice')))
    await assertFails(getDoc(doc(anon(), 'usernames/alice')))
  })
  it('niezalogowany nie może nic utworzyć ani odczytać', async () => {
    await assertFails(setDoc(doc(anon(), 'users/new'), profile('user', 'pending', 'nowy')))
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
  it('user nie może zmienić sobie nazwy użytkownika', async () => {
    await assertFails(updateDoc(doc(as('alice'), 'users/alice'), { username: 'cudza' }))
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
    const exam = (by: string) => ({ subjectId: 's1', type: 'MID', date: '2026-11-10', createdBy: by })
    await assertSucceeds(setDoc(doc(as('bob'), 'exams/e2'), exam('bob')))
    await assertFails(setDoc(doc(as('bob'), 'exams/e3'), exam('alice')))
    await assertFails(deleteDoc(doc(as('bob'), 'exams/e1')))
    await assertSucceeds(setDoc(doc(as('bob'), 'subjects/s2'), { name: 'N', kind: 'WYK+CW', createdBy: 'bob' }))
    await assertFails(setDoc(doc(as('bob'), 'subjects/s4'), { name: 'N', createdBy: 'bob' }))
    await assertFails(setDoc(doc(as('bob'), 'subjects/s5'), { name: 'N', kind: 'INNE', createdBy: 'bob' }))
    for (const kind of ['WYK', 'LAB', 'KON', 'CW', 'WYK+CW', 'KON+CW']) {
      await assertSucceeds(setDoc(doc(as('bob'), `subjects/k-${kind}`), { name: 'N', kind, createdBy: 'bob' }))
    }
    await assertFails(updateDoc(doc(as('alice'), 'subjects/s1'), { kind: 'XYZ' }))
    await assertSucceeds(updateDoc(doc(as('alice'), 'subjects/s1'), { kind: 'CW' }))
    await assertFails(updateDoc(doc(as('bob'), 'subjects/s1'), { name: 'Hack', kind: 'WYK' }))
  })
})

describe('subjects: emotka przedmiotu', () => {
  it('każdy zatwierdzony ustawia i usuwa emotkę cudzego przedmiotu, ale nic poza nią', async () => {
    const ref = (who: string) => doc(as(who), 'subjects/s1') // s1 założyła alice
    await assertSucceeds(updateDoc(ref('bob'), { emoji: '📚' }))
    await assertSucceeds(updateDoc(ref('bob'), { emoji: '🇪🇸' }))
    await assertSucceeds(updateDoc(ref('bob'), { emoji: deleteField() }))
    await assertFails(updateDoc(ref('bob'), { emoji: '📚', name: 'Hack' }))
    await assertFails(updateDoc(ref('bob'), { emoji: '📚', kind: 'CW' }))
    await assertFails(updateDoc(ref('bob'), { emoji: '📚', createdBy: 'bob' }))
  })
  it('emotka musi być krótkim, niepustym tekstem', async () => {
    const ref = doc(as('bob'), 'subjects/s1')
    await assertFails(updateDoc(ref, { emoji: '' }))
    await assertFails(updateDoc(ref, { emoji: 5 }))
    await assertFails(updateDoc(ref, { emoji: 'x'.repeat(40) }))
    await assertFails(setDoc(doc(as('bob'), 'subjects/s9'), { name: 'N', kind: 'WYK', createdBy: 'bob', emoji: '' }))
    await assertSucceeds(setDoc(doc(as('bob'), 'subjects/s9'), { name: 'N', kind: 'WYK', createdBy: 'bob', emoji: '🧮' }))
  })
  it('oczekujący, odrzucony i niezalogowany nie ustawiają emotki', async () => {
    await assertFails(updateDoc(doc(as('pending'), 'subjects/s1'), { emoji: '📚' }))
    await assertFails(updateDoc(doc(as('rejected'), 'subjects/s1'), { emoji: '📚' }))
    await assertFails(updateDoc(doc(anon(), 'subjects/s1'), { emoji: '📚' }))
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

describe('plans: udostępnianie planu innym', () => {
  const plan = (shared?: unknown) => ({ events: [{ name: 'A' }], ...(shared === undefined ? {} : { shared }) })

  it('plan jest prywatny, dopóki właściciel go nie udostępni', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan()))
    await assertFails(getDoc(doc(as('bob'), 'plans/alice')))
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan(false)))
    await assertFails(getDoc(doc(as('bob'), 'plans/alice')))
  })
  it('udostępniony plan czytają zatwierdzeni, ale nikt poza właścicielem go nie zmienia', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan(true)))
    await assertSucceeds(getDoc(doc(as('bob'), 'plans/alice')))
    await assertSucceeds(getDoc(doc(as('admin'), 'plans/alice')))
    await assertFails(getDoc(doc(as('pending'), 'plans/alice')))
    await assertFails(getDoc(doc(as('rejected'), 'plans/alice')))
    await assertFails(getDoc(doc(anon(), 'plans/alice')))
    await assertFails(setDoc(doc(as('bob'), 'plans/alice'), plan(true)))
    await assertFails(updateDoc(doc(as('bob'), 'plans/alice'), { shared: false }))
    await assertFails(deleteDoc(doc(as('bob'), 'plans/alice')))
    await assertFails(deleteDoc(doc(as('admin'), 'plans/alice')))
  })
  it('wycofanie zgody od razu zamyka dostęp, a scalanie nie gubi flagi', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan(true)))
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), { events: [] }, { merge: true })) // ponowny import
    await assertSucceeds(getDoc(doc(as('bob'), 'plans/alice')))
    await assertSucceeds(updateDoc(doc(as('alice'), 'plans/alice'), { shared: false }))
    await assertFails(getDoc(doc(as('bob'), 'plans/alice')))
  })
  it('flaga shared musi być wartością logiczną; cudzy brak planu to odmowa', async () => {
    await assertFails(setDoc(doc(as('alice'), 'plans/alice'), plan('tak')))
    await assertFails(setDoc(doc(as('alice'), 'plans/alice'), { shared: true })) // bez events
    await assertFails(getDoc(doc(as('bob'), 'plans/alice'))) // nie istnieje
  })
})

describe('plans: osobisty plan zajęć', () => {
  const plan = (n = 3) => ({ events: Array.from({ length: n }, (_, i) => ({ name: `E${i}`, start: '2026-10-01T08:00' })) })

  it('approved zapisuje, czyta, podmienia i usuwa własny plan', async () => {
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan()))
    await assertSucceeds(getDoc(doc(as('alice'), 'plans/alice')))
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan(5)))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'plans/alice')))
  })
  it('cudzego planu nie czyta ani nie zapisuje nikt, nawet admin', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'plans/alice'), plan())
    })
    await assertFails(getDoc(doc(as('bob'), 'plans/alice')))
    await assertFails(getDoc(doc(as('admin'), 'plans/alice')))
    await assertFails(setDoc(doc(as('bob'), 'plans/alice'), plan()))
    await assertFails(deleteDoc(doc(as('admin'), 'plans/alice')))
  })
  it('pending, rejected i anonim nie mają planu', async () => {
    await assertFails(setDoc(doc(as('pending'), 'plans/pending'), plan()))
    await assertFails(setDoc(doc(as('rejected'), 'plans/rejected'), plan()))
    await assertFails(getDoc(doc(anon(), 'plans/alice')))
  })
  it('events musi być listą do 1000 pozycji', async () => {
    await assertFails(setDoc(doc(as('alice'), 'plans/alice'), { events: 'x' }))
    await assertFails(setDoc(doc(as('alice'), 'plans/alice'), { foo: 1 }))
    await assertSucceeds(setDoc(doc(as('alice'), 'plans/alice'), plan(1000)))
    await assertFails(setDoc(doc(as('alice'), 'plans/alice'), plan(1001)))
  })
})

describe('memberships: kto należy do przedmiotu', () => {
  const m = (uid: string, over: Record<string, unknown> = {}) => ({
    uid,
    subjectId: 's1',
    username: 'X', // seedowi użytkownicy bez username mają displayName „X”
    classes: [{ form: 'CW', group: '15', when: ['pt 11:40–13:15'], rooms: ['B-2'] }],
    updatedAt: serverTimestamp(),
    ...over,
  })

  it('approved dołącza do istniejącego przedmiotu, aktualizuje i opuszcza go', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob')))
    await assertSucceeds(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob', { classes: [] })))
    await assertSucceeds(deleteDoc(doc(as('bob'), 'memberships/s1_bob')))
  })
  it('zdjęcie w członkostwie: tylko własne zdjęcie z profilu (inni nie widzą users)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/bob'), { ...profile('user', 'approved'), photoURL: 'https://img.example/bob.jpg' })
    })
    await assertSucceeds(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob')))
    await assertSucceeds(updateDoc(doc(as('bob'), 'memberships/s1_bob'), { photoURL: 'https://img.example/bob.jpg' }))
    await assertFails(updateDoc(doc(as('bob'), 'memberships/s1_bob'), { photoURL: 'https://img.example/ktos-inny.jpg' }))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob', { photoURL: 'https://evil.example/x.jpg' })))
  })
  it('twórca przedmiotu zapisuje przedmiot i członkostwo w jednej paczce (existsAfter)', async () => {
    const db = as('bob')
    const batch = writeBatch(db)
    batch.set(doc(db, 'subjects/nowy'), { name: 'N', kind: 'WYK', createdBy: 'bob' })
    batch.set(doc(db, 'memberships/nowy_bob'), m('bob', { subjectId: 'nowy' }))
    await assertSucceeds(batch.commit())
  })
  it('nie da się dołączyć do nieistniejącego przedmiotu', async () => {
    await assertFails(setDoc(doc(as('bob'), 'memberships/brak_bob'), m('bob', { subjectId: 'brak' })))
  })
  it('nie podszyjesz się pod kogoś: cudze uid, zła nazwa, zły id dokumentu', async () => {
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_alice'), m('alice')))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob', { username: 'alice' })))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_inny'), m('bob')))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('alice')))
  })
  it('nazwa w członkostwie musi być nazwą użytkownika z profilu', async () => {
    await assertSucceeds(setDoc(doc(as('carol'), 'memberships/s1_carol'), m('carol', { username: 'carol' })))
    await assertFails(setDoc(doc(as('carol'), 'memberships/s1_carol'), m('carol', { username: 'X' })))
  })
  it('niedozwolone pola i zły typ classes są odrzucane', async () => {
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob', { role: 'admin' })))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_bob'), m('bob', { classes: 'x' })))
  })
  it('czytają zatwierdzeni; pending i anonim nie', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'memberships/s1_alice'), { uid: 'alice', subjectId: 's1', username: 'X', classes: [] })
    })
    await assertSucceeds(getDoc(doc(as('bob'), 'memberships/s1_alice')))
    await assertFails(getDoc(doc(as('pending'), 'memberships/s1_alice')))
    await assertFails(getDoc(doc(anon(), 'memberships/s1_alice')))
  })
  it('cudzego członkostwa nie usuniesz ani nie zmienisz, admin usuwa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'memberships/s1_alice'), { uid: 'alice', subjectId: 's1', username: 'X', classes: [] })
    })
    await assertFails(deleteDoc(doc(as('bob'), 'memberships/s1_alice')))
    await assertFails(setDoc(doc(as('bob'), 'memberships/s1_alice'), m('bob')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'memberships/s1_alice')))
  })
  it('pending nie dołącza', async () => {
    await assertFails(setDoc(doc(as('pending'), 'memberships/s1_pending'), m('pending')))
  })
})

describe('classes: prowadzący grupy zajęciowej', () => {
  const c = (uid: string, over: Record<string, unknown> = {}) => ({
    subjectId: 's1',
    form: 'CW',
    group: '15',
    lecturer: 'dr Jan Kowalski',
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    ...over,
  })

  it('zatwierdzony ustawia i poprawia prowadzącego grupy (także cudzej)', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'classes/s1_CW_15'), c('bob')))
    await assertSucceeds(setDoc(doc(as('alice'), 'classes/s1_CW_15'), c('alice', { lecturer: 'prof. Nowak' })))
  })
  it('id dokumentu musi pasować do przedmiotu, formy i grupy', async () => {
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_CW_16'), c('bob')))
    await assertFails(setDoc(doc(as('bob'), 'classes/cokolwiek'), c('bob')))
  })
  it('odrzuca za długą nazwę, zły typ, nieznaną formę i nieistniejący przedmiot', async () => {
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_CW_15'), c('bob', { lecturer: 'x'.repeat(81) })))
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_CW_15'), c('bob', { lecturer: 5 })))
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_XXX_15'), c('bob', { form: 'XXX' })))
    await assertFails(setDoc(doc(as('bob'), 'classes/brak_CW_15'), c('bob', { subjectId: 'brak' })))
  })
  it('podpisuje się własne uid i nie przyjmuje obcych pól', async () => {
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_CW_15'), c('alice')))
    await assertFails(setDoc(doc(as('bob'), 'classes/s1_CW_15'), c('bob', { extra: 1 })))
  })
  it('pending nie zapisuje i nie czyta; admin usuwa, user nie', async () => {
    await assertFails(setDoc(doc(as('pending'), 'classes/s1_CW_15'), c('pending')))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'classes/s1_CW_15'), c('alice'))
    })
    await assertFails(getDoc(doc(as('pending'), 'classes/s1_CW_15')))
    await assertSucceeds(getDoc(doc(as('bob'), 'classes/s1_CW_15')))
    await assertFails(deleteDoc(doc(as('bob'), 'classes/s1_CW_15')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'classes/s1_CW_15')))
  })
})

describe('textbookFolders: rejestr folderów przedmiotów', () => {
  it('czytają zatwierdzeni, nikt nie zapisuje z klienta', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'textbookFolders/f1'), { name: 'Mathematics' })
    })
    await assertSucceeds(getDoc(doc(as('alice'), 'textbookFolders/f1')))
    await assertFails(getDoc(doc(as('pending'), 'textbookFolders/f1')))
    await assertFails(getDoc(doc(anon(), 'textbookFolders/f1')))
    await assertFails(setDoc(doc(as('admin'), 'textbookFolders/f2'), { name: 'X' }))
    await assertFails(deleteDoc(doc(as('admin'), 'textbookFolders/f1')))
  })
})

describe('materials: podpięcie do lekcji', () => {
  const base = { title: 'Notatka', subjectId: 's1', type: 'note', ownerId: 'bob' }
  const lesson = { lessonDate: '2026-10-22', lessonForm: 'WYK', lessonGroup: '1' }

  it('materiał z poprawnymi danymi lekcji da się dodać', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'materials/l1'), { ...base, ...lesson }))
  })
  it('zła data, nieznana forma, brak formy lub grupy albo za długa grupa są odrzucane', async () => {
    await assertFails(setDoc(doc(as('bob'), 'materials/l2'), { ...base, ...lesson, lessonDate: '22.10.2026' }))
    await assertFails(setDoc(doc(as('bob'), 'materials/l3'), { ...base, ...lesson, lessonForm: 'XXX' }))
    await assertFails(setDoc(doc(as('bob'), 'materials/l4'), { ...base, lessonDate: '2026-10-22' }))
    await assertFails(setDoc(doc(as('bob'), 'materials/l5'), { ...base, ...lesson, lessonGroup: 'x'.repeat(21) }))
  })
  it('właściciel podpina istniejący materiał do lekcji i odpina go, obcy nie może', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'materials/m9'), { ...base })
    })
    await assertSucceeds(updateDoc(doc(as('bob'), 'materials/m9'), lesson))
    await assertFails(updateDoc(doc(as('alice'), 'materials/m9'), { lessonDate: '2026-10-23' }))
    await assertFails(updateDoc(doc(as('bob'), 'materials/m9'), { lessonDate: 'jutro' }))
    await assertSucceeds(updateDoc(doc(as('bob'), 'materials/m9'), { lessonDate: deleteField(), lessonForm: deleteField(), lessonGroup: deleteField() }))
  })
})

describe('exams: terminy mid-term i final exam', () => {
  const exam = (over: Record<string, unknown> = {}) => ({
    subjectId: 's1',
    type: 'MID',
    date: '2026-11-10',
    time: '09:30',
    room: 'G-205',
    note: 'Rozdziały 1–5',
    createdBy: 'bob',
    createdByName: 'X',
    createdAt: serverTimestamp(),
    ...over,
  })

  it('zatwierdzony dodaje mid-term i final exam do istniejącego przedmiotu', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'exams/a'), exam()))
    // tylko pola obowiązkowe: godzina, sala i uwagi są opcjonalne
    await assertSucceeds(
      setDoc(doc(as('bob'), 'exams/b'), { subjectId: 's1', type: 'FIN', date: '2026-12-15', createdBy: 'bob' }),
    )
  })
  it('odrzuca zły typ, datę, godzinę, za długie pola i obce pola', async () => {
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ type: 'QUIZ' })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ date: '10.11.2026' })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ date: 20261110 })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ time: '25:00' })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ time: '9:30' })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ room: 'x'.repeat(101) })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ note: 'x'.repeat(301) })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ extra: 1 })))
  })
  it('wymaga istniejącego przedmiotu i podpisu własnym uid', async () => {
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ subjectId: 'brak' })))
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), exam({ createdBy: 'alice' })))
    const { type: _t, ...bezTypu } = exam()
    await assertFails(setDoc(doc(as('bob'), 'exams/x'), bezTypu))
  })
  it('pending i anonim nie dodają terminów', async () => {
    await assertFails(setDoc(doc(as('pending'), 'exams/x'), exam({ createdBy: 'pending' })))
    await assertFails(setDoc(doc(anon(), 'exams/x'), exam()))
  })
  it('autor zmienia swój termin, ale nie autora; obcy nie zmienia; admin usuwa', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'exams/own'), { subjectId: 's1', type: 'MID', date: '2026-11-10', createdBy: 'bob' })
    })
    const edited = { subjectId: 's1', type: 'FIN', date: '2026-12-01', createdBy: 'bob' }
    await assertSucceeds(setDoc(doc(as('bob'), 'exams/own'), edited))
    await assertFails(setDoc(doc(as('bob'), 'exams/own'), { ...edited, createdBy: 'alice' }))
    await assertFails(setDoc(doc(as('alice'), 'exams/own'), { ...edited, createdBy: 'alice' }))
    await assertFails(deleteDoc(doc(as('alice'), 'exams/own')))
    await assertSucceeds(deleteDoc(doc(as('admin'), 'exams/own')))
  })
})

describe('todoLists: prywatne listy do nauki', () => {
  const list = (over: Record<string, unknown> = {}) => ({
    ownerId: 'bob',
    name: 'Nauka: Mathematics — Mid-term',
    subjectId: 's1',
    items: [{ id: 'a', title: 'Granice ciągów', done: false, materialId: 'm1' }],
    createdAt: serverTimestamp(),
    ...over,
  })

  it('właściciel tworzy, czyta, zmienia (odznacza punkty) i usuwa własną listę', async () => {
    await assertSucceeds(setDoc(doc(as('bob'), 'todoLists/t1'), list()))
    await assertSucceeds(getDoc(doc(as('bob'), 'todoLists/t1')))
    await assertSucceeds(
      updateDoc(doc(as('bob'), 'todoLists/t1'), { items: [{ id: 'a', title: 'Granice ciągów', done: true }], updatedAt: serverTimestamp() }),
    )
    await assertSucceeds(deleteDoc(doc(as('bob'), 'todoLists/t1')))
  })
  it('cudzej listy nie czyta, nie zmienia i nie usuwa nikt, także admin', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'todoLists/t2'), { ownerId: 'alice', name: 'Moja', items: [] })
    })
    await assertFails(getDoc(doc(as('bob'), 'todoLists/t2')))
    await assertFails(getDoc(doc(as('admin'), 'todoLists/t2')))
    await assertFails(updateDoc(doc(as('bob'), 'todoLists/t2'), { name: 'Hack' }))
    await assertFails(deleteDoc(doc(as('admin'), 'todoLists/t2')))
  })
  it('zapytanie po własnym ownerId działa, bez filtra jest odrzucone', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'todoLists/b1'), { ownerId: 'bob', name: 'B', items: [] })
      await setDoc(doc(ctx.firestore(), 'todoLists/a1'), { ownerId: 'alice', name: 'A', items: [] })
    })
    await assertSucceeds(getDocs(query(collection(as('bob'), 'todoLists'), where('ownerId', '==', 'bob'))))
    await assertFails(getDocs(collection(as('bob'), 'todoLists')))
    await assertFails(getDocs(query(collection(as('bob'), 'todoLists'), where('ownerId', '==', 'alice'))))
  })
  it('odrzuca zły kształt: puste lub za długie imię, items nie-lista, za dużo punktów, obce pole', async () => {
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ name: '' })))
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ name: 'x'.repeat(101) })))
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ items: 'x' })))
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ items: Array.from({ length: 301 }, (_, i) => ({ id: String(i), title: 't', done: false })) })))
    await assertSucceeds(setDoc(doc(as('bob'), 'todoLists/ok300'), list({ items: Array.from({ length: 300 }, (_, i) => ({ id: String(i), title: 't', done: false })) })))
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ extra: 1 })))
  })
  it('nie utworzysz listy na cudze ownerId ani nie przepiszesz właściciela; pending i anonim nie mają list', async () => {
    await assertFails(setDoc(doc(as('bob'), 'todoLists/x'), list({ ownerId: 'alice' })))
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'todoLists/own'), { ownerId: 'bob', name: 'B', items: [] })
    })
    await assertFails(updateDoc(doc(as('bob'), 'todoLists/own'), { ownerId: 'alice' }))
    await assertFails(setDoc(doc(as('pending'), 'todoLists/x'), list({ ownerId: 'pending' })))
    await assertFails(setDoc(doc(anon(), 'todoLists/x'), list()))
  })
})

describe('własność wpisów: zmieniać i usuwać może tylko autor albo admin', () => {
  // [kolekcja, pole autora, dokument początkowy]
  const cases: [string, string, Record<string, unknown>][] = [
    ['subjects', 'createdBy', { name: 'Własny', kind: 'WYK', createdBy: 'alice' }],
    ['materials', 'ownerId', { title: 'Własny', subjectId: 's1', type: 'note', ownerId: 'alice' }],
    ['exams', 'createdBy', { subjectId: 's1', type: 'MID', date: '2026-11-10', createdBy: 'alice' }],
  ]

  for (const [col, field, seed] of cases) {
    describe(col, () => {
      const path = `${col}/wlasny`
      const seedDoc = () =>
        env.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), path), seed)
        })

      it('autor usuwa swój wpis', async () => {
        await seedDoc()
        await assertSucceeds(deleteDoc(doc(as('alice'), path)))
      })
      it('admin usuwa cudzy wpis', async () => {
        await seedDoc()
        await assertSucceeds(deleteDoc(doc(as('admin'), path)))
      })
      it('inny zatwierdzony użytkownik nie usuwa i nie zmienia cudzego wpisu', async () => {
        await seedDoc()
        await assertFails(deleteDoc(doc(as('bob'), path)))
        await assertFails(updateDoc(doc(as('bob'), path), { [field]: 'bob' }))
        await assertFails(setDoc(doc(as('bob'), path), { ...seed, [field]: 'bob' }))
      })
      it('pending, rejected i anonim nie usuwają', async () => {
        await seedDoc()
        for (const who of [as('pending'), as('rejected'), anon()]) await assertFails(deleteDoc(doc(who, path)))
      })
      it('autor nie może przepisać autorstwa na kogoś innego (ani admin)', async () => {
        await seedDoc()
        await assertFails(updateDoc(doc(as('alice'), path), { [field]: 'bob' }))
        await assertFails(updateDoc(doc(as('admin'), path), { [field]: 'bob' }))
      })
      it('autor nadal może normalnie zmienić własny wpis', async () => {
        await seedDoc()
        const change = col === 'subjects' ? { name: 'Nowa nazwa' } : col === 'materials' ? { title: 'Nowy tytuł' } : { time: '10:00' }
        await assertSucceeds(updateDoc(doc(as('alice'), path), change))
      })
    })
  }

  it('członkostwo usuwa tylko jego właściciel albo admin', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'memberships/s1_alice'), { uid: 'alice', subjectId: 's1', username: 'X', classes: [] })
    })
    await assertFails(deleteDoc(doc(as('bob'), 'memberships/s1_alice')))
    await assertSucceeds(deleteDoc(doc(as('alice'), 'memberships/s1_alice')))
  })

  it('podręczniki i foldery podręczników nie są usuwalne z klienta (tylko przez funkcję z kontrolą autora)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'textbooks/t9'), { title: 'T', uploadedBy: 'alice' })
      await setDoc(doc(ctx.firestore(), 'textbookFolders/f9'), { name: 'F', createdBy: 'alice' })
    })
    for (const path of ['textbooks/t9', 'textbookFolders/f9']) {
      await assertFails(deleteDoc(doc(as('alice'), path)))
      await assertFails(deleteDoc(doc(as('admin'), path)))
    }
  })
})
