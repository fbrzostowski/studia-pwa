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
import FileViewer from './FileViewer'
import { canPreview } from './viewer'
import AddTextbookSubject, { type FolderRef } from './AddTextbookSubject'
import { useSubjects } from '../materials/useSubjects'
import { findSubjectForEvent } from '../schedule/match'
import { ongoingEvents } from '../schedule/now'
import { usePlanEvents } from '../schedule/usePlan'
import { toLocalIso } from '../schedule/weeks'
import { groupTextbooks, norm, subFolder, topFolder } from './group'
import SubjectIcon from '../../components/SubjectIcon'
import { SubjectShortcut, useOpenSubjectPage } from '../subject/SubjectPageContext'

interface Textbook {
  id: string
  title: string
  fileName: string
  mimeType: string
  size: number
  folder: string
  storagePath: string
  cover?: string // miniatura JPEG (data URL)
  uploadedBy?: string
  createdAt?: Timestamp
}

interface Live {
  start: string
  end: string
  room?: string
  form: string
}

interface Tile {
  key: string
  name: string
  kinds: string[]
  books: Textbook[]
  type: 'subject' | 'unmatched' | 'general'
  live?: Live // trwa teraz lekcja tego przedmiotu (z planu użytkownika)
  missing?: boolean // przedmiot z lekcji nie ma jeszcze folderu w podręcznikach
}

