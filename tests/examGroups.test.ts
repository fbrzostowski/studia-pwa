import { describe, expect, it } from 'vitest'
import { defaultScope, groupsOf, myGroups, relevantFor, sameScope, scopeTitle, visibleTo } from '../src/features/exams/groups'
import type { Exam } from '../src/features/exams/types'

const ex = (id: string, over: Partial<Exam> = {}): Exam => ({ id, subjectId: 's1', type: 'MID', date: '2026-11-05', createdBy: 'u', ...over })
const sc = (form: string, group: string) => ({ form, group })

describe('grupy przedmiotu', () => {
  const members = [
    { uid: 'a', subjectId: 's1', classes: [sc('WYK', '1'), sc('CW', '16')] },
    { uid: 'b', subjectId: 's1', classes: [sc('WYK', '1'), sc('CW', '4')] },
    { uid: 'c', subjectId: 's2', classes: [sc('CW', '9')] },
    { uid: 'd', subjectId: 's1', classes: [] },
  ]
  it('groupsOf zbiera unikalne grupy wybranych przedmiotów, wykłady przed ćwiczeniami, numery liczbowo', () => {
    expect(groupsOf(members, new Set(['s1']))).toEqual([sc('WYK', '1'), sc('CW', '4'), sc('CW', '16')])
    expect(groupsOf(members, new Set(['s2']))).toEqual([sc('CW', '9')])
    expect(groupsOf(members, new Set())).toEqual([])
  })
  it('myGroups zwraca tylko moje grupy; brak grup to pusta lista', () => {
    expect(myGroups(members, new Set(['s1']), 'a')).toEqual([sc('WYK', '1'), sc('CW', '16')])
    expect(myGroups(members, new Set(['s1']), 'd')).toEqual([])
    expect(myGroups(members, new Set(['s1']), 'nikt')).toEqual([])
  })
  it('sameScope ignoruje różnice w zapisie numeru grupy', () => {
    expect(sameScope(sc('CW', ' 16 '), sc('CW', '16'))).toBe(true)
    expect(sameScope(sc('CW', '16'), sc('WYK', '16'))).toBe(false)
    expect(scopeTitle(sc('CW', '16'))).toBe('Ćwiczenia · gr. 16')
  })
})

describe('widoczność terminów', () => {
  it('termin „tylko dla autora” widzi tylko autor', () => {
    expect(visibleTo(ex('1', { onlyFor: 'me' }), 'me')).toBe(true)
    expect(visibleTo(ex('1', { onlyFor: 'me' }), 'ktos')).toBe(false)
    expect(visibleTo(ex('1'), 'ktos')).toBe(true)
    expect(visibleTo(ex('1', { form: 'CW', group: '16' }), 'ktos')).toBe(true)
  })
  it('termin grupy dotyczy mnie tylko w mojej grupie, a bez grupy zawsze', () => {
    const mine = [sc('CW', '16')]
    expect(relevantFor(ex('1'), mine)).toBe(true)
    expect(relevantFor(ex('1', { form: 'CW', group: '16' }), mine)).toBe(true)
    expect(relevantFor(ex('1', { form: 'CW', group: '4' }), mine)).toBe(false)
    expect(relevantFor(ex('1', { form: 'WYK', group: '16' }), mine)).toBe(false)
    expect(relevantFor(ex('1', { form: 'CW', group: '4' }), [])).toBe(false)
  })
})

describe('defaultScope', () => {
  it('ćwiczenia przed wykładem, a bez grupy „tylko dla mnie”', () => {
    expect(defaultScope([sc('WYK', '1'), sc('CW', '16')])).toEqual(sc('CW', '16'))
    expect(defaultScope([sc('WYK', '1')])).toEqual(sc('WYK', '1'))
    expect(defaultScope([])).toBe('me')
  })
})
