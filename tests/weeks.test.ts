import { describe, expect, it } from 'vitest'
import { addDays, fromDateKey, startOfWeek, toDateKey, toLocalIso, weekKeys } from '../src/features/schedule/weeks'

describe('weeks', () => {
  it('poniedziałek tygodnia dla każdego dnia tygodnia', () => {
    for (const k of ['2026-10-19', '2026-10-21', '2026-10-25']) {
      expect(toDateKey(startOfWeek(fromDateKey(k)))).toBe('2026-10-19')
    }
    expect(toDateKey(startOfWeek(fromDateKey('2026-10-26')))).toBe('2026-10-26')
  })
  it('tydzień ze zmianą czasu (25.10.2026) ma 7 kolejnych dni', () => {
    expect(weekKeys(fromDateKey('2026-10-19'))).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ])
    expect(toDateKey(addDays(fromDateKey('2026-10-19'), 7))).toBe('2026-10-26')
  })
  it('przechodzi przez granicę roku', () => {
    expect(toDateKey(startOfWeek(fromDateKey('2027-01-01')))).toBe('2026-12-28')
    expect(weekKeys(fromDateKey('2026-12-28'))[6]).toBe('2027-01-03')
  })
  it('toLocalIso daje format zgodny z planem i porządkuje się leksykograficznie', () => {
    expect(toLocalIso(new Date(2026, 9, 5, 8, 0))).toBe('2026-10-05T08:00')
    expect(toLocalIso(new Date(2026, 9, 5, 9, 5)) > toLocalIso(new Date(2026, 9, 5, 8, 59))).toBe(true)
  })
})
