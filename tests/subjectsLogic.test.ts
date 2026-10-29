import { describe, expect, it } from 'vitest'
import { defaultMain, describeAccount, describeCounts, describeDeleted, duplicateIds } from '../src/features/subjects/logic'

const s = (id: string, name: string, usosCode?: string) => ({ id, name, usosCode })

describe('duplicateIds', () => {
  it('ta sama nazwa lub kod USOS oznacza możliwy duplikat', () => {
    const d = duplicateIds([s('1', 'Analiza'), s('2', ' ANALIZA '), s('3', 'Statystyka', 'K-1'), s('4', 'Inna nazwa', 'K-1'), s('5', 'Unikat')])
    expect([...d].sort()).toEqual(['1', '2', '3', '4'])
  })
  it('polskie znaki i wielkość liter nie mają znaczenia, a brak kodu nie paruje', () => {
    expect([...duplicateIds([s('1', 'Łączność'), s('2', 'laczność')])].sort()).toEqual(['1', '2'])
    expect(duplicateIds([s('1', 'A'), s('2', 'B')]).size).toBe(0)
  })
})

describe('defaultMain', () => {
  const m = (counts: Record<string, number>) => (id: string) => counts[id] ?? 0
  it('wygrywa przedmiot z większą liczbą uczestników', () => {
    expect(defaultMain(s('a', 'x'), s('b', 'x'), m({ a: 1, b: 4 }))).toBe('b')
    expect(defaultMain(s('a', 'x'), s('b', 'x'), m({ a: 5, b: 4 }))).toBe('a')
  })
  it('przy remisie kod USOS, potem pierwszy', () => {
    expect(defaultMain(s('a', 'x'), s('b', 'x', 'K'), m({}))).toBe('b')
    expect(defaultMain(s('a', 'x', 'K'), s('b', 'x'), m({}))).toBe('a')
    expect(defaultMain(s('a', 'x'), s('b', 'x'), m({}))).toBe('a')
  })
})

describe('describeCounts', () => {
  it('opisuje po polsku i pomija zera', () => {
    expect(describeCounts({ materials: 0, exams: 0, todoLists: 0, members: 0, classes: 0, books: 0 })).toEqual([])
    expect(describeCounts({ members: 1, materials: 2, exams: 5, todoLists: 1, classes: 0, books: 12 })).toEqual([
      '1 uczestnik',
      '2 materiały',
      '5 terminów zaliczeń',
      '1 lista do nauki',
      '12 podręczników',
    ])
  })
})

describe('describeDeleted', () => {
  it('opisuje po polsku, co zniknie, i pomija zera', () => {
    expect(describeDeleted({ members: 0, classes: 0, materials: 0, files: 0, exams: 0, todoLists: 3 })).toEqual([])
    expect(describeDeleted({ members: 1, classes: 2, materials: 5, files: 2, exams: 1, todoLists: 0 })).toEqual([
      '1 uczestnictwo',
      '5 materiałów',
      '2 pliki',
      '1 termin zaliczenia',
      '2 wpisy prowadzących grup',
    ])
  })
})

describe('describeAccount', () => {
  it('opisuje po polsku, co zniknie wraz z kontem; plan tylko gdy jest', () => {
    expect(describeAccount({ memberships: 0, exams: 0, todoLists: 0, files: 0, plan: false })).toEqual([])
    expect(describeAccount({ memberships: 3, exams: 2, todoLists: 1, files: 0, plan: true })).toEqual([
      'plan zajęć',
      '3 przypisania do przedmiotów',
      '1 lista do nauki',
      '2 dodane przez Ciebie terminy zaliczeń',
    ])
  })
})
