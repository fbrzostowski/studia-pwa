import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compactEvents } from '../src/features/schedule/eventEdit'
import { parseIcs, type IcsEvent } from '../src/features/schedule/parseIcs'
import { fold, toIcs } from '../src/features/schedule/toIcs'

const ev = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  code: '110-D',
  name: 'Mathematics',
  form: 'WYK',
  group: '1',
  room: 'G-Aula V',
  start: '2026-10-29T09:50',
  end: '2026-10-29T11:30',
  ...over,
})
// Po zapisie do bazy puste pola znikają, więc porównujemy w tej samej postaci.
const roundTrip = (events: IcsEvent[]) => compactEvents(parseIcs(toIcs(events)))

describe('toIcs', () => {
  it('eksport i ponowny import dają te same zajęcia (plik z USOS)', () => {
    const original = compactEvents(parseIcs(readFileSync('tests/fixtures/plan.ics', 'utf8')))
    expect(original.length).toBeGreaterThan(0)
    expect(roundTrip(original)).toEqual(original)
  })
  it('zachowuje polskie znaki, przecinki, średniki i ukośniki w nazwie oraz sali', () => {
    const tricky = [
      ev({ name: 'Historia, część I; wstęp \\ zażółć gęślą jaźń', room: 'C-3, piętro 2; skrzydło B', group: '15' }),
      ev({ name: 'Język II hiszpański w biznesie i ekonomii (1. semestr)', form: 'CW', group: '16', code: '', room: undefined }),
      ev({ name: 'Bez grupy i sali', group: undefined, room: undefined, form: 'KON' }),
    ]
    expect(roundTrip(tricky)).toEqual(compactEvents(tricky))
  })
  it('długie nazwy są zawijane do 75 bajtów i nadal się wczytują', () => {
    const long = ev({ name: 'Zażółć gęślą jaźń '.repeat(12).trim() })
    const ics = toIcs([long])
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(roundTrip([long])).toEqual(compactEvents([long]))
  })
  it('zajęcia przez północ i pusta lista', () => {
    const night = ev({ start: '2026-10-29T23:30', end: '2026-10-29T23:59' })
    expect(roundTrip([night])).toEqual(compactEvents([night]))
    expect(parseIcs(toIcs([]))).toEqual([])
    expect(toIcs([])).toContain('BEGIN:VCALENDAR')
  })
  it('końce linii to CRLF, a plik kończy się nową linią', () => {
    const ics = toIcs([ev()])
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })
})

describe('fold', () => {
  it('nie tnie znaków wielobajtowych i po rozwinięciu daje oryginał', () => {
    const line = 'DESCRIPTION:' + 'ą'.repeat(100)
    const folded = fold(line)
    expect(folded.replace(/\r\n /g, '')).toBe(line)
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
  })
})
