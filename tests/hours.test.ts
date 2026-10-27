import { describe, expect, it } from 'vitest'
import { academicHours, fmtHours, lessonMinutes, summarizeHours } from '../src/features/schedule/hours'
import type { IcsEvent } from '../src/features/schedule/parseIcs'

const ev = (form: string, start: string, end: string): IcsEvent => ({ code: 'X', name: 'N', form, start, end })

describe('lessonMinutes', () => {
  it('liczy minuty między początkiem a końcem', () => {
    expect(lessonMinutes(ev('CW', '2026-10-27T08:00', '2026-10-27T09:40'))).toBe(100)
    expect(lessonMinutes(ev('CW', '2026-10-27T23:30', '2026-10-28T00:15'))).toBe(45) // przez północ
  })
  it('uszkodzony lub odwrócony przedział to 0', () => {
    expect(lessonMinutes(ev('CW', '2026-10-27T10:00', '2026-10-27T09:00'))).toBe(0)
    expect(lessonMinutes(ev('CW', 'zle', 'zle'))).toBe(0)
  })
})

describe('summarizeHours', () => {
  const events = [
    ev('WYK', '2026-10-29T09:50', '2026-10-29T11:30'), // 100
    ev('CW', '2026-10-22T08:00', '2026-10-22T09:40'), // 100
    ev('CW', '2026-10-27T08:00', '2026-10-27T09:40'), // 100
    ev('CW', '2026-11-03T08:00', '2026-11-03T09:40'), // 100
  ]
  it('sumuje razem i według formy, osobno to, co już się odbyło', () => {
    const s = summarizeHours(events, '2026-10-27T09:00')
    expect(s.count).toBe(4)
    expect(s.minutes).toBe(400)
    expect(s.doneCount).toBe(1) // trwające (27.10 o 09:00) jeszcze się nie liczy
    expect(s.doneMinutes).toBe(100)
    expect(s.byForm.map((f) => [f.form, f.count, f.doneCount])).toEqual([
      ['CW', 3, 1],
      ['WYK', 1, 0],
    ])
  })
  it('zajęcia kończące się dokładnie o `now` są już odbyte', () => {
    expect(summarizeHours(events, '2026-10-27T09:40').doneCount).toBe(2)
  })
  it('zakres dat i najbliższe zajęcia', () => {
    const s = summarizeHours(events, '2026-10-27T09:00')
    expect(s.first).toBe('2026-10-22')
    expect(s.last).toBe('2026-11-03')
    expect(s.next?.start).toBe('2026-10-27T08:00') // trwające jest „następne”
    expect(summarizeHours(events, '2027-01-01T00:00').next).toBeUndefined()
  })
  it('pusta lista nie psuje podsumowania', () => {
    const s = summarizeHours([], '2026-10-27T09:00')
    expect([s.count, s.minutes, s.byForm.length, s.first, s.next]).toEqual([0, 0, 0, undefined, undefined])
  })
})

describe('formatowanie godzin', () => {
  it('godziny zegarowe i dydaktyczne z przecinkiem', () => {
    expect(fmtHours(90)).toBe('1,5 h')
    expect(fmtHours(120)).toBe('2 h')
    expect(fmtHours(2800)).toBe('46,7 h')
    expect(academicHours(90)).toBe('2')
    expect(academicHours(100)).toBe('2,2')
  })
})
