import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth, type Role, type Status, type UserProfile } from '../../firebase/AuthContext'

type Row = UserProfile & { uid: string }

const STATUS_LABEL: Record<Status, string> = {
  pending: 'Oczekuje',
  approved: 'Zatwierdzony',
  rejected: 'Odrzucony',
}

const STATUS_STYLE: Record<Status, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
}

function Person({ r }: { r: Row }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{r.displayName || r.email}</p>
      <p className="text-muted truncate text-sm">{r.email}</p>
    </div>
  )
}

export default function AccessRequests() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'users'),
        (snap) => setRows(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserProfile) }))),
        (e) => setError(e.message),
      ),
    [],
  )

  const review = (uid: string, status: Status) =>
    updateDoc(doc(db, 'users', uid), {
      status,
      reviewedBy: user!.uid,
      reviewedAt: serverTimestamp(),
    }).catch((e) => setError(e.message))

  const setRole = (uid: string, role: Role) =>
    updateDoc(doc(db, 'users', uid), { role }).catch((e) => setError(e.message))

  const pending = rows.filter((r) => r.status === 'pending')
  const others = rows.filter((r) => r.status !== 'pending')

  return (
    <div className="space-y-8">
      {error && <p className="text-danger text-sm">{error}</p>}

      <section>
        <h2 className="text-lg font-semibold">
          Wnioski o dostęp
          {pending.length > 0 && (
            <span className="bg-accent ml-2 rounded-full px-2 py-0.5 align-middle text-xs text-white">
              {pending.length}
            </span>
          )}
        </h2>
        {pending.length === 0 ? (
          <p className="border-line text-muted mt-3 rounded-2xl border border-dashed p-6 text-center text-sm">
            Brak oczekujących wniosków.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((r) => (
              <li key={r.uid} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Person r={r} />
                <div className="flex gap-2">
                  <button className="btn-primary" onClick={() => review(r.uid, 'approved')}>
                    Zatwierdź
                  </button>
                  <button className="btn-danger" onClick={() => review(r.uid, 'rejected')}>
                    Odrzuć
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Użytkownicy</h2>
        <ul className="mt-3 space-y-2">
          {others.map((r) => (
            <li key={r.uid} className="card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <Person r={r} />
                <span className="flex shrink-0 gap-1.5">
                  {r.role === 'admin' && (
                    <span className="badge bg-accent-soft text-accent">Admin</span>
                  )}
                  <span className={`badge ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </span>
              </div>
              {r.uid !== user!.uid && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.status === 'rejected' && (
                    <button className="btn-secondary" onClick={() => review(r.uid, 'approved')}>
                      Zatwierdź
                    </button>
                  )}
                  {r.status === 'approved' && (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() => setRole(r.uid, r.role === 'admin' ? 'user' : 'admin')}
                      >
                        {r.role === 'admin' ? 'Odbierz admina' : 'Nadaj admina'}
                      </button>
                      <button className="btn-danger" onClick={() => review(r.uid, 'rejected')}>
                        Odbierz dostęp
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
