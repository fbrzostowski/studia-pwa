import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { Material } from './types'

/** Materiały podpięte do lekcji w przedziale dat (włącznie), np. na widoczny miesiąc. */
export function useLessonNotes(fromKey: string, toKey: string) {
  const [notes, setNotes] = useState<Material[]>([])
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'materials'), where('lessonDate', '>=', fromKey), where('lessonDate', '<=', toKey)),
        (snap) =>
          setNotes(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Material, 'id'>) }))
              .sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity)),
          ),
        () => setNotes([]),
      ),
    [fromKey, toKey],
  )
  return notes
}
