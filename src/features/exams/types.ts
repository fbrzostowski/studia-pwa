import type { Timestamp } from 'firebase/firestore'

export type ExamType = 'MID' | 'FIN'

export const EXAM_LABEL: Record<ExamType, string> = { MID: 'Mid-term', FIN: 'Final exam' }
export const EXAM_TYPES: ExamType[] = ['MID', 'FIN']

export const EXAM_STYLE: Record<ExamType, string> = {
  MID: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  FIN: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
}

/** Wspólny termin zaliczenia przedmiotu (widoczny dla wszystkich zatwierdzonych). */
export interface Exam {
  id: string
  subjectId: string
  type: ExamType
  date: string // YYYY-MM-DD
  time?: string // HH:mm
  room?: string
  note?: string
  createdBy: string
  createdByName?: string
  createdAt?: Timestamp
}
