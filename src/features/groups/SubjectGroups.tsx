import { useState } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { memberName, useAuth } from '../../firebase/AuthContext'
import { plural } from '../../lib/plural'
import type { Subject } from '../materials/types'
import { classKey, normGroup, type ClassInfo } from '../schedule/parseIcs'
import { useClassDocs, useMemberships } from './hooks'
import type { Membership } from './types'

const FORM_TITLE: Record<string, string> = {
  WYK: 'Wykłady',
  CW: 'Ćwiczenia',
  KON: 'Konwersatorium',
  LAB: 'Laboratorium',
}

interface Tile {
  key: string
  form: string
  group: string
  info: ClassInfo
  members: Membership[]
}

function Names({ members, meUid }: { members: Membership[]; meUid: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {members.map((m) => (
        <li
          key={m.uid}
          className={`badge ${m.uid === meUid ? 'bg-accent text-white' : 'bg-accent-soft text-accent'}`}
        >
          {m.username}
          {m.uid === meUid && ' (Ty)'}
        </li>
      ))}
    </ul>
  )
}

export default function SubjectGroups({ subject }: { subject: Subject }) {
  const { user, profile } = useAuth()
  const memberships = useMemberships()
  const classDocs = useClassDocs()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const meUid = user!.uid
  const members = memberships
    .filter((m) => m.subjectId === subject.id)
    .sort((a, b) => (a.uid === meUid ? -1 : b.uid === meUid ? 1 : a.username.localeCompare(b.username, 'pl')))
  const me = members.find((m) => m.uid === meUid)

  const join = () =>
    setDoc(doc(db, 'memberships', `${subject.id}_${meUid}`), {
      uid: meUid,
      subjectId: subject.id,
      username: memberName(profile!),
      classes: me?.classes ?? [],
      updatedAt: serverTimestamp(),
    }).catch((e) => setError(e.message))

  const leave = () => {
    if (!confirm('Opuścić ten przedmiot? Zniknie Twoja przynależność do grup.')) return
    return deleteDoc(doc(db, 'memberships', `${subject.id}_${meUid}`)).catch((e) => setError(e.message))
  }

  const saveLecturer = async (t: Tile) => {
    try {
      await setDoc(doc(db, 'classes', t.key), {
        subjectId: subject.id,
        form: t.form,
        group: normGroup(t.group),
        lecturer: draft.trim(),
        updatedBy: meUid,
        updatedAt: serverTimestamp(),
      })
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Osobne sekcje dla wykładów i ćwiczeń (WYK+CW, KON+CW), a w nich po jednym kafelku na grupę.
  const sections = subject.kind.split('+').map((form) => {
    const tiles = new Map<string, Tile>()
    for (const m of members) {
      for (const c of m.classes ?? []) {
        if (c.form !== form) continue
        const key = classKey(subject.id, form, c.group)
        const t = tiles.get(key) ?? { key, form, group: c.group, info: { ...c, rooms: [], when: [] }, members: [] }
        t.members.push(m)
        for (const w of c.when) if (!t.info.when.includes(w)) t.info.when.push(w)
        for (const r of c.rooms) if (!t.info.rooms.includes(r)) t.info.rooms.push(r)
        tiles.set(key, t)
      }
    }
    const list = [...tiles.values()].sort(
      (a, b) =>
        +b.members.some((m) => m.uid === meUid) - +a.members.some((m) => m.uid === meUid) ||
        a.group.localeCompare(b.group, 'pl', { numeric: true }),
    )
    const ungrouped = members.filter((m) => !(m.classes ?? []).some((c) => c.form === form))
    return { form, list, ungrouped }
  })

  return (
    <section className="mt-5 space-y-5">
      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="card space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Uczestnicy ({members.length})</h3>
          {me ? (
            <button className="btn-ghost -mr-2" onClick={leave}>
              Opuść przedmiot
            </button>
          ) : (
            <button className="btn-secondary" onClick={join}>
              Dołącz do przedmiotu
            </button>
          )}
        </div>
        {members.length === 0 ? (
          <p className="text-muted text-sm">Nikt jeszcze nie należy do tego przedmiotu.</p>
        ) : (
          <Names members={members} meUid={meUid} />
        )}
      </div>

      {sections.map(({ form, list, ungrouped }) => (
        <div key={form}>
          <h3 className="text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
            {FORM_TITLE[form] ?? form} — grupy i prowadzący
          </h3>

          {list.length === 0 ? (
            <p className="border-line text-muted rounded-2xl border border-dashed p-4 text-center text-sm">
              Nikt jeszcze nie przypisał się do grupy. Grupy powstają z zaimportowanego planu USOS.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((t) => {
                const mine = t.members.some((m) => m.uid === meUid)
                const lecturer = classDocs[t.key]?.lecturer
                const others = t.members.length - (mine ? 1 : 0)
                return (
                  <div key={t.key} className={`card p-4 ${mine ? 'ring-accent ring-2' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">Grupa {t.group || '—'}</p>
                      {mine && <span className="badge bg-accent text-white">Twoja grupa</span>}
                    </div>

                    {editing === t.key ? (
                      <form
                        className="mt-2 flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void saveLecturer(t)
                        }}
                      >
                        <input
                          autoFocus
                          maxLength={80}
                          className="input min-w-0 flex-1 py-2"
                          placeholder="Imię i nazwisko prowadzącego"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                        />
                        <button className="btn-primary">OK</button>
                      </form>
                    ) : (
                      <button
                        className={`mt-1 text-left text-sm ${lecturer ? 'font-medium' : 'text-accent'}`}
                        onClick={() => {
                          setEditing(t.key)
                          setDraft(lecturer ?? '')
                        }}
                      >
                        {lecturer ? `Prowadzący: ${lecturer}` : '+ Dodaj prowadzącego'}
                      </button>
                    )}

                    {(t.info.when.length > 0 || t.info.rooms.length > 0) && (
                      <p className="text-muted mt-1 text-sm">
                        {[...t.info.when, ...(t.info.rooms.length ? [`sala ${t.info.rooms.join(' / ')}`] : [])].join(' · ')}
                      </p>
                    )}

                    <div className="mt-3">
                      <Names members={t.members} meUid={meUid} />
                      {mine && (
                        <p className="text-muted mt-2 text-xs">
                          {others === 0
                            ? 'Nikt inny z naszych nie ma tej grupy.'
                            : `Razem z Tobą: ${others} ${plural(others, 'osoba', 'osoby', 'osób')}.`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {ungrouped.length > 0 && list.length > 0 && (
            <p className="text-muted mt-2 text-xs">
              Bez przypisanej grupy: {ungrouped.map((m) => m.username).join(', ')}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}
