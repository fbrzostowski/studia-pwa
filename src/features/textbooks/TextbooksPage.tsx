import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, type Timestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getDownloadURL, ref } from 'firebase/storage'
import { db, functions, storage } from '../../firebase/config'
import Sheet from '../../components/Sheet'
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
  createdAt?: Timestamp
}

interface Tile {
  key: string
  name: string
  kinds: string[]
  books: Textbook[]
  type: 'subject' | 'unmatched' | 'general'
}

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
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
  const [q, setQ] = useState('')
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

  const { subjects } = useSubjects()
  // folder: nowy przedmiot z folderem w podręcznikach; subject: sam przedmiot dla folderu, który już ma pliki
  const [adding, setAdding] = useState<{ mode: 'folder' | 'subject'; name: string } | null>(null)
  const [folders, setFolders] = useState<FolderRef[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [uploading, setUploading] = useState<{ subject?: string } | null>(null)
  const [openKey, setOpenKey] = useState<string | null>(null) // otwarty folder przedmiotu

  // Dział na przedmioty: pierwszy człon folderu = nazwa przedmiotu w aplikacji.
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
    if (!confirm(`Usunąć „${b.title}”? Plik zniknie z aplikacji.`)) return
    setError(null)
    try {
      await httpsCallable(functions, 'removeTextbook')({ id: b.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const total = books?.length ?? 0
  const folderKeys = useMemo(() => new Set(folders.map((f) => norm(f.name))), [folders])
  const { sections, general, unmatched, searching } = grouped
  // do dodania podręcznika nadają się tylko przedmioty, które mają już swój folder
  const withFolder = sections.filter((sec) => folderKeys.has(sec.key))
  const withBooks = sections.filter((sec) => sec.books.length > 0)
  const withoutBooks = sections.filter((sec) => sec.books.length === 0)
  const nothingFound = searching && withBooks.length === 0 && general.length === 0 && unmatched.length === 0

  // Kafelki-foldery: przedmioty z folderem lub z plikami, foldery bez przedmiotu i „Ogólne”.
  const tiles: Tile[] = [
    ...sections
      .filter((sec) => folderKeys.has(sec.key) || sec.books.length > 0)
      .map((sec) => ({
        key: sec.key,
        name: sec.name,
        kinds: [...new Set(sec.subjects.map((s) => s.kind))],
        books: sec.books,
        type: 'subject' as const,
      })),
    ...unmatched.map((u) => ({ key: `u:${norm(u.folder)}`, name: u.folder, kinds: [], books: u.books, type: 'unmatched' as const })),
    ...(general.length > 0 ? [{ key: 'general', name: 'Ogólne', kinds: [], books: general, type: 'general' as const }] : []),
  ]
  const openTile = openKey ? tiles.find((t) => t.key === openKey) : undefined

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
          disabled={withFolder.length === 0}
          title={withFolder.length === 0 ? 'Najpierw utwórz folder przedmiotu przyciskiem „+ Przedmiot”' : undefined}
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
      </div>

      {withFolder.length === 0 && grouped.sections.length > 0 && (
        <p className="text-muted mt-2 text-xs">
          Żaden przedmiot nie ma jeszcze folderu — utwórz go przyciskiem „+ Przedmiot”, a potem dodasz do niego podręczniki.
        </p>
      )}

      <Sheet open={!!uploading} title="Dodaj podręcznik" onClose={() => setUploading(null)}>
        {uploading && (
          <AddTextbookForm
            key={uploading.subject ?? 'any'}
            subjects={withFolder.map((sec) => ({ key: sec.key, name: sec.name }))}
            subfolders={subfoldersOf}
            initialSubject={uploading.subject}
            onDone={(res) => {
              setUploading(null)
              if (res) setNotice(`Dodano „${res.title}” do „${res.folder}”.`)
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding?.mode === 'folder'} title="Dodaj przedmiot do podręczników" onClose={() => setAdding(null)}>
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
                      ? `Dodano przedmiot „${created.name}” do podręczników. Dodaj do niego podręczniki przyciskiem „Dodaj podręcznik”.`
                      : `Przedmiot „${created.name}” ma już folder w podręcznikach.`,
                  )
                }
              }}
            />
        )}
      </Sheet>
      <Sheet open={adding?.mode === 'subject'} title="Nowy przedmiot" onClose={() => setAdding(null)}>
        {adding?.mode === 'subject' && (
          <AddSubjectForm key={adding.name} initialName={adding.name} onDone={() => setAdding(null)} />
        )}
      </Sheet>

      {notice && (
        <p className="bg-accent-soft text-accent mt-2 flex items-start justify-between gap-3 rounded-xl p-3 text-sm">
          <span>{notice}</span>
          <button className="shrink-0 underline" onClick={() => setNotice(null)}>
            Zamknij
          </button>
        </p>
      )}

      {books === null ? (
        <p className="text-muted mt-4">Ładowanie…</p>
      ) : openTile ? (
        <section className="mt-4">
          <button className="btn-ghost -ml-3 gap-1" onClick={() => setOpenKey(null)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Podręczniki
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <FolderIcon className="text-accent h-7 w-7 shrink-0" />
            <h3 className="min-w-0 text-xl font-semibold tracking-tight break-words">{openTile.name}</h3>
            {openTile.kinds.map((k) => (
              <span key={k} className="badge bg-accent-soft text-accent">
                {k}
              </span>
            ))}
          </div>
          <p className="text-muted mt-1 text-sm">
            {openTile.books.length === 0
              ? 'Brak plików'
              : `${openTile.books.length} ${plural(openTile.books.length, 'plik', 'pliki', 'plików')}`}
          </p>

          <div className="mt-3">
            {openTile.type === 'subject' && (
              <button className="btn-primary" onClick={() => setUploading({ subject: openTile.name })} disabled={!folderKeys.has(openTile.key)}>
                Dodaj plik
              </button>
            )}
            {openTile.type === 'unmatched' && (
              <>
                <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">brak przedmiotu</span>
                <button className="text-accent ml-2 text-sm font-medium" onClick={() => setAdding({ mode: 'subject', name: openTile.name })}>
                  Utwórz przedmiot „{openTile.name}”
                </button>
              </>
            )}
          </div>

          {openTile.books.length === 0 ? (
            <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
              Ten folder jest jeszcze pusty. Dodaj pierwszy plik przyciskiem „Dodaj plik”.
            </p>
          ) : (
            renderBooks(openTile.books)
          )}
        </section>
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

          {total === 0 && tiles.length === 0 && (
            <div className="border-line mt-4 rounded-2xl border border-dashed p-8 text-center">
              <p className="font-medium">Brak podręczników</p>
              <p className="text-muted mx-auto mt-1 max-w-sm text-sm">
                Zacznij od przycisku „+ Przedmiot”, a potem dodaj pierwszy plik przyciskiem „Dodaj podręcznik”.
              </p>
            </div>
          )}

          {nothingFound && <p className="text-muted mt-4 text-sm">Nic nie pasuje do „{q}”.</p>}

          {searching ? (
            // wyniki wyszukiwania: pliki pogrupowane po przedmiotach, z przejściem do folderu
            <div className="mt-5 space-y-6">
              {tiles
                .filter((t) => t.books.length > 0)
                .map((t) => (
                  <section key={t.key}>
                    <h3 className="flex flex-wrap items-center gap-2 font-semibold">
                      {t.name}
                      <span className="text-muted text-xs font-normal">
                        {t.books.length} {plural(t.books.length, 'plik', 'pliki', 'plików')}
                      </span>
                      <button className="text-accent ml-auto text-xs font-medium" onClick={() => { setQ(''); setOpenKey(t.key) }}>
                        Otwórz folder
                      </button>
                    </h3>
                    {renderBooks(t.books)}
                  </section>
                ))}
            </div>
          ) : (
            tiles.length > 0 && (
              <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Przedmioty">
                {tiles.map((t) => (
                  <li key={t.key}>
                    <button
                      className="card hover:bg-accent-soft flex min-h-32 w-full flex-col items-start gap-2 p-4 text-left"
                      onClick={() => setOpenKey(t.key)}
                    >
                      <FolderIcon className="text-accent h-9 w-9" />
                      <span className="line-clamp-3 font-semibold break-words">{t.name}</span>
                      <span className="text-muted mt-auto flex flex-wrap items-center gap-1.5 text-xs">
                        {t.books.length === 0
                          ? 'Brak plików'
                          : `${t.books.length} ${plural(t.books.length, 'plik', 'pliki', 'plików')}`}
                        {t.type === 'unmatched' && (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">brak przedmiotu</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          {!searching && withoutBooks.some((sec) => !folderKeys.has(sec.key)) && (
            <p className="text-muted mt-6 text-xs">
              Bez folderu:{' '}
              {withoutBooks.filter((sec) => !folderKeys.has(sec.key)).map((sec) => sec.name).join(', ')}. Dodasz go
              przyciskiem „+ Przedmiot”.
            </p>
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
