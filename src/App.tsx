import { useEffect, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase/config'
import { AuthProvider, shownName, useAuth } from './firebase/AuthContext'
import UsernameForm from './features/profile/UsernameForm'
import MaterialsPage from './features/materials/MaterialsPage'
import PlanPage from './features/schedule/PlanPage'
import TextbooksPage from './features/textbooks/TextbooksPage'
import ExamsPage from './features/exams/ExamsPage'
import SettingsPage from './features/settings/SettingsPage'
import InstallHint from './components/InstallHint'
import OfflineBanner from './components/OfflineBanner'
import UpdateBanner from './components/UpdateBanner'
import SubjectPage from './features/subject/SubjectPage'
import { SubjectPageProvider } from './features/subject/SubjectPageContext'

const logo = `${import.meta.env.BASE_URL}favicon.svg`

// Ekran poza panelem: logowanie, oczekiwanie na zatwierdzenie, odmowa.
function Centered({ children }: { children: ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <UpdateBanner />
      <main className="flex min-h-dvh flex-col items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm">
          <InstallHint />
          <div className="card p-8 text-center">
            <img src={logo} alt="" className="mx-auto h-16 w-16" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Łomiankowe SGH</h1>
            {children}
          </div>
        </div>
      </main>
    </>
  )
}

function Gate() {
  const { user, profile, loading, error, login, logout } = useAuth()

  if (loading) {
    return (
      <Centered>
        <p className="text-muted mt-4">Ładowanie…</p>
      </Centered>
    )
  }

  if (!user) {
    return (
      <Centered>
        <p className="text-muted mt-1 text-sm">Wspólne materiały i terminy z zajęć</p>
        <button className="btn-primary mt-6 w-full" onClick={login}>
          Zaloguj się przez Google
        </button>
        {error && <p className="text-danger mt-3 text-sm">{error}</p>}
      </Centered>
    )
  }

  if (!profile) {
    if (error) {
      return (
        <Centered>
          <p className="text-danger mt-4 text-sm">{error}</p>
          <button className="btn-secondary mt-6 w-full" onClick={logout}>
            Wyloguj
          </button>
        </Centered>
      )
    }
    return (
      <Centered>
        <UsernameForm />
      </Centered>
    )
  }

  if (profile.status !== 'approved') {
    // Odrzuconym pokazujemy ten sam komunikat co oczekującym.
    return (
      <Centered>
        <p className="mt-4">
          {error ?? 'Twoje konto oczekuje na zatwierdzenie przez administratora.'}
        </p>
        <p className="text-muted mt-1 text-sm">{shownName(profile)}</p>
        <button className="btn-secondary mt-6 w-full" onClick={logout}>
          Wyloguj
        </button>
      </Centered>
    )
  }

  return <Panel />
}

type Tab = 'plan' | 'materials' | 'textbooks' | 'exams'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'plan', label: 'Plan', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { id: 'materials', label: 'Materiały', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { id: 'textbooks', label: 'Podręczniki', icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z' },
  { id: 'exams', label: 'Zaliczenia', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2zM9 14l2 2 4-4' },
]

// Panel zalogowanego, zatwierdzonego użytkownika: plan, materiały i ustawienia pod ikoną profilu.
function Panel() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('plan')
  const [settings, setSettings] = useState(false)
  const [focusSubject, setFocusSubject] = useState<string | null>(null)
  const [subjectId, setSubjectId] = useState<string | null>(null) // otwarta strona przedmiotu (nad bieżącą zakładką)
  const isAdmin = profile!.role === 'admin'
  const pending = usePendingCount(isAdmin)
  const initial = shownName(profile!).charAt(0).toUpperCase()
  const go = (t: Tab) => {
    setFocusSubject(null)
    setSubjectId(null)
    setTab(t)
    setSettings(false)
  }

  return (
    <>
      <OfflineBanner />
      <UpdateBanner />
      <header className="border-line bg-surface/85 sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          {settings ? (
            <>
              <button className="btn-ghost -ml-2 px-2.5" onClick={() => setSettings(false)} aria-label="Wróć">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold tracking-tight">Ustawienia</h1>
            </>
          ) : (
            <>
              <img src={logo} alt="" className="h-8 w-8" />
              <span className="text-lg font-semibold tracking-tight">LOM.SGH</span>
            </>
          )}

          <nav className="ml-2 hidden gap-1 sm:flex" aria-label="Główna nawigacja">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                aria-current={!settings && tab === id}
                onClick={() => go(id)}
                className="text-muted aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            className={`relative ml-auto rounded-full ${settings ? 'ring-accent ring-2 ring-offset-2 ring-offset-surface' : ''}`}
            onClick={() => setSettings((v) => !v)}
            aria-label={pending > 0 ? `Ustawienia (${pending} wniosków o dostęp)` : 'Ustawienia'}
            aria-pressed={settings}
          >
            {profile!.photoURL ? (
              <img src={profile!.photoURL} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
            ) : (
              <span className="bg-accent-soft text-accent flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold">
                {initial}
              </span>
            )}
            {pending > 0 && (
              <span className="bg-danger border-surface absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 px-1 text-[10px] leading-none font-bold text-white">
                {pending}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-8">
        <InstallHint />
        <SubjectPageProvider
          value={(id) => {
            setSettings(false)
            setSubjectId(id)
          }}
        >
          {subjectId && !settings && (
            <SubjectPage
              subjectId={subjectId}
              onBack={() => setSubjectId(null)}
              onOpenMaterials={() => {
                setFocusSubject(subjectId)
                setSubjectId(null)
                setTab('materials')
              }}
            />
          )}
          {/* Zakładka zostaje zamontowana pod stroną przedmiotu, żeby po powrocie miała ten sam stan (otwarty folder, miesiąc). */}
          <div hidden={!!subjectId && !settings}>
            {settings ? (
              <SettingsPage />
            ) : tab === 'plan' ? (
              <PlanPage />
            ) : tab === 'textbooks' ? (
              <TextbooksPage />
            ) : tab === 'exams' ? (
              <ExamsPage />
            ) : (
              <MaterialsPage key={focusSubject ?? 'none'} initialSubjectId={focusSubject} />
            )}
          </div>
        </SubjectPageProvider>
      </main>

      <nav
        className="border-line bg-surface/90 fixed inset-x-0 bottom-0 z-10 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        aria-label="Główna nawigacja"
      >
        {TABS.map(({ id, label, icon }) => {
          const active = !settings && tab === id
          return (
            <button
              key={id}
              aria-current={active}
              onClick={() => go(id)}
              className="text-muted aria-[current=true]:text-accent flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={icon} />
              </svg>
              {label}
            </button>
          )
        })}
      </nav>
    </>
  )
}

// Liczba oczekujących wniosków — tylko dla admina (reguły i tak blokują zwykłym użytkownikom).
function usePendingCount(enabled: boolean) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    return onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'pending')),
      (snap) => setCount(snap.size),
      () => setCount(0),
    )
  }, [enabled])
  return enabled ? count : 0
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
