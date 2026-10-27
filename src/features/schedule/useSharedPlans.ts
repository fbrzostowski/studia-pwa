import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { useMemberships } from '../groups/hooks'

export interface PlanPerson {
  uid: string
  username: string
  photoURL?: string
}

/**
 * Osoby, które udostępniły swój plan. Listy `plans` nie da się zapytać (reguły sprawdzają każdy dokument osobno),
 * więc bierzemy kandydatów z członkostw przedmiotów i dla każdego próbujemy odczytać plan; odmowa = nie udostępnia.
 */
export function useSharedPlanPeople() {
  const { user } = useAuth()
  const memberships = useMemberships()
  const candidates = useMemo(() => {
    const m = new Map<string, PlanPerson>()
    for (const x of memberships) {
      if (x.uid === user!.uid) continue
      const prev = m.get(x.uid)
      m.set(x.uid, { uid: x.uid, username: x.username, photoURL: x.photoURL ?? prev?.photoURL })
    }
    return [...m.values()].sort((a, b) => a.username.localeCompare(b.username, 'pl'))
  }, [memberships, user])

  const [sharing, setSharing] = useState<Set<string> | null>(null) // null = sprawdzanie
  const key = candidates.map((c) => c.uid).join(',')
  useEffect(() => {
    let live = true
    Promise.allSettled(candidates.map((c) => getDoc(doc(db, 'plans', c.uid)))).then((res) => {
      if (!live) return
      setSharing(new Set(candidates.filter((_, i) => res[i].status === 'fulfilled' && (res[i] as PromiseFulfilledResult<{ exists(): boolean }>).value.exists()).map((c) => c.uid)))
    })
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { people: sharing ? candidates.filter((c) => sharing.has(c.uid)) : [], checking: sharing === null }
}
