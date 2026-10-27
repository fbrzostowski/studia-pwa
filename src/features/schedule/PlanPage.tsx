import { useEffect, useMemo, useState } from 'react'
import { deleteDoc, doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import { useSubjects } from '../materials/useSubjects'
import { useClassDocs, useMemberships, useSyncMyPhoto } from '../groups/hooks'
import Avatar from '../../components/Avatar'
import Sheet from '../../components/Sheet'
import { useSharedPlanPeople, type PlanPerson } from './useSharedPlans'
import { useOpenSubjectPage } from '../subject/SubjectPageContext'
import ImportPlan from './ImportPlan'
import { findSubjectForEvent as findSubject } from './match'
import { classKey, normGroup, type IcsEvent } from './parseIcs'
import { addDays, fromDateKey, toDateKey, toLocalIso, upcomingDayKeys } from './weeks'

interface PlanDoc {
  events: IcsEvent[]
  fileName?: string
  importedAt?: Timestamp
}

const FORM_STYLE: Record<string, string> = {
  WYK: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  CW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  KON: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  LAB: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300',
}
const FORM_FALLBACK = 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const dayTitle = (key: string) =>
  cap(fromDateKey(key).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }))

// Przedmiot w aplikacji pasuje do zajęć po kodzie USOS i formie (WYK+CW obejmuje WYK i CW).
function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

const PAGE_DAYS = 7

