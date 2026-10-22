import { useEffect, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from './firebase/config'
import { AuthProvider, shownName, useAuth } from './firebase/AuthContext'
import UsernameForm from './features/profile/UsernameForm'
import MaterialsPage from './features/materials/MaterialsPage'
import SettingsPage from './features/settings/SettingsPage'
import InstallHint from './components/InstallHint'
import OfflineBanner from './components/OfflineBanner'

const logo = `${import.meta.env.BASE_URL}favicon.svg`

// Ekran poza panelem: logowanie, oczekiwanie na zatwierdzenie, odmowa.
function Centered({ children }: { children: ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <main className="flex min-h-dvh flex-col items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm">
          <InstallHint />
          <div className="card p-8 text-center">
            <img src={logo} alt="" className="mx-auto h-16 w-16" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Studia</h1>
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
    const rejected = profile.status === 'rejected'
    return (
      <Centered>
        <p className="mt-4">
          {error ??
            (rejected
              ? 'Twój wniosek o dostęp został odrzucony. Skontaktuj się z administratorem.'
              : 'Konto czeka na zatwierdzenie przez administratora.')}
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

// Panel zalogowanego, zatwierdzonego użytkownika: materiały + ustawienia pod ikoną profilu.
function Panel() {
  const { profile } = useAuth()
  const [view, setView] = useState<'main' | 'settings'>('main')
  const isAdmin = profile!.role === 'admin'
  const pending = usePendingCount(isAdmin)
  const settings = view === 'settings'
  const initial = shownName(profile!).charAt(0).toUpperCase()

  return (
    <>
      <OfflineBanner />
      <header className="border-line bg-surface/85 sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          {settings ? (
            <>
              <button className="btn-ghost -ml-2 px-2.5" onClick={() => setView('main')} aria-label="Wróć">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-lg font-semibold tracking-tight">Ustawienia</h1>
            </>
          ) : (
            <>
              <img src={logo} alt="" className="h-8 w-8" />
              <span className="text-lg font-semibold tracking-tight">Studia</span>
            </>
          )}

          <button
            className={`relative ml-auto rounded-full ${settings ? 'ring-accent ring-2 ring-offset-2 ring-offset-surface' : ''}`}
            onClick={() => setView(settings ? 'main' : 'settings')}
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

      <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <InstallHint />
        {settings ? <SettingsPage /> : <MaterialsPage />}
      </main>
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
