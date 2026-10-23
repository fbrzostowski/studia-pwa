import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { Exam } from './types'

/** Wszystkie terminy zaliczeń (kolekcja jest mała); sortowanie robi logika widoku. */
export function useExams() {
  const [exams, setExams] = useState<Exam[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'exams'),
        (snap) => setExams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exam, 'id'>) }))),
        (e) => setError(e.message),
      ),
    [],
  )
  return { exams, error }
}
