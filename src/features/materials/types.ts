import type { Timestamp } from 'firebase/firestore'

export interface Subject {
  id: string
  name: string
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
  createdAt?: Timestamp
}

export const TYPE_LABEL: Record<MaterialType, string> = {
  note: 'Notatka',
  slide: 'Plik / slajd',
  link: 'Link',
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
