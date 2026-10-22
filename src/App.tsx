import { useState, type ReactNode } from 'react'
import { AuthProvider, shownName, useAuth } from './firebase/AuthContext'
import UsernameForm from './features/profile/UsernameForm'
import MaterialsPage from './features/materials/MaterialsPage'
import AccessRequests from './features/admin/AccessRequests'
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
  const [tab, setTab] = useState<'materials' | 'admin'>('materials')

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

  const isAdmin = profile.role === 'admin'
  const initial = shownName(profile).charAt(0).toUpperCase()

  return (
    <>
      <OfflineBanner />
      <header className="border-line bg-surface/85 sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <img src={logo} alt="" className="h-8 w-8" />
          <span className="hidden text-lg font-semibold tracking-tight sm:inline">Studia</span>

          {isAdmin && (
            <nav className="ml-2 flex gap-1">
              {(
                [
                  ['materials', 'Materiały'],
                  ['admin', 'Użytkownicy'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-current={tab === id}
                  onClick={() => setTab(id)}
                  className="text-muted aria-[current=true]:bg-accent-soft aria-[current=true]:text-accent rounded-lg px-3 py-1.5 text-sm font-medium"
                >
                  {label}
                </button>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="bg-accent-soft text-accent flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold">
                {initial}
              </span>
            )}
            <button className="btn-ghost max-sm:px-2.5" onClick={logout} aria-label="Wyloguj" title="Wyloguj">
              <svg viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span className="max-sm:hidden">Wyloguj</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <InstallHint />
        {tab === 'admin' && isAdmin ? <AccessRequests /> : <MaterialsPage />}
      </main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
