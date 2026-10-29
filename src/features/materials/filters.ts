import { norm } from '../../lib/text'
import { sameScope, type Scope } from '../exams/groups'
import { TYPE_LABEL, type Material } from './types'

/** Grupa, do której materiał jest przypięty (przez lekcję); materiały bez lekcji nie mają grupy. */
export const materialScope = (m: Pick<Material, 'lessonForm' | 'lessonGroup'>): Scope | null =>
  m.lessonForm && m.lessonGroup ? { form: m.lessonForm, group: m.lessonGroup } : null

/**
 * Materiały po wyszukiwaniu (tytuł, autor, rodzaj, treść notatki, nazwa pliku, link) i po grupach.
 * Materiał bez grupy (nie przypięty do lekcji) pokazuje się zawsze; pusty wybór grup oznacza wszystkie grupy.
 */
export function filterMaterials(materials: Material[], query: string, selected: Scope[]): Material[] {
  const q = norm(query)
  return materials.filter((m) => {
    if (q) {
      const hay = norm([m.title, m.ownerName, TYPE_LABEL[m.type], m.content, m.fileName, m.url].filter(Boolean).join(' '))
      if (!hay.includes(q)) return false
    }
    const s = materialScope(m)
    return !s || selected.length === 0 || selected.some((x) => sameScope(x, s))
  })
}

/** Etykieta przycisku filtra grup. */
export function groupFilterLabel(selected: Scope[], title: (s: Scope) => string): string {
  if (selected.length === 0) return 'Wszystkie grupy'
  if (selected.length === 1) return title(selected[0]!)
  return `${selected.length} grupy`
}
