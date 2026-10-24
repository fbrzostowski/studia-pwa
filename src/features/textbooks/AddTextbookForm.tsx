import { useMemo, useState, type FormEvent } from 'react'
import { httpsCallable } from 'firebase/functions'
import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage'
import { functions, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { uploadErrorMessage } from '../../lib/errors'
import { ACCEPT, checkFile, tempName, titleFromFile } from './upload'

export interface SubjectOption {
  key: string
  name: string
}

/**
 * Wgrywanie podręcznika z komputera lub telefonu. Plik trafia najpierw do Storage, a funkcja addTextbook
 * przenosi go do folderu przedmiotu na Google Drive (nikt nie ma bezpośredniego dostępu do Dysku).
 */
export default function AddTextbookForm({
  subjects,
  subfolders,
  initialSubject,
  onDone,
}: {
  subjects: SubjectOption[]
  subfolders: (subjectKey: string) => string[]
  initialSubject?: string
  onDone: (result?: { title: string; folder: string }) => void
}) {
  const { user } = useAuth()
  const [subjectKey, setSubjectKey] = useState(
    subjects.find((s) => s.name === initialSubject)?.key ?? subjects[0]?.key ?? '',
  )
  const [subfolder, setSubfolder] = useState('')
  const [title, setTitle] = useState('')
  const [autoTitle, setAutoTitle] = useState('') // tytuł podpowiedziany z nazwy pliku (do rozpoznania ręcznej zmiany)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<number | null>(null) // 0–100 podczas wysyłania
  const [phase, setPhase] = useState<'idle' | 'upload' | 'drive'>('idle')
  const [error, setError] = useState<string | null>(null)

  const subject = subjects.find((s) => s.key === subjectKey)
  const suggestions = useMemo(() => subfolders(subjectKey), [subfolders, subjectKey])
  const busy = phase !== 'idle'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !subject) return
    const problem = checkFile(file)
    if (problem) return setError(problem)

    setError(null)
    const path = `uploads/${user!.uid}/${tempName(file.name)}`
    try {
      setPhase('upload')
      setProgress(0)
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), file)
        task.on(
          'state_changed',
          (s) => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
          reject,
          () => resolve(),
        )
      })

      setPhase('drive')
      const res = await httpsCallable<
        { uploadPath: string; subject: string; subfolder: string; title: string },
        { title: string; folder: string }
      >(functions, 'addTextbook', { timeout: 540_000 })({
        uploadPath: path,
        subject: subject.name,
        subfolder: subfolder.trim(),
        title: title.trim(),
      })
      onDone(res.data)
    } catch (err) {
      // funkcja sprząta po sobie, ale gdy do niej nie doszło, usuwamy plik tymczasowy sami
      await deleteObject(ref(storage, path)).catch(() => {})
      setError(uploadErrorMessage(err))
      setPhase('idle')
      setProgress(null)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-2 space-y-3 p-3">
      <select
        required
        className="input"
        value={subjectKey}
        onChange={(e) => setSubjectKey(e.target.value)}
        disabled={busy}
        aria-label="Przedmiot"
      >
        {subjects.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>

      <input
        type="file"
        required
        accept={ACCEPT}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          const problem = f ? checkFile(f) : null
          setFile(f)
          setError(problem)
          // tytuł podpowiadamy tylko z poprawnego pliku i tylko dopóki użytkownik nie wpisał własnego
          const suggested = f && !problem ? titleFromFile(f.name) : ''
          if (!title || title === autoTitle) setTitle(suggested)
          setAutoTitle(suggested)
        }}
        className="text-muted file:bg-accent-soft file:text-accent block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3.5 file:py-2 file:text-sm file:font-medium"
      />

      <input
        className="input"
        placeholder="Tytuł (domyślnie nazwa pliku)"
        maxLength={150}
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div>
        <input
          className="input"
          placeholder="Podfolder, np. Prezentacje (opcjonalnie)"
          maxLength={100}
          list="subfolder-suggestions"
          value={subfolder}
          disabled={busy}
          onChange={(e) => setSubfolder(e.target.value)}
        />
        <datalist id="subfolder-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {phase === 'upload' && progress !== null && (
        <div>
          <div
            className="bg-bg h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Wysyłanie pliku"
          >
            <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-muted mt-1 text-xs">Wysyłanie… {progress}%</p>
        </div>
      )}
      {phase === 'drive' && <p className="text-muted text-sm">Zapisuję w folderze przedmiotu na Dysku Google…</p>}
      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex gap-2">
        <button disabled={busy || !file || !subject || !!(file && checkFile(file))} className="btn-primary">
          {busy ? 'Dodaję…' : 'Dodaj podręcznik'}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => onDone()}>
          Anuluj
        </button>
      </div>
    </form>
  )
}
