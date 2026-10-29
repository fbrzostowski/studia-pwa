import { describe, expect, it } from 'vitest'
import { canMerge, classKey, combineKinds, mergeClassInfos, normGroup, retargetFolder, shouldMoveFolder } from '../functions/src/mergeLogic'
import { SUBJECT_KINDS as APP_KINDS } from '../src/features/materials/types'
import { classKey as appClassKey, normGroup as appNormGroup } from '../src/features/schedule/parseIcs'
import { SUBJECT_KINDS as FN_KINDS } from '../functions/src/mergeLogic'

describe('combineKinds', () => {
  it('łączy formy w znany rodzaj', () => {
    expect(combineKinds('WYK', 'CW')).toBe('WYK+CW')
    expect(combineKinds('CW', 'WYK')).toBe('WYK+CW')
    expect(combineKinds('KON', 'CW')).toBe('KON+CW')
    expect(combineKinds('WYK+CW', 'CW')).toBe('WYK+CW')
    expect(combineKinds('WYK', 'WYK')).toBe('WYK')
    expect(combineKinds('WYK+CW', 'WYK+CW')).toBe('WYK+CW')
  })
  it('odrzuca kombinacje, których aplikacja nie zna', () => {
    expect(combineKinds('LAB', 'WYK')).toBeNull()
    expect(combineKinds('WYK', 'KON')).toBeNull()
    expect(combineKinds('WYK+CW', 'KON')).toBeNull()
    expect(combineKinds('LAB', 'CW')).toBeNull()
  })
  it('lista rodzajów w funkcji jest taka sama jak w aplikacji', () => {
    expect([...FN_KINDS]).toEqual([...APP_KINDS])
  })
})

describe('canMerge', () => {
  it('admin albo autor przedmiotu, który znika', () => {
    expect(canMerge('u1', 'u1', false)).toBe(true)
    expect(canMerge('u1', 'u2', false)).toBe(false)
    expect(canMerge('u1', 'u2', true)).toBe(true)
    expect(canMerge(undefined, 'u2', false)).toBe(false)
    expect(canMerge('', '', false)).toBe(false)
  })
})

describe('klucz grupy zgodny z aplikacją', () => {
  it('classKey i normGroup dają te same wyniki co w kliencie', () => {
    for (const g of ['15', ' 4 ', 'A/B', '', undefined, 'gr 3', '1.2']) {
      expect(normGroup(g)).toBe(appNormGroup(g))
      expect(classKey('s1', 'CW', g)).toBe(appClassKey('s1', 'CW', g))
    }
  })
})

describe('mergeClassInfos', () => {
  const c = (form: string, group: string, when: string[], rooms: string[]) => ({ form, group, when, rooms })
  it('ta sama grupa scala terminy i sale bez duplikatów, inne zostają', () => {
    const out = mergeClassInfos(
      [c('CW', '15', ['pt 11:40–13:15'], ['B-2']), c('WYK', '1', ['cz 09:50–11:30'], ['Aula'])],
      [c('CW', '15', ['pt 11:40–13:15', 'wt 08:00–09:40'], ['B-2', 'S-3']), c('CW', '16', ['pn 08:00–09:40'], [])],
    )
    expect(out).toHaveLength(3)
    expect(out.find((x) => x.form === 'CW' && x.group === '15')).toEqual(c('CW', '15', ['pt 11:40–13:15', 'wt 08:00–09:40'], ['B-2', 'S-3']))
    expect(out.find((x) => x.group === '16')?.when).toEqual(['pn 08:00–09:40'])
  })
  it('nie zmienia wejścia i znosi braki pól', () => {
    const a = [c('CW', '1', ['x'], [])]
    mergeClassInfos(a, [c('CW', '1', ['y'], [])])
    expect(a[0].when).toEqual(['x'])
    expect(mergeClassInfos([], [])).toEqual([])
    expect(mergeClassInfos([{ form: 'CW', group: '1' } as never], [])[0].when).toEqual([])
  })
})

describe('foldery podręczników przy łączeniu', () => {
  it('retargetFolder podmienia pierwszy człon, zachowując podfolder', () => {
    expect(retargetFolder('Analiza', 'analiza', 'Analiza matematyczna')).toBe('Analiza matematyczna')
    expect(retargetFolder('Analiza / Prezentacje', 'Analiza', 'Analiza matematyczna')).toBe('Analiza matematyczna / Prezentacje')
    expect(retargetFolder('Algebra', 'Analiza', 'X')).toBeNull()
    expect(retargetFolder('Łączność / Slajdy', 'laczność', 'Nowa')).toBe('Nowa / Slajdy')
  })
  it('folder przenosimy tylko, gdy nazwy się różnią i nikt inny nie używa starej', () => {
    expect(shouldMoveFolder('Analiza', 'Analiza', [])).toBe(false)
    expect(shouldMoveFolder('Analiza', 'ANALIZA ', [])).toBe(false)
    expect(shouldMoveFolder('Analiza', 'Analiza mat.', [])).toBe(true)
    expect(shouldMoveFolder('Analiza', 'Analiza mat.', ['Analiza'])).toBe(false)
    expect(shouldMoveFolder('Analiza', 'Analiza mat.', ['Inny'])).toBe(true)
  })
})
