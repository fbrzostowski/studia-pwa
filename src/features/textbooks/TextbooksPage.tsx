import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref } from 'firebase/storage'
import { db, functions, storage } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { plural } from '../../lib/plural'
import AddSubjectForm from '../materials/AddSubjectForm'
import AddTextbookForm from './AddTextbookForm'
import AddTextbookSubject, { type FolderRef } from './AddTextbookSubject'
import { useSubjects } from '../materials/useSubjects'
import { groupTextbooks, norm, subFolder, topFolder } from './group'

interface Textbook {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  folder: string
  storagePath: string
  uploadedBy?: string
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


export default function TextbooksPage() {
  const { user, profile } = useAuth()
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
    () =>
      onSnapshot(
        collection(db, 'textbookFolders'),
        (snap) => setFolders(snap.docs.map((d) => ({ id: d.id, name: d.get('name') as string }))),
        () => setFolders([]),
      ),
    [],
  )
  useEffect(
    () => onSnapshot(doc(db, 'meta', 'textbooksSync'), (s) => setSync(s.exists() ? (s.data() as SyncState) : null), () => {}),
    [],
  )

  const { subjects } = useSubjects()
  // folder: nowy przedmiot z folderem na Drive; subject: sam przedmiot dla folderu, który już jest na Drive
  const [adding, setAdding] = useState<{ mode: 'folder' | 'subject'; name: string } | null>(null)
  const [folders, setFolders] = useState<FolderRef[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState<{ subject?: string } | null>(null)

  // Dział na przedmioty: pierwszy człon folderu na Drive = nazwa przedmiotu w aplikacji.
  const grouped = useMemo(() => {
    const needle = norm(q)
    const found = (books ?? []).filter((b) => !needle || norm(`${b.title} ${b.folder}`).includes(needle))
    return { ...groupTextbooks(found, subjects), searching: !!needle }
  }, [books, subjects, q])

  // podfoldery już używane w danym przedmiocie (podpowiedzi w formularzu wgrywania)
  const subfoldersOf = useCallback(
    (key: string) =>
      [
        ...new Set(
          (books ?? [])
            .filter((b) => norm(topFolder(b.folder)) === key)
            .map((b) => subFolder(b.folder))
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, 'pl')),
    [books],
  )

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

  const remove = async (b: Textbook) => {
    if (!confirm(`Usunąć „${b.title}”? Plik trafi do kosza na Dysku Google i zniknie z aplikacji.`)) return
    setError(null)
    try {
      await httpsCallable(functions, 'removeTextbook')({ id: b.id })
    } catch (e) {
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
  const folderKeys = useMemo(() => new Set(folders.map((f) => norm(f.name))), [folders])
  const { sections, general, unmatched, searching } = grouped
  const withBooks = sections.filter((sec) => sec.books.length > 0)
  const withoutBooks = sections.filter((sec) => sec.books.length === 0)
  const nothingFound = searching && withBooks.length === 0 && general.length === 0 && unmatched.length === 0

  // Pliki jednego przedmiotu: najpierw z folderu głównego, potem po podfolderach (np. „Prezentacje”).
  const renderBooks = (list: Textbook[]) => {
    const bySub = new Map<string, Textbook[]>()
    for (const b of list) bySub.set(subFolder(b.folder), [...(bySub.get(subFolder(b.folder)) ?? []), b])
    return [...bySub.entries()]
      .sort(([x], [y]) => (x === '' ? -1 : y === '' ? 1 : x.localeCompare(y, 'pl')))
      .map(([sub, items]) => (
        <div key={sub || '_'} className="mt-2">
          {sub && <p className="text-muted mb-1.5 text-xs font-medium">{sub}</p>}
          <ul className="grid gap-2 sm:grid-cols-2">
            {items.map((b) => (
              <li key={b.id}>
                <BookCard book={b} canDelete={isAdmin || b.uploadedBy === user!.uid} onOpen={open} onDelete={remove} />
              </li>
            ))}
          </ul>
        </div>
      ))
  }

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <h2 className="text-xl font-semibold tracking-tight">Podręczniki</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          onClick={() => setUploading(uploading ? null : {})}
          aria-expanded={!!uploading}
          disabled={grouped.sections.length === 0}
        >
          Dodaj podręcznik
        </button>
        <button
          className="btn-secondary"
          onClick={() => setAdding(adding ? null : { mode: 'folder', name: '' })}
          aria-expanded={!!adding}
        >
          + Przedmiot
        </button>
        {isAdmin && (
          <button
            className="btn-ghost ml-auto px-2.5"
            disabled={busy}
            onClick={runSync}
            aria-label="Synchronizuj z Drive"
            title="Synchronizuj z Drive"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5" />
            </svg>
          </button>
        )}
      </div>

      {uploading && (
        <AddTextbookForm
          key={uploading.subject ?? 'any'}
          subjects={grouped.sections.map((sec) => ({ key: sec.key, name: sec.name }))}
          subfolders={subfoldersOf}
          initialSubject={uploading.subject}
          onDone={(res) => {
            setUploading(null)
            if (res) setNotice(`Dodano „${res.title}” do folderu „${res.folder}” na Dysku Google.`)
          }}
        />
      )}

      {adding?.mode === 'folder' && (
        <AddTextbookSubject
          key="folder"
          initialName={adding.name}
          folders={folders}
          onDone={(created) => {
            setAdding(null)
            if (created) {
              setNotice(
                created.created
                  ? `Utworzono folder „${created.name}” na Google Drive. Dodaj do niego podręczniki przyciskiem „Dodaj podręcznik”.`
                  : `Folder „${created.name}” już istnieje na Google Drive.`,
              )
            }
          }}
        />
      )}
      {adding?.mode === 'subject' && (
        <AddSubjectForm key={adding.name} initialName={adding.name} onDone={() => setAdding(null)} />
      )}

      {notice && (
        <p className="bg-accent-soft text-accent mt-2 flex items-start justify-between gap-3 rounded-xl p-3 text-sm">
          <span>{notice}</span>
          <button className="shrink-0 underline" onClick={() => setNotice(null)}>
            Zamknij
          </button>
        </p>
      )}

      {isAdmin && sync?.lastRunAt && (
        <p className="text-muted mt-2 text-xs">
          Ostatnia synchronizacja {sync.lastRunAt.toDate().toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}
          {sync.trigger === 'schedule' ? ' (automatyczna)' : ''}: +{sync.added} nowe, {sync.updated} zaktualizowane,{' '}
          {sync.removed} usunięte
          {sync.skipped.length > 0 && `, pominięte: ${sync.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`}
        </p>
      )}

      {books === null ? (
        <p className="text-muted mt-4">Ładowanie…</p>
      ) : (
        <>
          {total > 0 && (
            <input
              type="search"
              className="input mt-4"
              placeholder={`Szukaj w ${total} ${plural(total, 'pliku', 'plikach', 'plikach')}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          )}

          {total === 0 && (
            <div className="border-line mt-4 rounded-2xl border border-dashed p-8 text-center">
              <p className="font-medium">Brak podręczników</p>
              <p className="text-muted mx-auto mt-1 max-w-sm text-sm">
                {isAdmin
                  ? 'Dodaj pierwszy plik przyciskiem „Dodaj podręcznik”. Trafi do folderu przedmiotu na Dysku Google.'
                  : 'Nikt jeszcze nie dodał podręczników. Zrób to przyciskiem „Dodaj podręcznik”.'}
              </p>
            </div>
          )}

          {nothingFound && <p className="text-muted mt-4 text-sm">Nic nie pasuje do „{q}”.</p>}

          <div className="mt-5 space-y-6">
            {withBooks.map((sec) => (
              <section key={sec.key}>
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  {sec.name}
                  {[...new Set(sec.subjects.map((s) => s.kind))].map((k) => (
                    <span key={k} className="badge bg-accent-soft text-accent">
                      {k}
                    </span>
                  ))}
                  <span className="text-muted text-xs font-normal">
                    {sec.books.length} {plural(sec.books.length, 'plik', 'pliki', 'plików')}
                  </span>
                  <button className="text-accent ml-auto text-xs font-medium" onClick={() => setUploading({ subject: sec.name })}>
                    + Dodaj plik
                  </button>
                </h3>
                {renderBooks(sec.books)}
              </section>
            ))}

            {unmatched.map((u) => (
              <section key={u.folder}>
                <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                  {u.folder}
                  <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    brak przedmiotu
                  </span>
                  <button
                    className="text-accent text-xs font-medium"
                    onClick={() => setAdding({ mode: 'subject', name: u.folder })}
                  >
                    Utwórz przedmiot „{u.folder}”
                  </button>
                </h3>
                {renderBooks(u.books)}
              </section>
            ))}

            {general.length > 0 && (
              <section>
                <h3 className="text-muted font-semibold">Ogólne</h3>
                {renderBooks(general)}
              </section>
            )}
          </div>

          {!searching && withoutBooks.length > 0 && (
            <div className="text-muted mt-6 space-y-1 text-xs">
              {withoutBooks.some((sec) => folderKeys.has(sec.key)) && (
                <p>
                  Foldery czekają na pliki:{' '}
                  {withoutBooks.filter((sec) => folderKeys.has(sec.key)).map((sec) => sec.name).join(', ')}.
                </p>
              )}
              {withoutBooks.some((sec) => !folderKeys.has(sec.key)) && (
                <p>
                  Bez folderu na Drive:{' '}
                  {withoutBooks.filter((sec) => !folderKeys.has(sec.key)).map((sec) => sec.name).join(', ')}. Dodasz go
                  przyciskiem „+ Przedmiot”.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BookCard({
  book: b,
  canDelete,
  onOpen,
  onDelete,
}: {
  book: Textbook
  canDelete: boolean
  onOpen: (b: Textbook) => void
  onDelete: (b: Textbook) => void
}) {
  const [, label, style] = kindOf(b.mimeType)
  return (
    <div className="card hover:bg-accent-soft flex h-full items-start">
      <button className="min-w-0 flex-1 p-3.5 text-left" onClick={() => onOpen(b)}>
        <p className="font-medium break-words">{b.title}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={`badge ${style}`}>{label}</span>
          {b.size > 0 && <span className="text-muted text-xs">{fmtSize(b.size)}</span>}
        </p>
      </button>
      {canDelete && (
        <button className="btn-danger mt-2 mr-1 shrink-0" onClick={() => onDelete(b)} aria-label={`Usuń podręcznik: ${b.title}`}>
          Usuń
        </button>
      )}
    </div>
  )
}
