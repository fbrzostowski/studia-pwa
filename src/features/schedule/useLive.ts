import { useEffect, useMemo, useState } from 'react'
import { findSubjectForEvent } from './match'
import { ongoingEvents } from './now'
import { usePlanEvents } from './usePlan'
import { toLocalIso } from './weeks'
import type { Subject } from '../materials/types'

export interface LiveLesson {
  form: string
  start: string
  end: string
  room?: string
}

/** Przedmioty, których lekcja z planu (Twojego albo osoby `uid`) trwa właśnie teraz (id przedmiotu → lekcja). Odświeża się co pół minuty. */
export function useLiveSubjects(subjects: Subject[], uid?: string) {
  const events = usePlanEvents(uid)
  const [now, setNow] = useState(() => toLocalIso(new Date()))
  useEffect(() => {
    const t = setInterval(() => setNow(toLocalIso(new Date())), 30_000)
    return () => clearInterval(t)
  }, [])
  return useMemo(() => {
    const m = new Map<string, LiveLesson>()
    for (const e of ongoingEvents(events ?? [], now)) {
      const s = findSubjectForEvent(subjects, e)
      if (s && !m.has(s.id)) m.set(s.id, { form: e.form, start: e.start, end: e.end, room: e.room })
    }
    return m
  }, [events, subjects, now])
}
