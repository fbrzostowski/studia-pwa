import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'
import Sheet from '../../components/Sheet'
import { useAuth } from '../../firebase/AuthContext'
import SubjectIcon from '../../components/SubjectIcon'
import { useLiveSubjects } from '../schedule/useLive'
import { SubjectShortcut, useOpenSubjectPage } from '../subject/SubjectPageContext'
import { plural } from '../../lib/plural'
import MaterialCard from './MaterialCard'
import MaterialForm from './MaterialForm'
import { useSubjects } from './useSubjects'
import { useMemberships } from '../groups/hooks'
import { groupsOf, myGroups, type Scope } from '../exams/groups'
import GroupFilter from './GroupFilter'
import { filterMaterials } from './filters'
import AddSubjectForm from './AddSubjectForm'
import { KIND_LABEL, type Material } from './types'

export default function SubjectsView({ initialSubjectId = null }: { initialSubjectId?: string | null }) {
  const { user } = useAuth()
  const { subjects, error: subjectsError } = useSubjects()
  const [selected, setSelected] = useState<string | null>(initialSubjectId)
  const [allMaterials, setAllMaterials] = useState<Material[]>([])
  const [adding, setAdding] = useState(false)
  const [addingSubject, setAddingSubject] = useState(false)
  const openSubjectPage = useOpenSubjectPage()
  const memberships = useMemberships()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Scope[] | null>(null) // null = domyślnie moje grupy
  const [localError, setError] = useState<string | null>(null)
  const error = localError ?? subjectsError

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'materials'),
        (snap) =>
          setAllMaterials(
            snap.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Material, 'id'>) }))
              .sort((a, b) => (b.createdAt?.toMillis() ?? Infinity) - (a.createdAt?.toMillis() ?? Infinity)),
          ),
        (e) => setError(e.message),
      ),
    [],
  )
  const materials = useMemo(() => allMaterials.filter((m) => m.subjectId === selected), [allMaterials, selected])
  const counts = useMemo(() => {
    const c = new Map<string, number>()
    for (const m of allMaterials) c.set(m.subjectId, (c.get(m.subjectId) ?? 0) + 1)
    return c
  }, [allMaterials])

  const current = subjects.find((s) => s.id === selected)
  // Grupy przedmiotu (z grup uczestników) i moje; domyślnie pokazujemy materiały mojej grupy, dopóki nie wybiorę inaczej.
  const subjectIds = useMemo(() => new Set(current ? [current.id] : []), [current])
  const groups = useMemo(() => groupsOf(memberships, subjectIds), [memberships, subjectIds])
  const mine = useMemo(() => myGroups(memberships, subjectIds, user!.uid), [memberships, subjectIds, user])
  const selectedGroups = picked ?? mine
  const shown = useMemo(() => filterMaterials(materials, query, selectedGroups), [materials, query, selectedGroups])
  const live = useLiveSubjects(subjects)
  // Przedmiot trwającej lekcji jest pierwszy; sort jest stabilny, więc reszta zostaje alfabetycznie.
  const tiles = useMemo(() => [...subjects].sort((a, b) => Number(live.has(b.id)) - Number(live.has(a.id))), [subjects, live])

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      {!current && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Przedmioty</h2>
            <button className="btn-secondary" onClick={() => setAddingSubject(true)}>
              + Przedmiot
            </button>
          </div>

          {subjects.length === 0 ? (
            <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
              Brak przedmiotów — dodaj pierwszy.
            </p>
          ) : (
            <ul className="mt-4 grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Przedmioty">
              {tiles.map((s) => {
                const n = counts.get(s.id) ?? 0
                const l = live.get(s.id)
                return (
                  <li key={s.id} className="relative">
                    <button
                      className={`card hover:bg-accent-soft flex h-full min-h-32 w-full flex-col items-start gap-2 p-4 text-left ${l ? 'ring-accent bg-accent-soft ring-2' : ''}`}
                      aria-label={l ? `${s.name} — trwa teraz` : undefined}
                      onClick={() => {
                        setSelected(s.id)
                        setAdding(false)
                      }}
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <SubjectIcon emoji={s.emoji} size={36} />
                        {l ? (
                          <span className="badge bg-accent shrink-0 text-white">Trwa teraz</span>
                        ) : (
                          s.kind && (
                            <span className="badge bg-accent-soft text-accent shrink-0" title={KIND_LABEL[s.kind]}>
                              {s.kind}
                            </span>
                          )
                        )}
                      </span>
                      <span className="line-clamp-3 font-semibold break-words">{s.name}</span>
                      {l && (
                        <span className="text-accent text-xs font-medium">
                          {l.form} · {l.start.slice(11)}–{l.end.slice(11)}
                          {l.room ? ` · sala ${l.room}` : ''}
                        </span>
                      )}
                      <span className="text-muted mt-auto pr-8 text-xs">
                        {n === 0 ? 'Brak materiałów' : `${n} ${plural(n, 'materiał', 'materiały', 'materiałów')}`}
                      </span>
                    </button>
                    <SubjectShortcut id={s.id} name={s.name} />
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <Sheet open={addingSubject} title="Nowy przedmiot" onClose={() => setAddingSubject(false)}>
        {addingSubject && <AddSubjectForm onDone={() => setAddingSubject(false)} />}
      </Sheet>

      {current && (
        <section>
          <button
            className="btn-ghost -ml-3 gap-1"
            onClick={() => {
              setSelected(null)
              setQuery('')
              setPicked(null)
            }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Przedmioty
          </button>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight break-words">
              <SubjectIcon emoji={current.emoji} size={30} />
              {current.name}
              {current.kind && (
                <span className="badge bg-accent-soft text-accent ml-2 align-middle" title={KIND_LABEL[current.kind]}>
                  {current.kind}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap gap-1">
              <button className="btn-secondary" onClick={() => openSubjectPage(current.id)}>
                Strona przedmiotu
              </button>
              {!adding && (
                <button className="btn-primary" onClick={() => setAdding(true)}>
                  Dodaj materiał
                </button>
              )}
            </div>
          </div>

          {adding && <MaterialForm subjectId={current.id} onDone={() => setAdding(false)} />}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              className="input min-h-10 flex-1 py-1.5"
              type="search"
              placeholder={`Szukaj w materiałach (${materials.length})…`}
              aria-label="Szukaj w materiałach"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="sm:w-60">
              <GroupFilter groups={groups} mine={mine} selected={selectedGroups} onChange={setPicked} />
            </div>
          </div>

          {materials.length === 0 ? (
            <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
              Brak materiałów w tym przedmiocie.
            </p>
          ) : shown.length === 0 ? (
            <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
              Nic nie pasuje do wyszukiwania i wybranych grup.{' '}
              {(query || selectedGroups.length > 0) && (
                <button
                  className="text-accent underline"
                  onClick={() => {
                    setQuery('')
                    setPicked([])
                  }}
                >
                  Pokaż wszystko
                </button>
              )}
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Materiały">
              {shown.map((m) => (
                <li key={m.id} className="min-w-0">
                  <MaterialCard m={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
