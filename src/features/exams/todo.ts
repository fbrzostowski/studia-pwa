import type { Timestamp } from 'firebase/firestore'

export interface TodoItem {
  id: string
  title: string
  done: boolean // opanowane
  materialId?: string // punkt wygenerowany z materiału; brak = dodany ręcznie
}

export interface MaterialRef {
  id: string
  title: string
}

export interface TodoList {
  id: string
  ownerId: string
  name: string
  subjectId?: string
  items: TodoItem[]
  createdAt?: Timestamp
}

const byTitle = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, 'pl', { numeric: true, sensitivity: 'base' })

const defaultId = () => crypto.randomUUID()

/** Postęp nauki: ile punktów odznaczono jako opanowane. */
export function progress(items: TodoItem[]) {
  const done = items.filter((i) => i.done).length
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 }
}

/** Nowa lista: po jednym punkcie na materiał, w kolejności naturalnej („Wykład 2” przed „Wykład 10”). */
export function itemsFromMaterials(materials: MaterialRef[], newId: () => string = defaultId): TodoItem[] {
  return [...materials].sort(byTitle).map((m) => ({ id: newId(), title: m.title, done: false, materialId: m.id }))
}

/**
 * Odświeżenie listy według aktualnych materiałów: nowe materiały dochodzą na końcu, punkty usuniętych
 * materiałów znikają, zmienione tytuły się aktualizują. Odznaczenia i punkty dodane ręcznie zostają.
 */
export function syncWithMaterials(items: TodoItem[], materials: MaterialRef[], newId: () => string = defaultId) {
  const byId = new Map(materials.map((m) => [m.id, m]))
  let removed = 0
  const kept: TodoItem[] = []
  for (const item of items) {
    if (!item.materialId) {
      kept.push(item)
      continue
    }
    const m = byId.get(item.materialId)
    if (m) kept.push({ ...item, title: m.title })
    else removed++
  }
  const known = new Set(kept.map((i) => i.materialId).filter(Boolean))
  const added = itemsFromMaterials(
    materials.filter((m) => !known.has(m.id)),
    newId,
  )
  return { items: [...kept, ...added], added: added.length, removed }
}

/** Domyślna nazwa listy, np. „Nauka: Mathematics”. */
export const defaultListName = (subjectName: string) => `Nauka: ${subjectName}`.slice(0, 100)
