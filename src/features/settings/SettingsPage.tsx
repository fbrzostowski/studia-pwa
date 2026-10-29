import { useState } from 'react'
import { shownName, useAuth } from '../../firebase/AuthContext'
import { InstallGuideSheet, useInstallContext } from '../../components/InstallHint'
import { needsInstallGuide } from '../../lib/install'
import AccessRequests from '../admin/AccessRequests'

export default function SettingsPage() {
  const { profile, logout } = useAuth()
  const install = useInstallContext()
  const [guide, setGuide] = useState(false)
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

      {needsInstallGuide(install) && (
        <section>
          <h2 className="text-muted mb-4 text-xs font-semibold tracking-wide uppercase">Aplikacja</h2>
          <div className="card flex items-center justify-between gap-3 p-4">
            <p className="min-w-0 text-sm">Dodaj aplikację do ekranu głównego, żeby działała na całym ekranie.</p>
            <button className="btn-secondary shrink-0" onClick={() => setGuide(true)}>
              Jak zainstalować
            </button>
          </div>
          <InstallGuideSheet open={guide} onClose={() => setGuide(false)} ctx={install} />
        </section>
      )}

      <section>
        <h2 className="text-muted mb-4 text-xs font-semibold tracking-wide uppercase">Prywatność</h2>
        <p className="card p-4 text-sm">
          Twój plan zajęć widzą wszyscy zatwierdzeni użytkownicy (zakładka Plan → „Mój plan”). Zmieniać go może tylko Ty i
          administrator.
        </p>
      </section>

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
