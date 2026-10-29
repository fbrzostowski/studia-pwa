import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { visibleTo } from './groups'
import type { Exam } from './types'

/** Terminy zaliczeń widoczne dla Ciebie (bez cudzych „tylko dla autora”); kolekcja jest mała, sortowanie robi logika widoku. */
export function useExams() {
  const { user } = useAuth()
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
  return { exams: exams.filter((e) => visibleTo(e, user!.uid)), error }
}
