import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref } from 'firebase/storage'
import { db, functions, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { plural } from '../../lib/plural'

interface Textbook {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  folder: string
  storagePath: string
  lastSyncedAt?: Timestamp
}

interface SyncState {
  added: number
  updated: number
  removed: number
  unchanged: number
  skipped: { name: string; reason: string }[]
  lastRunAt?: Timestamp
  trigger?: 'manual' | 'schedule'
}

const KIND: [RegExp, string, string][] = [
  [/pdf/, 'PDF', 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'],
  [/presentation|powerpoint/, 'Prezentacja', 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300'],
  [/word|document/, 'Dokument', 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300'],
  [/sheet|excel/, 'Arkusz', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'],
  [/image/, 'Obraz', 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'],
]
const kindOf = (mime: string) =>
  KIND.find(([re]) => re.test(mime)) ?? [null, 'Plik', 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300']

const fmtSize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} kB`

const norm = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '')

export default function TextbooksPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [books, setBooks] = useState<Textbook[] | null>(null)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'textbooks'),
        (snap) => setBooks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Textbook, 'id'>) }))),
        (e) => {
          setError(e.message)
          setBooks([])
        },
      ),
    [],
  )
  useEffect(
    () => onSnapshot(doc(db, 'meta', 'textbooksSync'), (s) => setSync(s.exists() ? (s.data() as SyncState) : null), () => {}),
    [],
  )

  // Grupy według podfolderu na Drive, w każdej alfabetycznie; wyszukiwanie bez polskich znaków.
  const groups = useMemo(() => {
    const needle = norm(q.trim())
    const m = new Map<string, Textbook[]>()
    for (const b of books ?? []) {
      if (needle && !norm(`${b.title} ${b.folder}`).includes(needle)) continue
      m.set(b.folder, [...(m.get(b.folder) ?? []), b])
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'pl')))
      .map(([folder, list]) => [folder, list.sort((x, y) => x.title.localeCompare(y.title, 'pl'))] as const)
  }, [books, q])

  const open = async (b: Textbook) => {
    // okno otwieramy od razu (w geście użytkownika), bo Safari blokuje window.open po await
    const w = window.open('', '_blank')
    try {
      const url = await getDownloadURL(ref(storage, b.storagePath))
      if (w) w.location.href = url
      else window.location.href = url
    } catch (e) {
      w?.close()
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const runSync = async () => {
    setBusy(true)
    setError(null)
    try {
      await httpsCallable(functions, 'syncTextbooks', { timeout: 540_000 })()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const total = books?.length ?? 0

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Podręczniki i prezentacje</h2>
        {isAdmin && (
          <button className="btn-secondary" disabled={busy} onClick={runSync}>
            {busy ? 'Synchronizuję…' : 'Synchronizuj z Drive'}
          </button>
        )}
      </div>

      {isAdmin && sync?.lastRunAt && (
        <p className="text-muted mt-1 text-xs">
          Ostatnia synchronizacja {sync.lastRunAt.toDate().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
          {sync.trigger === 'schedule' ? ' (automatyczna)' : ''}: +{sync.added} nowe, {sync.updated} zaktualizowane,{' '}
          {sync.removed} usunięte
          {sync.skipped.length > 0 && `, pominięte: ${sync.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`}
        </p>
      )}

      {books === null ? (
        <p className="text-muted mt-4">Ładowanie…</p>
      ) : total === 0 ? (
        <div className="border-line mt-4 rounded-2xl border border-dashed p-8 text-center">
          <p className="font-medium">Brak podręczników</p>
          <p className="text-muted mx-auto mt-1 max-w-sm text-sm">
            {isAdmin
              ? 'Wrzuć pliki do folderu na Google Drive i kliknij „Synchronizuj z Drive” (albo poczekaj na nocną synchronizację).'
              : 'Administrator jeszcze nie dodał podręczników.'}
          </p>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="input mt-4"
            placeholder={`Szukaj w ${total} ${plural(total, 'pliku', 'plikach', 'plikach')}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {groups.length === 0 && <p className="text-muted mt-4 text-sm">Nic nie pasuje do „{q}”.</p>}

          <div className="mt-4 space-y-6">
            {groups.map(([folder, list]) => (
              <section key={folder || '_'}>
                {folder && (
                  <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">{folder}</h3>
                )}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {list.map((b) => {
                    const [, label, style] = kindOf(b.mimeType)
                    return (
                      <li key={b.id}>
                        <button
                          className="card hover:bg-accent-soft flex h-full w-full items-start gap-3 p-3.5 text-left"
                          onClick={() => open(b)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium break-words">{b.title}</p>
                            <p className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className={`badge ${style}`}>{label}</span>
                              {b.size > 0 && <span className="text-muted text-xs">{fmtSize(b.size)}</span>}
                            </p>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
