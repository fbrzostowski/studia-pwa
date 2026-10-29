import { useState } from 'react'
import { deleteDoc, doc } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { fromDateKey } from '../schedule/weeks'
import { TYPE_LABEL, TYPE_STYLE, type Material } from './types'

/** Karta materiału (notatka, plik, link). `onDetach` pokazuje „Odepnij” przy materiale podpiętym do lekcji. */
export default function MaterialCard({
  m,
  showLesson = true,
  onDetach,
}: {
  m: Material
  showLesson?: boolean
  onDetach?: () => void
}) {
  const { user, profile } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const canEdit = profile?.role === 'admin' || m.ownerId === user!.uid

  const remove = async () => {
    if (!confirm(`Usunąć „${m.title}”?`)) return
    try {
      await deleteDoc(doc(db, 'materials', m.id))
      if (m.storagePath) await deleteObject(ref(storage, m.storagePath)).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const openFile = async () => {
    try {
      window.open(await getDownloadURL(ref(storage, m.storagePath!)), '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="card h-full p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`badge ${TYPE_STYLE[m.type]}`}>{TYPE_LABEL[m.type]}</span>
            {showLesson && m.lessonDate && (
              <span className="badge bg-accent-soft text-accent">
                Lekcja {fromDateKey(m.lessonDate).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                {m.lessonForm ? ` · ${m.lessonForm}` : ''}
              </span>
            )}
          </span>
          <h3 className="mt-1.5 font-medium break-words">{m.title}</h3>
          <p className="text-muted mt-0.5 text-xs">
            {m.ownerName}
            {m.createdAt && ` · ${m.createdAt.toDate().toLocaleDateString('pl-PL')}`}
          </p>
        </div>
        <div className="-mt-1 -mr-2 flex shrink-0 flex-col items-end">
          {onDetach && canEdit && (
            <button className="btn-ghost" onClick={onDetach}>
              Odepnij
            </button>
          )}
          {canEdit && (
            <button className="btn-danger" onClick={remove}>
              Usuń
            </button>
          )}
        </div>
      </div>

      {m.type === 'note' && <p className="mt-3 text-sm whitespace-pre-wrap">{m.content}</p>}
      {m.type === 'link' && (
        <a className="btn-secondary mt-3" href={m.url} target="_blank" rel="noopener noreferrer">
          Otwórz link
        </a>
      )}
      {m.type === 'slide' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-secondary" onClick={openFile}>
            Otwórz plik
          </button>
          {m.fileName && <span className="text-muted min-w-0 truncate text-xs">{m.fileName}</span>}
        </div>
      )}
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </div>
  )
}
