import { describe, expect, it } from 'vitest'
import { groupTextbooks, norm, subFolder, topFolder } from '../src/features/textbooks/group'
import type { Subject } from '../src/features/materials/types'

const subj = (id: string, name: string, kind: Subject['kind'] = 'WYK'): Subject => ({ id, name, kind, createdBy: 'x' })
const book = (title: string, folder: string) => ({ title, folder })

describe('groupTextbooks', () => {
  const subjects = [subj('1', 'Mathematics', 'WYK+CW'), subj('2', 'Mikroekonomia', 'WYK'), subj('3', 'Mikroekonomia', 'CW'), subj('4', 'Statystyka', 'LAB')]

  it('przypisuje książki do przedmiotu po pierwszym członie folderu', () => {
    const r = groupTextbooks([book('Calculus', 'Mathematics'), book('Slajdy 1', 'Mikroekonomia / Prezentacje')], subjects)
    expect(r.sections.find((s) => s.name === 'Mathematics')!.books.map((b) => b.title)).toEqual(['Calculus'])
    expect(r.sections.find((s) => s.name === 'Mikroekonomia')!.books.map((b) => b.title)).toEqual(['Slajdy 1'])
  })
  it('przedmioty o tej samej nazwie (WYK i CW) to jedna sekcja', () => {
    const r = groupTextbooks([book('Varian', 'Mikroekonomia')], subjects)
    expect(r.sections).toHaveLength(3)
    const mikro = r.sections.find((s) => s.name === 'Mikroekonomia')!
    expect(mikro.subjects.map((s) => s.kind)).toEqual(['WYK', 'CW'])
  })
  it('dopasowanie ignoruje wielkość liter, polskie znaki i spacje', () => {
    const r = groupTextbooks([book('X', ' MIKROEKONOMIA ')], [subj('9', 'Mikroekonomia')])
    expect(r.sections[0].books).toHaveLength(1)
    expect(norm('Łódź  Ćwiczenia')).toBe('lodz cwiczenia')
  })
  it('foldery bez przedmiotu są grupowane osobno, a pliki z głównego folderu to „ogólne”', () => {
    const r = groupTextbooks([book('A', 'Prawo'), book('B', 'prawo / Ćwiczenia'), book('C', ''), book('D', 'Historia')], subjects)
    expect(r.unmatched.map((u) => [u.folder, u.books.length])).toEqual([['Historia', 1], ['Prawo', 2]])
    expect(r.general.map((b) => b.title)).toEqual(['C'])
  })
  it('książki w sekcji są posortowane po tytule', () => {
    const r = groupTextbooks([book('b', 'Statystyka'), book('A', 'Statystyka'), book('ą', 'Statystyka')], subjects)
    expect(r.sections.find((s) => s.name === 'Statystyka')!.books.map((b) => b.title)).toEqual(['A', 'ą', 'b'])
  })
  it('człony folderu', () => {
    expect(topFolder('Mikro / Prezentacje / 2026')).toBe('Mikro')
    expect(subFolder('Mikro / Prezentacje / 2026')).toBe('Prezentacje / 2026')
    expect(subFolder('Mikro')).toBe('')
    expect(topFolder('')).toBe('')
  })
})