export default function PlanPage() {
  const openSubjectPage = useOpenSubjectPage()
  const { user, profile } = useAuth()
  const { subjects } = useSubjects()
  const memberships = useMemberships()
  useSyncMyPhoto(memberships)
  const classDocs = useClassDocs()
  const [plan, setPlan] = useState<PlanDoc | null | undefined>(undefined) // undefined = ładowanie
  const [limit, setLimit] = useState(PAGE_DAYS)
  const [now, setNow] = useState(() => toLocalIso(new Date()))
  const [importing, setImporting] = useState(false)
  const [viewing, setViewing] = useState<PlanPerson | null>(null) // null = mój plan; inaczej plan udostępniony przez tę osobę
  const [picking, setPicking] = useState(false)
  const { people } = useSharedPlanPeople()
  const target = viewing?.uid ?? user!.uid
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPlan(undefined)
    setLimit(PAGE_DAYS)
    setError(null)
    return onSnapshot(
      doc(db, 'plans', target),
      (snap) => setPlan(snap.exists() ? (snap.data() as PlanDoc) : null),
      (e) => {
        // cudzy plan, którego właściciel nie udostępnia (albo już wycofał zgodę)
        setError(viewing ? `${viewing.username} nie udostępnia planu.` : e.message)
        setPlan(null)
      },
    )
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  // „Teraz” i wyszarzanie minionych zajęć odświeżają się co minutę.
  useEffect(() => {
    const t = setInterval(() => setNow(toLocalIso(new Date())), 60_000)
    return () => clearInterval(t)
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, IcsEvent[]>()
    for (const e of plan?.events ?? []) {
      const k = e.start.slice(0, 10)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    for (const list of m.values()) list.sort((a, b) => a.start.localeCompare(b.start))
    return m
  }, [plan])

  // Dziś i kolejne dni z zajęciami; po końcu dzisiejszych zajęć od jutra (`now` tyka co minutę).
  const days = useMemo(() => upcomingDayKeys(plan?.events ?? [], now), [plan, now])
  const visible = days.slice(0, limit)
  const todayKey = now.slice(0, 10)
  const tomorrowKey = toDateKey(addDays(fromDateKey(todayKey), 1))

  const removePlan = async () => {
    if (!confirm('Usunąć zaimportowany plan zajęć? Przedmioty zostaną.')) return
    await deleteDoc(doc(db, 'plans', user!.uid)).catch((e) => setError(e.message))
  }

  const switcher = (people.length > 0 || viewing) && (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        className="border-line bg-surface hover:bg-accent-soft flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-sm font-medium"
        onClick={() => setPicking(true)}
        aria-haspopup="dialog"
      >
        <Avatar
          name={viewing?.username ?? profile?.username ?? 'Ty'}
          photoURL={viewing ? viewing.photoURL : profile?.photoURL}
          size={24}
        />
        {viewing ? `Plan: ${viewing.username}` : 'Mój plan'}
        <svg viewBox="0 0 24 24" className="text-muted h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {viewing && <span className="text-muted text-xs">tylko do odczytu</span>}
    </div>
  )
  const picker = (
    <Sheet open={picking} title="Zobacz plan" onClose={() => setPicking(false)}>
      <ul className="space-y-1">
        {[null, ...people].map((p) => {
          const active = (p?.uid ?? null) === (viewing?.uid ?? null)
          return (
            <li key={p?.uid ?? 'me'}>
              <button
                className="hover:bg-accent-soft aria-[current=true]:bg-accent-soft flex w-full items-center gap-3 rounded-xl p-2.5 text-left"
                aria-current={active}
                onClick={() => {
                  setViewing(p)
                  setPicking(false)
                }}
              >
                <Avatar
                  name={p?.username ?? profile?.username ?? 'Ty'}
                  photoURL={p ? p.photoURL : profile?.photoURL}
                  size={36}
                />
                <span className="min-w-0 flex-1 font-medium break-words">{p ? p.username : 'Mój plan'}</span>
                {active && <span className="text-accent text-sm">✓</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-muted mt-3 text-xs">
        Widać tylko osoby, które udostępniły plan (Ustawienia → Prywatność). Plan innej osoby jest tylko do odczytu.
      </p>
    </Sheet>
  )

  if (plan === undefined) return <p className="text-muted">Ładowanie…</p>

  if (importing) {
    return <ImportPlan subjects={subjects} onDone={() => setImporting(false)} />
  }

  if (!plan && viewing) {
    return (
      <div>
        {switcher}
        {picker}
        <p className="border-line text-muted rounded-2xl border border-dashed p-8 text-center text-sm">
          {error ?? `${viewing.username} nie ma jeszcze zaimportowanego planu.`}
        </p>
      </div>
    )
  }

  if (!plan) {
    return (
      <div>
        {switcher}
        {picker}
        {error && <p className="text-danger mb-3 text-sm">{error}</p>}
        <div className="border-line rounded-2xl border border-dashed p-8 text-center">
          <h2 className="text-lg font-semibold">Brak planu zajęć</h2>
          <p className="text-muted mx-auto mt-1 max-w-sm text-sm">
            Zaimportuj plik .ics z kalendarza USOS. Utworzę też brakujące przedmioty.
          </p>
          <button className="btn-primary mt-5" onClick={() => setImporting(true)}>
            Importuj plan z USOS
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {switcher}
      {picker}
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      {visible.length === 0 && (
        <p className="border-line text-muted rounded-2xl border border-dashed p-6 text-center text-sm">
          Brak nadchodzących zajęć w zaimportowanym planie.
        </p>
      )}

      <div className="space-y-5">
        {visible.map((k) => {
          const list = byDay.get(k) ?? []
          const isToday = k === todayKey
          return (
            <section key={k}>
              <h3
                className={`mb-2 flex items-center gap-2 text-sm font-semibold ${isToday ? 'text-accent' : 'text-muted'}`}
              >
                {dayTitle(k)}
                {isToday && <span className="badge bg-accent text-white">Dziś</span>}
                {k === tomorrowKey && <span className="badge bg-accent-soft text-accent">Jutro</span>}
              </h3>
              {list.length === 0 ? (
                <p className="text-muted text-sm">Brak zajęć</p>
              ) : (
                <ul className="space-y-2">
                  {list.map((e, i) => {
                    const subject = findSubject(subjects, e)
                    // Kto jeszcze z nas ma dokładnie tę grupę (ta sama forma i numer grupy w USOS)
                    const together = subject
                      ? memberships
                          .filter(
                            (m) =>
                              m.subjectId === subject.id &&
                              m.uid !== target &&
                              (m.classes ?? []).some((c) => c.form === e.form && normGroup(c.group) === normGroup(e.group)),
                          )
                          .map((m) => ({ name: m.username, photoURL: m.photoURL }))
                      : []
                    const lecturer = subject ? classDocs[classKey(subject.id, e.form, e.group)]?.lecturer : undefined
                    const ongoing = e.start <= now && now < e.end
                    const past = e.end <= now
                    const body = (
                      <>
                        <div className="w-12 shrink-0 text-left text-sm tabular-nums">
                          <p className="font-semibold">{e.start.slice(11)}</p>
                          <p className="text-muted">{e.end.slice(11)}</p>
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="font-medium break-words">
                            {subject?.emoji && <span aria-hidden="true" className="mr-1.5">{subject.emoji}</span>}
                            {e.name}
                          </p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`badge ${FORM_STYLE[e.form] ?? FORM_FALLBACK}`}>{e.form}</span>
                            {e.room && <span className="text-muted text-xs">Sala {e.room}</span>}
                            {e.group && <span className="text-muted text-xs">gr. {e.group}</span>}
                            {ongoing && <span className="badge bg-accent text-white">Teraz</span>}
                          </p>
                          {lecturer && <p className="text-muted mt-1 text-xs">{lecturer}</p>}
                          {together.length > 0 && (
                            <p
                              className="mt-1.5 flex items-center"
                              title={`Razem: ${together.map((t) => t.name).join(', ')}`}
                              aria-label={`Razem: ${together.map((t) => t.name).join(', ')}`}
                            >
                              <span className="flex -space-x-1.5">
                                {together.slice(0, 5).map((t) => (
                                  <Avatar key={t.name} name={t.name} photoURL={t.photoURL} size={24} className="ring-surface ring-2" />
                                ))}
                              </span>
                              {together.length > 5 && <span className="text-muted ml-2 text-xs">+{together.length - 5}</span>}
                            </p>
                          )}
                        </div>
                        {subject && <span className="text-muted self-center"><Chevron /></span>}
                      </>
                    )
                    const cls = `card flex w-full items-start gap-3 p-3.5 ${past ? 'opacity-55' : ''} ${ongoing ? 'ring-accent ring-2' : ''}`
                    return (
                      <li key={`${e.start}-${e.code}-${e.form}-${i}`}>
                        {subject ? (
                          <button className={`${cls} hover:bg-accent-soft`} onClick={() => openSubjectPage(subject.id)}>
                            {body}
                          </button>
                        ) : (
                          <div className={cls}>{body}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      {days.length > visible.length && (
        <button className="btn-secondary mt-5 w-full" onClick={() => setLimit((l) => l + PAGE_DAYS)}>
          Pokaż kolejne dni
        </button>
      )}

      {viewing ? (
        <p className="border-line text-muted mt-8 border-t pt-4 text-xs">
          Plan użytkownika {viewing.username} (tylko do odczytu)
          {plan.importedAt && `, zaimportowany ${plan.importedAt.toDate().toLocaleDateString('pl-PL')}`}
        </p>
      ) : (
        <div className="border-line mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-muted text-xs">
            Plan z pliku {plan.fileName ?? '.ics'}
            {plan.importedAt && `, zaimportowany ${plan.importedAt.toDate().toLocaleDateString('pl-PL')}`}
          </p>
          <div className="flex gap-1">
            <button className="btn-secondary" onClick={() => setImporting(true)}>
              Zaktualizuj plan
            </button>
            <button className="btn-danger" onClick={removePlan}>
              Usuń plan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
