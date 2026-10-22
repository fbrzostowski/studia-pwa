import { useState } from 'react'
import { AuthProvider, useAuth } from './firebase/AuthContext'
import MaterialsPage from './features/materials/MaterialsPage'
import AccessRequests from './features/admin/AccessRequests'
import InstallHint from './components/InstallHint'
import OfflineBanner from './components/OfflineBanner'

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OfflineBanner />
      <main className="mx-auto max-w-2xl p-6">
        <InstallHint />
        {children}
      </main>
    </>
  )
}

function Gate() {
  const { user, profile, loading, error, login, logout } = useAuth()
  const [tab, setTab] = useState<'materials' | 'admin'>('materials')

  if (loading) return <Screen>Ładowanie…</Screen>

  if (!user) {
    return (
      <Screen>
        <h1 className="text-2xl font-bold">Studia</h1>
        <button className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white" onClick={login}>
          Zaloguj się przez Google
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Screen>
    )
  }

  if (!profile || profile.status !== 'approved') {
    const msg =
      profile?.status === 'rejected'
        ? 'Twój wniosek o dostęp został odrzucony. Skontaktuj się z administratorem.'
        : 'Konto czeka na zatwierdzenie przez administratora.'
    return (
      <Screen>
        <h1 className="text-2xl font-bold">Studia</h1>
        <p className="mt-4">{error ?? msg}</p>
        <button className="mt-4 rounded border px-4 py-2" onClick={logout}>
          Wyloguj
        </button>
      </Screen>
    )
  }

  return (
    <Screen>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Studia</h1>
        <span className="flex items-center gap-3 text-sm">
          {profile.displayName}
          <button className="rounded border px-3 py-1" onClick={logout}>
            Wyloguj
          </button>
        </span>
      </header>
      {profile.role === 'admin' && (
        <nav className="mt-4 flex gap-2">
          <button className={`rounded border px-3 py-1 ${tab === 'materials' ? 'bg-gray-900 text-white' : ''}`} onClick={() => setTab('materials')}>
            Materiały
          </button>
          <button className={`rounded border px-3 py-1 ${tab === 'admin' ? 'bg-gray-900 text-white' : ''}`} onClick={() => setTab('admin')}>
            Użytkownicy
          </button>
        </nav>
      )}
      {tab === 'admin' && profile.role === 'admin' ? <AccessRequests /> : <MaterialsPage />}
    </Screen>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
