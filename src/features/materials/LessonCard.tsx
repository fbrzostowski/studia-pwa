import { useEffect, useState } from 'react'
import { collection, deleteField, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { normGroup, type IcsEvent } from '../schedule/parseIcs'
import MaterialCard from './MaterialCard'
import MaterialForm from './MaterialForm'
import { TYPE_LABEL, TYPE_STYLE, type Material, type Subject } from './types'
import { SubjectLink } from '../subject/SubjectPageContext'

export const FORM_STYLE: Record<string, string> = {
  WYK: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  CW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  KON: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  LAB: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
}
export const FORM_DOT: Record<string, string> = {
  WYK: 'bg-sky-500',
  CW: 'bg-emerald-500',
  KON: 'bg-amber-500',
  LAB: 'bg-violet-500',
}

/** Klucz lekcji, po którym notatki są podpinane: przedmiot + forma + grupa + dzień. */
export const lessonKey = (subjectId: string, form: string, group: string | undefined, date: string) =>
  `${subjectId}|${form}|${normGroup(group)}|${date}`

export const noteLessonKey = (m: Material) =>
  m.lessonDate && m.lessonForm ? lessonKey(m.subjectId, m.lessonForm, m.lessonGroup, m.lessonDate) : null

// Wybór własnego materiału z przedmiotu, który nie jest jeszcze podpięty do żadnej lekcji.
function AttachExisting({
  subject,
  lesson,
  onDone,
}: {
  subject: Subject
  lesson: { date: string; form: string; group?: string }
  onDone: () => void
}) {
  const { user } = useAuth()
  const [items, setItems] = useState<Material[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'materials'), where('subjectId', '==', subject.id)),
        (snap) =>
          setItems(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Material, 'id'>) }))
              .filter((m) => m.ownerId === user!.uid && !m.lessonDate),
          ),
        (e) => setError(e.message),
      ),
    [subject.id, user],
  )

  const attach = async (m: Material) => {
    try {
      await updateDoc(doc(db, 'materials', m.id), {
        lessonDate: lesson.date,
        lessonForm: lesson.form,
        lessonGroup: normGroup(lesson.group),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="card mt-3 space-y-2 p-3">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">Twoje materiały z tego przedmiotu</p>
      {items === null ? (
        <p className="text-muted text-sm">Ładowanie…</p>
      ) : items.length === 0 ? (
        <p className="text-muted text-sm">Nie masz niepodpiętych materiałów w tym przedmiocie.</p>
      ) : (
        <ul className="max-h-60 space-y-1.5 overflow-y-auto">
          {items.map((m) => (
            <li key={m.id}>
              <button
                className="border-line hover:bg-accent-soft flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left"
                onClick={() => attach(m)}
              >
                <span className="min-w-0 break-words">{m.title}</span>
                <span className={`badge shrink-0 ${TYPE_STYLE[m.type]}`}>{TYPE_LABEL[m.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      <button className="btn-ghost" onClick={onDone}>
        Zamknij
      </button>
    </div>
  )
}

/** Lekcja z planu z podpiętymi materiałami: można dodać plik lub link albo podpiąć własny istniejący (notatki pisze się w widoku Przedmioty). */
export default function LessonCard({
  e,
  subject,
  notes,
  onOpenSubject,
}: {
  e: IcsEvent
  subject?: Subject
  notes: Material[]
  onOpenSubject: (id: string) => void
}) {
  const [mode, setMode] = useState<'new' | 'attach' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const date = e.start.slice(0, 10)
  const lesson = { date, form: e.form, group: e.group }

  const detach = async (m: Material) => {
    try {
      await updateDoc(doc(db, 'materials', m.id), {
        lessonDate: deleteField(),
        lessonForm: deleteField(),
        lessonGroup: deleteField(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 text-left text-sm tabular-nums">
          <p className="font-semibold">{e.start.slice(11)}</p>
          <p className="text-muted">{e.end.slice(11)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">
            <SubjectLink id={subject?.id}>{e.name}</SubjectLink>
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`badge ${FORM_STYLE[e.form] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300'}`}>
              {e.form}
            </span>
            {e.room && <span className="text-muted text-xs">Sala {e.room}</span>}
            {e.group && <span className="text-muted text-xs">gr. {e.group}</span>}
          </p>
        </div>
      </div>

      {!subject ? (
        <p className="text-muted mt-3 text-xs">
          Tego przedmiotu nie ma jeszcze w aplikacji — dodaj go w widoku Przedmioty, żeby podpinać notatki.
        </p>
      ) : (
        <div className="border-line mt-3 border-t pt-3">
          {notes.length > 0 && (
            <ul className="mb-3 space-y-2">
              {notes.map((m) => (
                <li key={m.id}>
                  <MaterialCard m={m} showLesson={false} onDetach={() => detach(m)} />
                </li>
              ))}
            </ul>
          )}
          {mode === 'new' && (
            <MaterialForm subjectId={subject.id} lesson={lesson} types={['slide', 'link']} onDone={() => setMode(null)} />
          )}
          {mode === 'attach' && <AttachExisting subject={subject} lesson={lesson} onDone={() => setMode(null)} />}
          {mode === null && (
            <div className="flex flex-wrap items-center gap-1">
              <button className="btn-secondary" onClick={() => setMode('new')}>
                + Plik lub link
              </button>
              <button className="btn-ghost" onClick={() => setMode('attach')}>
                Podepnij notatkę
              </button>
              <button className="btn-ghost ml-auto" onClick={() => onOpenSubject(subject.id)}>
                Przedmiot ›
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </div>
  )
}
