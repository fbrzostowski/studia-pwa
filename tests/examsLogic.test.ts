import { describe, expect, it } from 'vitest'
import { byDate, countdown, daysUntil, groupExams, splitExams } from '../src/features/exams/logic'
import type { Exam } from '../src/features/exams/types'
import type { Subject } from '../src/features/materials/types'

const ex = (id: string, subjectId: string, date: string, over: Partial<Exam> = {}): Exam => ({
  id, subjectId, type: 'MID', date, createdBy: 'u', ...over,
})
const sub = (id: string, name: string, kind: Subject['kind'] = 'WYK'): Subject => ({ id, name, kind, createdBy: 'x' })

describe('daysUntil / countdown', () => {
  it('liczy dni kalendarzowo, także przez zmianę czasu (25.10.2026) i granicę roku', () => {
    expect(daysUntil('2026-10-22', '2026-10-22')).toBe(0)
    expect(daysUntil('2026-10-26', '2026-10-24')).toBe(2)
    expect(daysUntil('2026-10-25', '2026-10-24')).toBe(1)
    expect(daysUntil('2027-01-02', '2026-12-31')).toBe(2)
    expect(daysUntil('2026-10-20', '2026-10-22')).toBe(-2)
  })
  it('opisuje odliczanie po polsku', () => {
    expect([0, 1, 2, 12, -1, -3].map(countdown)).toEqual(['dziś', 'jutro', 'za 2 dni', 'za 12 dni', 'wczoraj', '3 dni temu'])
  })
})

describe('splitExams / byDate', () => {
  const list = [ex('a', 's', '2026-11-20'), ex('b', 's', '2026-10-01'), ex('c', 's', '2026-10-22', { time: '13:00' }), ex('d', 's', '2026-10-22', { time: '09:00' }), ex('e', 's', '2026-10-22')]

  it('dzisiejszy termin jest nadchodzący; kolejność: data, godzina, bez godziny na końcu', () => {
    const { upcoming, past } = splitExams(list, '2026-10-22')
    expect(upcoming.map((x) => x.id)).toEqual(['d', 'c', 'e', 'a'])
    expect(past.map((x) => x.id)).toEqual(['b'])
  })
  it('minione są od najświeższego', () => {
    const { past } = splitExams([ex('x', 's', '2026-09-01'), ex('y', 's', '2026-10-01')], '2026-11-01')
    expect(past.map((x) => x.id)).toEqual(['y', 'x'])
  })
  it('byDate porządkuje po dacie', () => {
    expect(byDate(ex('1', 's', '2026-01-01'), ex('2', 's', '2026-01-02'))).toBeLessThan(0)
  })
})

describe('groupExams', () => {
  const subjects = [sub('1', 'Mathematics', 'WYK+CW'), sub('2', 'Mikroekonomia', 'WYK'), sub('3', 'Mikroekonomia', 'CW'), sub('4', 'Prawo', 'WYK')]

  it('łączy przedmioty o tej samej nazwie i przypisuje terminy do właściwej sekcji', () => {
    const r = groupExams(subjects, [ex('a', '2', '2026-11-05'), ex('b', '3', '2026-11-02', { type: 'FIN' })], new Set(['1']))
    const mikro = r.find((s) => s.name === 'Mikroekonomia')!
    expect(mikro.subjects).toHaveLength(2)
    expect(mikro.exams.map((e) => e.id)).toEqual(['b', 'a'])
  })
  it('pokazuje przedmioty, do których należę, albo mające terminy; resztę ukrywa', () => {
    const r = groupExams(subjects, [ex('a', '4', '2026-11-05')], new Set(['1']))
    expect(r.map((s) => s.name)).toEqual(['Mathematics', 'Prawo'])
    expect(r.find((s) => s.name === 'Mathematics')!.mine).toBe(true)
  })
  it('ignoruje terminy przedmiotów, których już nie ma', () => {
    const r = groupExams(subjects, [ex('a', 'zniknal', '2026-11-05')], new Set(['1']))
    expect(r.flatMap((s) => s.exams)).toHaveLength(0)
  })
})
