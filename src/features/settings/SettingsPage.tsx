import { useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { shownName, useAuth } from '../../firebase/AuthContext'
import AccessRequests from '../admin/AccessRequests'

/** Zgoda na pokazywanie własnego planu innym zatwierdzonym użytkownikom (domyślnie wyłączona). */
function SharePlan() {
  const { user } = useAuth()
  const [state, setState] = useState<{ exists: boolean; shared: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'plans', user!.uid),
        (snap) => setState({ exists: snap.exists(), shared: snap.exists() && snap.data().shared === true }),
        (e) => setError(e.message),
      ),
    [user],
  )
  const toggle = (shared: boolean) =>
    setDoc(doc(db, 'plans', user!.uid), { shared }, { merge: true }).catch((e) => setError(e.message))

  return (
    <section>
      <h2 className="text-muted mb-4 text-xs font-semibold tracking-wide uppercase">Prywatność</h2>
      <label className="card flex items-start gap-3 p-4">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={state?.shared ?? false}
          disabled={!state?.exists}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="min-w-0">
          <span className="block font-medium">Udostępnij mój plan innym</span>
          <span className="text-muted block text-sm">
            Zatwierdzeni użytkownicy zobaczą Twój plan zajęć (tylko do odczytu) i znajdą Cię na liście w zakładce Plan.
            Możesz to wyłączyć w każdej chwili. Administrator ma wgląd w każdy plan i może poprawiać w nim zajęcia
            niezależnie od tego ustawienia.
            {state && !state.exists && ' Najpierw zaimportuj plan z USOS.'}
          </span>
        </span>
      </label>
      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </section>
  )
}

export default function SettingsPage() {
  const { profile, logout } = useAuth()
  if (!profile) return null
  const isAdmin = profile.role === 'admin'

  return (
    <div className="space-y-8">
      <section className="card flex items-center gap-4 p-4">
        {profile.photoURL ? (
          <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" />
        ) : (
          <span className="bg-accent-soft text-accent flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold">
            {shownName(profile).charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{shownName(profile)}</p>
          {profile.username && profile.displayName && (
            <p className="text-muted truncate text-sm">{profile.displayName}</p>
          )}
          {isAdmin && <span className="badge bg-accent-soft text-accent mt-1">Admin</span>}
        </div>
      </section>

      <SharePlan />

      {isAdmin && (
        <section>
          <h2 className="text-muted mb-4 text-xs font-semibold tracking-wide uppercase">Administracja</h2>
          <AccessRequests />
        </section>
      )}

      <button className="btn-secondary text-danger w-full" onClick={logout}>
        Wyloguj
      </button>
    </div>
  )
}
