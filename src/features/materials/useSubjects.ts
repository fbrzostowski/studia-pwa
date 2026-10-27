import { useEffect, useState } from 'react'
import { collection, deleteField, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { SUBJECT_KINDS, type Subject } from './types'

/** Wspólna lista przedmiotów (na żywo), posortowana po nazwie i rodzaju zajęć. */
export function useSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'subjects'),
        (snap) =>
          setSubjects(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Subject, 'id'>) }))
              .sort(
                (a, b) =>
                  a.name.localeCompare(b.name, 'pl') ||
                  SUBJECT_KINDS.indexOf(a.kind) - SUBJECT_KINDS.indexOf(b.kind),
              ),
          ),
        (e) => setError(e.message),
      ),
    [],
  )

  return { subjects, error }
}

/** Ustawia (albo, dla null, usuwa) wspólną emotkę przedmiotu; reguły pozwalają na to każdemu zatwierdzonemu. */
export const setSubjectEmoji = (subjectId: string, emoji: string | null) =>
  updateDoc(doc(db, 'subjects', subjectId), { emoji: emoji ?? deleteField() })
