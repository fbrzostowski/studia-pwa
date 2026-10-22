import { shownName, useAuth } from '../../firebase/AuthContext'
import AccessRequests from '../admin/AccessRequests'

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
