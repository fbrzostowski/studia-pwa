import { useEffect, useState } from 'react'
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import type { MaterialRef, TodoList } from './todo'

/** Moje prywatne listy do nauki (reguły wpuszczają tylko zapytanie po własnym ownerId). */
export function useTodoLists() {
  const { user } = useAuth()
  const [lists, setLists] = useState<TodoList[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'todoLists'), where('ownerId', '==', user!.uid)),
        (snap) =>
          setLists(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<TodoList, 'id'>) }))
              .sort((a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity)),
          ),
        (e) => {
          setError(e.message)
          setLists([])
        },
      ),
    [user],
  )
  return { lists, error }
}

/** Wszystkie materiały podanych przedmiotów (np. wykład i ćwiczenia o tej samej nazwie). */
export async function fetchMaterials(subjectIds: string[]): Promise<MaterialRef[]> {
  if (subjectIds.length === 0) return []
  const out: MaterialRef[] = []
  // zapytanie „in” przyjmuje do 30 wartości
  for (let i = 0; i < subjectIds.length; i += 30) {
    const snap = await getDocs(query(collection(db, 'materials'), where('subjectId', 'in', subjectIds.slice(i, i + 30))))
    for (const d of snap.docs) out.push({ id: d.id, title: String(d.get('title') ?? '') })
  }
  return out.filter((m) => m.title.trim())
}
