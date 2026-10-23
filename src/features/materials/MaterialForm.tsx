import { useState, type FormEvent } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { shownName, useAuth } from '../../firebase/AuthContext'
import { normGroup } from '../schedule/parseIcs'
import { MAX_FILE_BYTES, TYPE_LABEL, type MaterialType } from './types'

const ALL_TYPES: MaterialType[] = ['note', 'slide', 'link']

/**
 * Dodawanie materiału do przedmiotu. `lesson` podpina go do konkretnej lekcji z planu,
 * a `types` zawęża dostępne rodzaje (np. tylko plik i link, bez pisania notatki).
 */
export default function MaterialForm({
  subjectId,
  lesson,
  types = ALL_TYPES,
  onDone,
}: {
  subjectId: string
  lesson?: { date: string; form: string; group?: string }
  types?: MaterialType[]
  onDone: () => void
}) {
  const { user, profile } = useAuth()
  const [type, setType] = useState<MaterialType>(types[0])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (type === 'slide') {
      if (!file) return setError('Wybierz plik.')
      if (file.size >= MAX_FILE_BYTES) return setError('Plik jest za duży (limit 25 MB).')
    }
    if (type === 'link' && !/^https?:\/\//i.test(url)) return setError('Link musi zaczynać się od http:// lub https://')

    setBusy(true)
    let storagePath: string | undefined
    try {
      const data: Record<string, unknown> = {
        subjectId,
        title: title.trim(),
        type,
        ownerId: user!.uid,
        ownerName: profile ? shownName(profile) : '',
        createdAt: serverTimestamp(),
        ...(lesson ? { lessonDate: lesson.date, lessonForm: lesson.form, lessonGroup: normGroup(lesson.group) } : {}),
      }
      if (type === 'note') data.content = content
      if (type === 'link') data.url = url
      if (type === 'slide' && file) {
        storagePath = `materials/${user!.uid}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`
        await uploadBytes(ref(storage, storagePath), file)
        data.storagePath = storagePath
        data.fileName = file.name
      }
      await addDoc(collection(db, 'materials'), data)
      onDone()
    } catch (err) {
      // nie zostawiaj osieroconego pliku, jeśli zapis dokumentu się nie udał
      if (storagePath) await deleteObject(ref(storage, storagePath)).catch(() => {})
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-4 space-y-3 p-4">
      <div className="bg-bg border-line flex gap-1 rounded-xl border p-1">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className="text-muted aria-pressed:bg-surface aria-pressed:text-text flex-1 rounded-lg px-2 py-1.5 text-sm font-medium aria-pressed:shadow-sm"
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <input
        required
        className="input"
        placeholder="Tytuł"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {type === 'note' && (
        <textarea
          required
          rows={6}
          className="input resize-y"
          placeholder="Treść notatki"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
      {type === 'link' && (
        <input
          required
          inputMode="url"
          className="input"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      {type === 'slide' && (
        <input
          type="file"
          className="text-muted file:bg-accent-soft file:text-accent block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3.5 file:py-2 file:text-sm file:font-medium"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      )}
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="btn-primary flex-1 sm:flex-none">
          {busy ? 'Zapisuję…' : 'Dodaj'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
