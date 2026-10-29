import type { Timestamp } from 'firebase/firestore'

export type ExamType = 'MID' | 'FIN' | 'QUIZ'

export const EXAM_LABEL: Record<ExamType, string> = { MID: 'Mid-term', FIN: 'Final exam', QUIZ: 'Quiz' }
export const EXAM_TYPES: ExamType[] = ['MID', 'FIN', 'QUIZ']

export const EXAM_STYLE: Record<ExamType, string> = {
  MID: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  FIN: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300',
  QUIZ: 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300',
}

/** Tło całego dnia w kalendarzu: kolor rodzaju zaliczenia (jasny i ciemny motyw). */
export const EXAM_TINT: Record<ExamType, string> = {
  MID: 'bg-amber-100 border-amber-300 dark:bg-amber-500/20 dark:border-amber-500/40',
  FIN: 'bg-rose-100 border-rose-300 dark:bg-rose-500/20 dark:border-rose-500/40',
  QUIZ: 'bg-teal-100 border-teal-300 dark:bg-teal-500/20 dark:border-teal-500/40',
}

/** Znacznik w kalendarzu i legendzie: kolor + szerokość (ważniejsze zaliczenia są szersze). */
export const EXAM_DOT: Record<ExamType, string> = {
  MID: 'w-1.5 bg-amber-500',
  FIN: 'w-3 bg-rose-500',
  QUIZ: 'w-1.5 bg-teal-500',
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
