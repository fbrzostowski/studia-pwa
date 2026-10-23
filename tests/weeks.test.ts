import { describe, expect, it } from 'vitest'
import { addDays, fromDateKey, monthWeeks, startOfWeek, toDateKey, toLocalIso, upcomingDayKeys, weekKeys } from '../src/features/schedule/weeks'

describe('daty', () => {
  it('addDays przechodzi przez zmianę czasu (25.10.2026) i granicę roku', () => {
    expect(toDateKey(addDays(fromDateKey('2026-10-24'), 1))).toBe('2026-10-25')
    expect(toDateKey(addDays(fromDateKey('2026-10-25'), 1))).toBe('2026-10-26')
    expect(toDateKey(addDays(fromDateKey('2026-12-31'), 1))).toBe('2027-01-01')
  })
  it('toLocalIso daje format zgodny z planem i porządkuje się leksykograficznie', () => {
    expect(toLocalIso(new Date(2026, 9, 5, 8, 0))).toBe('2026-10-05T08:00')
    expect(toLocalIso(new Date(2026, 9, 5, 9, 5)) > toLocalIso(new Date(2026, 9, 5, 8, 59))).toBe(true)
  })
})

describe('upcomingDayKeys', () => {
  const ev = (start: string, end: string) => ({ start, end })
  const plan = [
    ev('2026-10-20T08:00', '2026-10-20T09:40'), // wczoraj
    ev('2026-10-21T09:50', '2026-10-21T11:30'), // dziś
    ev('2026-10-21T11:40', '2026-10-21T13:20'), // dziś, ostatnie
    ev('2026-10-22T09:50', '2026-10-22T11:30'),
    ev('2026-10-22T13:30', '2026-10-22T15:10'),
    ev('2026-10-26T09:50', '2026-10-26T11:30'), // po weekendzie
  ]

  it('rano: od dziś, bez dni minionych i bez dni pustych', () => {
    expect(upcomingDayKeys(plan, '2026-10-21T07:00')).toEqual(['2026-10-21', '2026-10-22', '2026-10-26'])
  })
  it('w trakcie ostatnich zajęć dzisiejszy dzień wciąż jest na liście', () => {
    expect(upcomingDayKeys(plan, '2026-10-21T12:00')[0]).toBe('2026-10-21')
  })
  it('po końcu ostatnich zajęć (także dokładnie o tej minucie) od jutra', () => {
    expect(upcomingDayKeys(plan, '2026-10-21T13:20')[0]).toBe('2026-10-22')
    expect(upcomingDayKeys(plan, '2026-10-21T18:00')).toEqual(['2026-10-22', '2026-10-26'])
  })
  it('dzień bez zajęć: od najbliższego dnia z zajęciami', () => {
    expect(upcomingDayKeys(plan, '2026-10-24T10:00')).toEqual(['2026-10-26'])
  })
  it('po końcu semestru lista jest pusta', () => {
    expect(upcomingDayKeys(plan, '2026-10-26T12:00')).toEqual([])
  })
})

describe('tygodnie i miesiące', () => {
  it('startOfWeek zwraca poniedziałek dla każdego dnia tygodnia, także niedzieli', () => {
    for (const k of ['2026-10-19', '2026-10-21', '2026-10-25']) {
      expect(toDateKey(startOfWeek(fromDateKey(k)))).toBe('2026-10-19')
    }
    expect(toDateKey(startOfWeek(fromDateKey('2027-01-01')))).toBe('2026-12-28')
  })
  it('tydzień ze zmianą czasu (25.10.2026) ma 7 kolejnych dni', () => {
    expect(weekKeys(fromDateKey('2026-10-19'))).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
  })
  it('październik 2026: 5 tygodni od 28.09 do 1.11, z DST w środku', () => {
    const w = monthWeeks(2026, 9)
    expect(w).toHaveLength(5)
    expect(w[0][0]).toBe('2026-09-28')
    expect(w[4][6]).toBe('2026-11-01')
    expect(w.flat()).toHaveLength(35)
    expect(new Set(w.flat()).size).toBe(35)
  })
  it('luty 2027 (zaczyna się w poniedziałek, kończy w niedzielę) to dokładnie 4 tygodnie', () => {
    const w = monthWeeks(2027, 1)
    expect(w).toHaveLength(4)
    expect(w[0][0]).toBe('2027-02-01')
    expect(w[3][6]).toBe('2027-02-28')
  })
  it('miesiąc przechodzi przez granicę roku (grudzień 2026 kończy się w styczniu)', () => {
    const w = monthWeeks(2026, 11)
    expect(w[0][0]).toBe('2026-11-30')
    expect(w[w.length - 1][6]).toBe('2027-01-03')
  })
  it('sierpień 2026 potrzebuje 6 tygodni', () => {
    expect(monthWeeks(2026, 7)).toHaveLength(6)
  })
})
