import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import FileViewer from './FileViewer'
import PageHandoff from './PageHandoff'
import { opensInTab } from './viewer'
import { mimeFor } from './upload'

type Spec = { kind: 'textbook' | 'material'; id: string }
type Loaded = { storagePath: string; title: string; mimeType: string; fileName?: string; usesStorage?: boolean }

/** Plik z adresu `?open=textbook:ID` albo `?open=material:ID` (linki z Claude/ChatGPT): otwiera się po zalogowaniu. */
export const linkedFileFromUrl = (search: string): Spec | null => {
  const m = new URLSearchParams(search).get('open')?.match(/^(textbook|material):([A-Za-z0-9]{10,40})$/)
  return m ? { kind: m[1] as Spec['kind'], id: m[2]! } : null
}

export default function LinkedFile({ spec, onClose }: { spec: Spec; onClose: () => void }) {
  const [file, setFile] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    getDoc(doc(db, spec.kind === 'textbook' ? 'textbooks' : 'materials', spec.id))
      .then((snap) => {
        const path = snap.get('storagePath')
        if (!snap.exists() || typeof path !== 'string' || !path) throw new Error('Nie ma takiego pliku.')
        const fileName = snap.get('fileName') as string | undefined
        if (live) setFile({ storagePath: path, title: String(snap.get('title') ?? fileName ?? 'Plik'), fileName, mimeType: String(snap.get('mimeType') ?? mimeFor(fileName ?? '')), usesStorage: snap.get('usesStorage') as boolean | undefined })
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [spec])

  // strona HTML z localStorage: ta sama karta przechodzi na jej stały link (bez kliknięcia nowej karty przeglądarka by nie otworzyła)
  if (file && opensInTab(file.mimeType, file.usesStorage))
    return (
      <div className="bg-bg fixed inset-0 z-50 flex flex-col items-center justify-center p-6">
        <PageHandoff spec={spec} />
      </div>
    )
  if (file) return <FileViewer storagePath={file.storagePath} title={file.title} mimeType={file.mimeType} fileName={file.fileName} onClose={onClose} />
  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-6">
      {error ? <p className="text-danger text-sm">{error}</p> : <p className="text-muted text-sm">Ładowanie pliku…</p>}
      {error && (
        <button className="btn-secondary" onClick={onClose}>
          Zamknij
        </button>
      )}
    </div>
  )
}
