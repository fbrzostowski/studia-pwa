import { describe, expect, it } from 'vitest'
import { filterMaterials, groupFilterLabel, materialScope } from '../src/features/materials/filters'
import type { Material } from '../src/features/materials/types'

const m = (id: string, over: Partial<Material> = {}): Material => ({ id, subjectId: 's1', title: 'Notatka ' + id, type: 'note', ownerId: 'u', ownerName: 'ola', ...over })
const sc = (form: string, group: string) => ({ form, group })

describe('materialScope', () => {
  it('grupa tylko gdy materiał jest przypięty do lekcji z formą i grupą', () => {
    expect(materialScope(m('a', { lessonDate: '2026-11-05', lessonForm: 'CW', lessonGroup: '16' }))).toEqual(sc('CW', '16'))
    expect(materialScope(m('a'))).toBeNull()
    expect(materialScope(m('a', { lessonForm: 'CW' }))).toBeNull()
    expect(materialScope(m('a', { lessonGroup: '16' }))).toBeNull()
  })
})

describe('filterMaterials', () => {
  const list = [
    m('1', { title: 'Granice ciągów', type: 'note', content: 'twierdzenie o trzech ciągach' }),
    m('2', { title: 'Slajdy', type: 'slide', fileName: 'wyklad3.pdf', ownerName: 'anna', lessonForm: 'WYK', lessonGroup: '1' }),
    m('3', { title: 'Zadania', type: 'link', url: 'https://example.com/zadania', lessonForm: 'CW', lessonGroup: '16' }),
    m('4', { title: 'Zadania gr. 4', lessonForm: 'CW', lessonGroup: '4' }),
  ]
  const ids = (r: Material[]) => r.map((x) => x.id)

  it('bez zapytania i bez grup zwraca wszystko', () => {
    expect(ids(filterMaterials(list, '', []))).toEqual(['1', '2', '3', '4'])
  })
  it('wyszukiwarka sprawdza tytuł, autora, rodzaj, treść, plik i link, bez wielkości liter i polskich znaków', () => {
    expect(ids(filterMaterials(list, 'GRANICE', []))).toEqual(['1'])
    expect(ids(filterMaterials(list, 'anna', []))).toEqual(['2'])
    expect(ids(filterMaterials(list, 'trzech ciagach', []))).toEqual(['1'])
    expect(ids(filterMaterials(list, 'wyklad3', []))).toEqual(['2'])
    expect(ids(filterMaterials(list, 'example.com', []))).toEqual(['3'])
    expect(ids(filterMaterials(list, 'link', []))).toEqual(['3'])
    expect(ids(filterMaterials(list, 'nie ma takiego', []))).toEqual([])
  })
  it('filtr grup pokazuje wybrane grupy i zawsze materiały bez grupy', () => {
    expect(ids(filterMaterials(list, '', [sc('CW', '16')]))).toEqual(['1', '3'])
    expect(ids(filterMaterials(list, '', [sc('CW', '16'), sc('WYK', '1')]))).toEqual(['1', '2', '3'])
    expect(ids(filterMaterials(list, '', [sc('CW', '99')]))).toEqual(['1'])
  })
  it('zapytanie i grupy działają razem', () => {
    expect(ids(filterMaterials(list, 'zadania', [sc('CW', '16')]))).toEqual(['3'])
    expect(ids(filterMaterials(list, 'zadania', [sc('CW', '4')]))).toEqual(['4'])
  })
})

describe('groupFilterLabel', () => {
  const t = (s: { form: string; group: string }) => `${s.form} ${s.group}`
  it('opisuje wybór', () => {
    expect(groupFilterLabel([], t)).toBe('Wszystkie grupy')
    expect(groupFilterLabel([sc('CW', '16')], t)).toBe('CW 16')
    expect(groupFilterLabel([sc('CW', '16'), sc('WYK', '1')], t)).toBe('2 grupy')
  })
})
