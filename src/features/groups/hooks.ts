import { useEffect, useRef, useState } from 'react'
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
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

/**
 * Dopisuje do własnych członkostw kopię zdjęcia profilu, bo dokumenty `users` są prywatne,
 * a inni mają widzieć miniaturkę. Błąd (np. stare reguły) jest pomijany; kolejna próba przy następnym wejściu.
 */
export function useSyncMyPhoto(memberships: Membership[]) {
  const { user, profile } = useAuth()
  const failed = useRef(new Set<string>())
  const photo = profile?.photoURL ?? ''
  useEffect(() => {
    if (!user || !photo) return
    for (const m of memberships) {
      if (m.uid !== user.uid || m.photoURL === photo || failed.current.has(m.id)) continue
      updateDoc(doc(db, 'memberships', m.id), { photoURL: photo }).catch(() => failed.current.add(m.id))
    }
  }, [memberships, user, photo])
}
