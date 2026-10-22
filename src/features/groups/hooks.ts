import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { ClassDoc, Membership } from './types'

// Obie kolekcje są małe (grupa znajomych), więc słuchamy całości; Firestore trzyma je w cache offline.
export function useMemberships() {
  const [list, setList] = useState<Membership[]>([])
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'memberships'),
        (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Membership, 'id'>) }))),
        () => setList([]),
      ),
    [],
  )
  return list
}

export function useClassDocs() {
  const [map, setMap] = useState<Record<string, ClassDoc>>({})
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'classes'),
        (snap) =>
          setMap(Object.fromEntries(snap.docs.map((d) => [d.id, { id: d.id, ...(d.data() as Omit<ClassDoc, 'id'>) }]))),
        () => setMap({}),
      ),
    [],
  )
  return map
}
