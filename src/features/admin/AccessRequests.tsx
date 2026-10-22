import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth, type Role, type Status, type UserProfile } from '../../firebase/AuthContext'

type Row = UserProfile & { uid: string }

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
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Wnioski o dostęp ({pending.length})</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {pending.length === 0 && <p className="mt-2 text-sm text-gray-500">Brak oczekujących wniosków.</p>}
      <ul className="mt-2 divide-y rounded border">
        {pending.map((r) => (
          <li key={r.uid} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span>
              {r.displayName} <span className="text-sm text-gray-500">{r.email}</span>
            </span>
            <span className="flex gap-2">
              <button className="rounded bg-green-600 px-3 py-1 text-white" onClick={() => review(r.uid, 'approved')}>
                Zatwierdź
              </button>
              <button className="rounded bg-red-600 px-3 py-1 text-white" onClick={() => review(r.uid, 'rejected')}>
                Odrzuć
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Użytkownicy</h2>
      <ul className="mt-2 divide-y rounded border">
        {others.map((r) => (
          <li key={r.uid} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span>
              {r.displayName} <span className="text-sm text-gray-500">{r.email} · {r.status} · {r.role}</span>
            </span>
            {r.uid !== user!.uid && (
              <span className="flex gap-2">
                {r.status === 'rejected' && (
                  <button className="rounded border px-3 py-1" onClick={() => review(r.uid, 'approved')}>
                    Zatwierdź
                  </button>
                )}
                {r.status === 'approved' && (
                  <button className="rounded border px-3 py-1" onClick={() => review(r.uid, 'rejected')}>
                    Odbierz dostęp
                  </button>
                )}
                {r.status === 'approved' && (
                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => setRole(r.uid, r.role === 'admin' ? 'user' : 'admin')}
                  >
                    {r.role === 'admin' ? 'Odbierz admina' : 'Nadaj admina'}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
