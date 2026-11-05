import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addDaysKey, addTodoItems, bearerFrom, dateRange, defaultScope, examTypeOf, hashToken, isDateKey, matchSubjects, pkceOk,
  randomToken, redirectWith, routePath, scheduleIn, todayKey, validExamInput, validMaterialInput, validRedirectUri, validScope, warsawMidnight,
} from '../functions/src/mcpLogic'

describe('OAuth: pomocnicze', () => {
  it('PKCE S256', () => {
    const verifier = 'a'.repeat(43)
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    expect(pkceOk(verifier, challenge)).toBe(true)
    expect(pkceOk('b'.repeat(43), challenge)).toBe(false)
    expect(pkceOk('krótki', challenge)).toBe(false)
    expect(pkceOk(undefined, challenge)).toBe(false)
  })
  it('adresy powrotne: https i pętla zwrotna, nic więcej', () => {
    for (const ok of ['https://claude.ai/api/mcp/auth_callback', 'http://localhost:33418/callback', 'http://127.0.0.1/cb']) expect(validRedirectUri(ok)).toBe(true)
    for (const bad of ['http://evil.com/cb', 'javascript:alert(1)', 'https://a.pl/cb#x', 'https://u:p@a.pl/', 'myapp://cb', '', 5]) expect(validRedirectUri(bad)).toBe(false)
  })
  it('redirectWith dokłada kod i state, pomija puste', () => {
    expect(redirectWith('https://a.pl/cb?x=1', { code: 'c', state: 's s', skip: undefined })).toBe('https://a.pl/cb?x=1&code=c&state=s+s')
  })
  it('bearer z nagłówka', () => {
    expect(bearerFrom({ authorization: 'Bearer abc' })).toBe('abc')
    expect(bearerFrom({ authorization: 'bearer abc' })).toBe('abc')
    expect(bearerFrom({ authorization: 'Basic abc' })).toBeNull()
    expect(bearerFrom({})).toBeNull()
  })
  it('routePath: z hostingu i bezpośrednio z funkcji', () => {
    expect(routePath('/mcp')).toBe('/')
    expect(routePath('/')).toBe('/')
    expect(routePath('')).toBe('/')
    expect(routePath('/token')).toBe('/token')
    expect(routePath('/mcp/token')).toBe('/token')
    expect(routePath('/.well-known/oauth-protected-resource/mcp')).toBe('/.well-known/oauth-protected-resource/mcp')
    expect(routePath('/mcpx')).toBe('/mcpx')
  })
  it('tokeny są losowe, a skrót stały', () => {
    expect(randomToken()).not.toBe(randomToken())
    expect(hashToken('x')).toBe(hashToken('x'))
    expect(hashToken('x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('daty', () => {
  it('isDateKey odrzuca nieistniejące dni', () => {
    expect(isDateKey('2026-11-05')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '5.11.2026', 20261105, null]) expect(isDateKey(bad)).toBe(false)
  })
  it('todayKey liczy w czasie polskim', () => {
    expect(todayKey(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06')
    expect(todayKey(new Date('2026-07-05T21:59:00Z'))).toBe('2026-07-05')
  })
  it('warsawMidnight uwzględnia czas letni i zimowy', () => {
    expect(warsawMidnight('2026-11-05').toISOString()).toBe('2026-11-04T23:00:00.000Z')
    expect(warsawMidnight('2026-07-05').toISOString()).toBe('2026-07-04T22:00:00.000Z')
  })
  it('addDaysKey przechodzi przez miesiące', () => {
    expect(addDaysKey('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('dateRange: dziś, dzień, zakres i błędy', () => {
    expect(dateRange({}, '2026-11-05')).toEqual({ from: '2026-11-05', to: '2026-11-05' })
    expect(dateRange({ date: '2026-11-07' }, '2026-11-05')).toEqual({ from: '2026-11-07', to: '2026-11-07' })
    expect(dateRange({ from: '2026-11-02', to: '2026-11-08' }, 'x')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(() => dateRange({ from: '2026-11-08', to: '2026-11-02' }, 'x')).toThrow()
    expect(() => dateRange({ date: 'jutro' }, 'x')).toThrow(/Nieprawidłowa data/)
    expect(() => dateRange({ from: '2026-01-01', to: '2027-01-01' }, 'x')).toThrow(/najwyżej/)
  })
})

describe('scheduleIn', () => {
  const ev = (start: string, name = 'Mathematics') => ({ name, form: 'CW', group: '12', room: '1.2', start, end: start.slice(0, 11) + '10:30' })
  it('filtruje po dniu i przedmiocie oraz sortuje', () => {
    const events = [ev('2026-11-06T12:00'), ev('2026-11-05T09:00'), ev('2026-11-05T08:00', 'Microeconomics I'), ev('2026-11-09T08:00')]
    const out = scheduleIn(events, { from: '2026-11-05', to: '2026-11-06' })
    expect(out.map((l) => `${l.date} ${l.from}`)).toEqual(['2026-11-05 08:00', '2026-11-05 09:00', '2026-11-06 12:00'])
    expect(scheduleIn(events, { from: '2026-11-05', to: '2026-11-09' }, 'mikro')).toEqual([])
    expect(scheduleIn(events, { from: '2026-11-05', to: '2026-11-09' }, 'micro')).toHaveLength(1)
  })
})

describe('matchSubjects', () => {
  const subjects = [
    { id: '1', name: 'Mathematics' }, { id: '2', name: 'Mathematics' },
    { id: '3', name: 'Microeconomics I' }, { id: '4', name: 'Microeconomics II' },
  ]
  it('dokładna nazwa zwraca wszystkie przedmioty o tej nazwie', () => {
    expect(matchSubjects(subjects, ' mathematics ').map((s) => s.id)).toEqual(['1', '2'])
  })
  it('fragment działa tylko gdy jest jednoznaczny', () => {
    expect(matchSubjects(subjects, 'math').map((s) => s.id)).toEqual(['1', '2'])
    expect(matchSubjects(subjects, 'micro')).toEqual([])
    expect(matchSubjects(subjects, 'microeconomics i').map((s) => s.id)).toEqual(['3'])
    expect(matchSubjects(subjects, '')).toEqual([])
  })
})

describe('zaliczenia', () => {
  it('rozpoznaje rodzaj z luźnego zapisu', () => {
    expect(examTypeOf('Mid-term')).toBe('MID')
    expect(examTypeOf('midterm')).toBe('MID')
    expect(examTypeOf('Final exam')).toBe('FIN')
    expect(examTypeOf('QUIZ')).toBe('QUIZ')
    expect(examTypeOf('kartkówka')).toBeNull() // znaki spoza a–z są odrzucane, więc „kartkowka” trzeba podać bez ogonków
    expect(examTypeOf('kartkowka')).toBe('QUIZ')
    expect(examTypeOf('x')).toBeNull()
  })
  it('walidacja jak w regułach Firestore', () => {
    expect(validExamInput({ type: 'MID', date: '2026-11-20', time: '14:30', room: ' 3.4 ', note: ' zakres ' })).toEqual({ type: 'MID', date: '2026-11-20', time: '14:30', room: '3.4', note: 'zakres' })
    expect(validExamInput({ type: 'FIN', date: '2026-12-01', time: '', room: '' })).toEqual({ type: 'FIN', date: '2026-12-01' })
    expect(() => validExamInput({ type: 'MID', date: '2026-11-20', time: '25:00' })).toThrow(/Godzina/)
    expect(() => validExamInput({ type: 'MID', date: '20.11.2026' })).toThrow(/datę/)
    expect(() => validExamInput({ type: 'foo', date: '2026-11-20' })).toThrow(/Rodzaj/)
    expect(() => validExamInput({ type: 'MID', date: '2026-11-20', note: 'x'.repeat(301) })).toThrow(/300/)
    expect(() => validExamInput({ type: 'MID', date: '2026-11-20', room: 'x'.repeat(101) })).toThrow(/100/)
  })
  it('grupa: forma i numer', () => {
    expect(validScope('cw', ' 12 ')).toEqual({ form: 'CW', group: '12' })
    expect(() => validScope('XYZ', '1')).toThrow(/Forma/)
    expect(() => validScope('CW', 'a b')).toThrow(/grupy/)
    expect(() => validScope('CW', '')).toThrow(/grupy/)
  })
  it('domyślna grupa to ćwiczenia przed wykładem', () => {
    expect(defaultScope([])).toBeNull()
    expect(defaultScope([{ form: 'WYK', group: '1' }, { form: 'CW', group: '12' }])).toEqual({ form: 'CW', group: '12' })
    expect(defaultScope([{ form: 'WYK', group: '1' }])).toEqual({ form: 'WYK', group: '1' })
  })
})

describe('materiały', () => {
  it('notatka i link', () => {
    expect(validMaterialInput({ title: ' T ', content: ' treść ' })).toEqual({ type: 'note', title: 'T', content: 'treść' })
    expect(validMaterialInput({ title: 'L', type: 'link', url: 'https://a.pl/x' })).toEqual({ type: 'link', title: 'L', url: 'https://a.pl/x' })
    expect(() => validMaterialInput({ title: 'L', type: 'link', url: 'javascript:alert(1)' })).toThrow(/http/)
    expect(() => validMaterialInput({ title: '', content: 'x' })).toThrow(/Tytuł/)
    expect(() => validMaterialInput({ title: 'a', content: '  ' })).toThrow(/pusta/)
    expect(() => validMaterialInput({ title: 'a', type: 'slide' })).toThrow(/notatkę/)
  })
})

describe('addTodoItems', () => {
  let n = 0
  const id = () => `id${++n}`
  it('dokłada na koniec i pomija powtórzenia', () => {
    const base = [{ id: 'a', title: 'Rozdział 1', done: true }]
    const r = addTodoItems(base, ['rozdział 1', ' Rozdział  2 ', '', 'Rozdział 2'], id)
    expect(r.added).toEqual(['Rozdział 2'])
    expect(r.skipped).toEqual(['rozdział 1', 'Rozdział 2'])
    expect(r.items.map((i) => [i.title, i.done])).toEqual([['Rozdział 1', true], ['Rozdział 2', false]])
  })
  it('wymaga punktów i pilnuje limitu', () => {
    expect(() => addTodoItems([], [], id)).toThrow()
    expect(() => addTodoItems([], 'x', id)).toThrow()
    const many = Array.from({ length: 300 }, (_, i) => ({ id: String(i), title: `p${i}`, done: false }))
    expect(() => addTodoItems(many, ['nowy'], id)).toThrow(/300/)
  })
})
