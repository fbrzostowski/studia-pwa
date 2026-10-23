import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import type { IcsEvent } from './parseIcs'

/** Terminy z zaimportowanego planu: undefined = ładowanie, null = brak planu. */
export function usePlanEvents() {
  const { user } = useAuth()
  const [events, setEvents] = useState<IcsEvent[] | null | undefined>(undefined)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'plans', user!.uid),
        (snap) => setEvents(snap.exists() ? ((snap.data().events as IcsEvent[]) ?? []) : null),
        () => setEvents(null),
      ),
    [user],
  )
  return events
}