const KIND: [RegExp, string, string][] = [
  [/html/, 'Strona', 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300'],
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
        (snap) => setFolders(
            snap.docs.map((d) => ({ id: d.id, name: d.get('name') as string, createdBy: d.get('createdBy') as string | undefined })),
          ),
        () => setFolders([]),
      ),
    [],
  )

  const { subjects } = useSubjects()
  // Folder to nazwa przedmiotu (wspólna dla jego form zajęć), więc bierzemy pierwszą ustawioną emotkę z przedmiotów o tej nazwie.
  const openSubjectPage = useOpenSubjectPage()
  const [viewing, setViewing] = useState<Textbook | null>(null)
  const emojiOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of subjects) if (s.emoji && !m.has(norm(s.name))) m.set(norm(s.name), s.emoji)
    return (name: string) => m.get(norm(name))
  }, [subjects])
  // Folder nie ma własnego id: strona przedmiotu otwiera się dla pierwszego przedmiotu o tej nazwie.
  const subjectIdOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of subjects) if (!m.has(norm(s.name))) m.set(norm(s.name), s.id)
    return (name: string) => m.get(norm(name))
  }, [subjects])
  const events = usePlanEvents()
  const [now, setNow] = useState(() => toLocalIso(new Date()))
  useEffect(() => {
    const t = setInterval(() => setNow(toLocalIso(new Date())), 30_000) // „teraz” odświeża się co pół minuty
    return () => clearInterval(t)
  }, [])
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
    if (canPreview(b.mimeType)) return setViewing(b) // PDF, HTML, TXT i obrazy: ramka w aplikacji; reszta (Word itp.) w nowej karcie
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

  const removeFolder = async (id: string, name: string) => {
    if (!confirm(`Usunąć pusty folder „${name}”? Przedmiot zostanie w aplikacji, znika tylko jego folder w podręcznikach.`)) return
    setError(null)
    try {
      await httpsCallable(functions, 'removeTextbookFolder')({ id })
      setOpenKey(null)
    } catch (e) {
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

  // Przedmiot trwającej właśnie lekcji ląduje na początku i jest wyróżniony; bez folderu dostaje własny kafelek.
  const live = useMemo(() => {
    const m = new Map<string, Live & { subjectName: string }>()
    for (const e of ongoingEvents(events ?? [], now)) {
      const subject = findSubjectForEvent(subjects, e)
      if (subject && !m.has(norm(subject.name))) {
        m.set(norm(subject.name), { start: e.start, end: e.end, room: e.room, form: e.form, subjectName: subject.name })
      }
    }
    return m
  }, [events, subjects, now])
  const shownTiles: Tile[] = [
    ...tiles.map((t) => (t.type === 'subject' && live.has(t.key) ? { ...t, live: live.get(t.key) } : t)),
    ...[...live.entries()]
      .filter(([key]) => !tiles.some((t) => t.key === key))
      .map(([key, l]) => ({ key, name: l.subjectName, kinds: [], books: [], type: 'subject' as const, live: l, missing: true })),
  ].sort((a, b) => Number(!!b.live) - Number(!!a.live)) // sort jest stabilny: reszta zostaje alfabetycznie
  const openFolder = openTile?.type === 'subject' ? folders.find((f) => norm(f.name) === openTile.key) : undefined

  // Pliki jednego przedmiotu: najpierw z folderu głównego, potem po podfolderach (np. „Prezentacje”).
  const renderBooks = (list: Textbook[]) => {
    const bySub = new Map<string, Textbook[]>()
    for (const b of list) bySub.set(subFolder(b.folder), [...(bySub.get(subFolder(b.folder)) ?? []), b])
    return [...bySub.entries()]
      .sort(([x], [y]) => (x === '' ? -1 : y === '' ? 1 : x.localeCompare(y, 'pl')))
      .map(([sub, items]) => (
        <div key={sub || '_'} className="mt-2">
          {sub && <p className="text-muted mb-1.5 text-xs font-medium">{sub}</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
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

      {viewing && <FileViewer storagePath={viewing.storagePath} title={viewing.title} mimeType={viewing.mimeType} onClose={() => setViewing(null)} />}

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
            <SubjectIcon emoji={emojiOf(openTile.name)} size={30} />
            <h3 className="min-w-0 text-xl font-semibold tracking-tight break-words">{openTile.name}</h3>
            {openTile.kinds.map((k) => (
              <span key={k} className="badge bg-accent-soft text-accent">
                {k}
              </span>
            ))}
            {openTile.type === 'subject' && subjectIdOf(openTile.name) && (
              <button className="btn-ghost" onClick={() => openSubjectPage(subjectIdOf(openTile.name)!)}>
                Strona przedmiotu
              </button>
            )}
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
            <div className="border-line mt-4 rounded-2xl border border-dashed p-8 text-center">
              <p className="text-muted text-sm">Ten folder jest jeszcze pusty. Dodaj pierwszy plik przyciskiem „Dodaj plik”.</p>
              {openFolder && (isAdmin || openFolder.createdBy === user!.uid) && (
                <button className="btn-danger mt-3" onClick={() => removeFolder(openFolder.id, openFolder.name)}>
                  Usuń folder
                </button>
              )}
            </div>
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
              <ul className="mt-5 grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Przedmioty">
                {shownTiles.map((t) => (
                  <li key={t.key} className="relative">
                    <button
                      className={`card hover:bg-accent-soft flex h-full min-h-32 w-full flex-col items-start gap-2 p-4 text-left ${t.live ? 'ring-accent bg-accent-soft ring-2' : ''}`}
                      onClick={() => (t.missing ? setAdding({ mode: 'folder', name: t.name }) : setOpenKey(t.key))}
                      aria-label={t.live ? `${t.name} — trwa teraz` : undefined}
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <SubjectIcon emoji={emojiOf(t.name)} size={36} />
                        {t.live && <span className="badge bg-accent shrink-0 text-white">Trwa teraz</span>}
                      </span>
                      <span className="line-clamp-3 font-semibold break-words">{t.name}</span>
                      {t.live && (
                        <span className="text-accent text-xs font-medium">
                          {t.live.form} · {t.live.start.slice(11)}–{t.live.end.slice(11)}
                          {t.live.room ? ` · sala ${t.live.room}` : ''}
                        </span>
                      )}
                      <span className="text-muted mt-auto flex flex-wrap items-center gap-1.5 pr-8 text-xs">
                        {t.missing
                          ? 'Brak folderu — dotknij, aby utworzyć'
                          : t.books.length === 0
                            ? 'Brak plików'
                            : `${t.books.length} ${plural(t.books.length, 'plik', 'pliki', 'plików')}`}
                        {t.type === 'unmatched' && (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">brak przedmiotu</span>
                        )}
                      </span>
                    </button>
                    {t.type === 'subject' && <SubjectShortcut id={subjectIdOf(t.name)} name={t.name} />}
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
  const hint = `${b.title} · ${label}${b.size > 0 ? ` · ${fmtSize(b.size)}` : ''}`
  return (
    <div className="relative">
      <button
        className="border-line block aspect-[3/4] w-full overflow-hidden rounded-xl border text-left shadow-sm transition-transform active:scale-[0.98]"
        onClick={() => onOpen(b)}
        aria-label={`Otwórz: ${b.title}`}
        title={hint}
      >
        {b.cover ? (
          <img src={b.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          // Bez okładki tytuł nie jest nigdzie zapisany, więc pokazujemy go na kafelku.
          <span className={`flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center ${style}`}>
            <span className="text-xs font-semibold">{label}</span>
            <span className="text-sm font-medium break-words">{b.title}</span>
          </span>
        )}
      </button>
      {canDelete && (
        <button
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75"
          onClick={() => onDelete(b)}
          aria-label={`Usuń podręcznik: ${b.title}`}
          title="Usuń"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
