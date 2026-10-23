import type { Timestamp } from 'firebase/firestore'

export const SUBJECT_KINDS = ['WYK', 'LAB', 'KON', 'CW', 'WYK+CW', 'KON+CW'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

export const KIND_LABEL: Record<SubjectKind, string> = {
  WYK: 'Wykład',
  LAB: 'Laboratorium',
  KON: 'Konwersatorium',
  CW: 'Ćwiczenia',
  'WYK+CW': 'Wykład + ćwiczenia',
  'KON+CW': 'Konwersatorium + ćwiczenia',
}

export interface Subject {
  id: string
  name: string
  kind: SubjectKind
  usosCode?: string // Sygnatura z USOS (import planu), do wykrywania duplikatów
  createdBy: string
}

export type MaterialType = 'note' | 'slide' | 'link'

export interface Material {
  id: string
  subjectId: string
  title: string
  type: MaterialType
  content?: string // notatka
  url?: string // link
  storagePath?: string // slajd / plik
  fileName?: string
  ownerId: string
  ownerName: string
  // podpięcie do konkretnej lekcji z planu (opcjonalne)
  lessonDate?: string // YYYY-MM-DD
  lessonForm?: string
  lessonGroup?: string
  createdAt?: Timestamp
}

export const TYPE_LABEL: Record<MaterialType, string> = {
  note: 'Notatka',
  slide: 'Plik / slajd',
  link: 'Link',
}

export const TYPE_STYLE: Record<MaterialType, string> = {
  note: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  slide: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  link: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
