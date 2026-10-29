import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import type { IcsEvent } from './parseIcs'

/** Terminy z zaimportowanego planu (domyślnie Twojego, z `uid` cudzego): undefined = ładowanie, null = brak planu. */
export function usePlanEvents(uid?: string) {
  const { user } = useAuth()
  const owner = uid ?? user!.uid
  const [events, setEvents] = useState<IcsEvent[] | null | undefined>(undefined)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'plans', owner),
        (snap) => setEvents(snap.exists() ? ((snap.data().events as IcsEvent[]) ?? []) : null),
        () => setEvents(null),
      ),
    [owner],
  )
  return events
}
