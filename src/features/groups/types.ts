import type { Timestamp } from 'firebase/firestore'
import type { ClassInfo } from '../schedule/parseIcs'

/** Kto należy do przedmiotu i do jakich grup zajęciowych (z planu USOS). id = {subjectId}_{uid} */
export interface Membership {
  id: string
  uid: string
  subjectId: string
  username: string
  classes: ClassInfo[]
  updatedAt?: Timestamp
}

/** Wspólne dane grupy zajęciowej, np. prowadzący. id = classKey(subjectId, form, group) */
export interface ClassDoc {
  id: string
  subjectId: string
  form: string
  group: string
  lecturer: string
}
