import { useState, type FormEvent } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { MAX_FILE_BYTES, TYPE_LABEL, type MaterialType } from './types'

export default function MaterialForm({ subjectId, onDone }: { subjectId: string; onDone: () => void }) {
  const { user, profile } = useAuth()
  const [type, setType] = useState<MaterialType>('note')
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
        ownerName: profile?.displayName ?? '',
        createdAt: serverTimestamp(),
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
    <form onSubmit={submit} className="mt-3 space-y-3 rounded border p-3">
      <div className="flex gap-2">
        {(Object.keys(TYPE_LABEL) as MaterialType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded border px-3 py-1 text-sm ${type === t ? 'bg-indigo-600 text-white' : ''}`}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <input
        required
        className="w-full rounded border p-2"
        placeholder="Tytuł"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {type === 'note' && (
        <textarea
          required
          rows={5}
          className="w-full rounded border p-2"
          placeholder="Treść notatki"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
      {type === 'link' && (
        <input
          required
          className="w-full rounded border p-2"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      )}
      {type === 'slide' && <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">
          {busy ? 'Zapisuję…' : 'Dodaj'}
        </button>
        <button type="button" className="rounded border px-4 py-2" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
