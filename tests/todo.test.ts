import { describe, expect, it } from 'vitest'
import { defaultListName, itemsFromMaterials, progress, syncWithMaterials, type TodoItem } from '../src/features/exams/todo'

let n = 0
const id = () => `i${++n}`
const mat = (mid: string, title: string) => ({ id: mid, title })

describe('itemsFromMaterials', () => {
  it('tworzy po jednym nieodznaczonym punkcie na materiał, w kolejności naturalnej', () => {
    const items = itemsFromMaterials([mat('a', 'Wykład 10'), mat('b', 'wykład 2'), mat('c', 'Ćwiczenia 1')], id)
    expect(items.map((i) => i.title)).toEqual(['Ćwiczenia 1', 'wykład 2', 'Wykład 10'])
    expect(items.every((i) => !i.done)).toBe(true)
    expect(items.map((i) => i.materialId)).toEqual(['c', 'b', 'a'])
    expect(new Set(items.map((i) => i.id)).size).toBe(3)
  })
  it('pusta lista materiałów daje pustą listę', () => {
    expect(itemsFromMaterials([], id)).toEqual([])
  })
})

describe('syncWithMaterials', () => {
  const base: TodoItem[] = [
    { id: 'x1', title: 'Granice', done: true, materialId: 'm1' },
    { id: 'x2', title: 'Pochodne', done: false, materialId: 'm2' },
    { id: 'x3', title: 'Powtórzyć wzory', done: true }, // ręczny
  ]

  it('zachowuje odznaczenia i punkty ręczne, dokłada nowe materiały na końcu', () => {
    const r = syncWithMaterials(base, [mat('m1', 'Granice'), mat('m2', 'Pochodne'), mat('m3', 'Całki')], id)
    expect(r.added).toBe(1)
    expect(r.removed).toBe(0)
    expect(r.items.map((i) => [i.title, i.done])).toEqual([
      ['Granice', true],
      ['Pochodne', false],
      ['Powtórzyć wzory', true],
      ['Całki', false],
    ])
  })
  it('usuwa punkty skasowanych materiałów, ale nie ręcznych', () => {
    const r = syncWithMaterials(base, [mat('m2', 'Pochodne')], id)
    expect(r.removed).toBe(1)
    expect(r.items.map((i) => i.title)).toEqual(['Pochodne', 'Powtórzyć wzory'])
  })
  it('aktualizuje tytuł po zmianie nazwy materiału, nie ruszając odznaczenia', () => {
    const r = syncWithMaterials(base, [mat('m1', 'Granice ciągów'), mat('m2', 'Pochodne')], id)
    expect(r.items[0]).toMatchObject({ title: 'Granice ciągów', done: true, materialId: 'm1' })
  })
  it('jest idempotentne: drugie odświeżenie nic nie zmienia', () => {
    const mats = [mat('m1', 'Granice'), mat('m2', 'Pochodne')]
    const once = syncWithMaterials(base, mats, id)
    const twice = syncWithMaterials(once.items, mats, id)
    expect(twice.added).toBe(0)
    expect(twice.removed).toBe(0)
    expect(twice.items).toEqual(once.items)
  })
})

describe('progress / nazwa', () => {
  it('liczy opanowane punkty i procent', () => {
    expect(progress([])).toEqual({ done: 0, total: 0, percent: 0 })
    const items: TodoItem[] = [
      { id: '1', title: 'a', done: true },
      { id: '2', title: 'b', done: false },
      { id: '3', title: 'c', done: true },
    ]
    expect(progress(items)).toEqual({ done: 2, total: 3, percent: 67 })
  })
  it('domyślna nazwa mieści się w limicie 100 znaków', () => {
    expect(defaultListName('Mathematics')).toBe('Nauka: Mathematics')
    expect(defaultListName('x'.repeat(200))).toHaveLength(100)
  })
})
