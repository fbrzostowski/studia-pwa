import { useEffect, useState, type FormEvent } from 'react'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../firebase/AuthContext'
import type { ExamSection } from './logic'
import { defaultListName, itemsFromMaterials, progress, syncWithMaterials, type TodoItem, type TodoList } from './todo'
import { fetchMaterials, useTodoLists } from './useTodoLists'

type Section = Pick<ExamSection, 'key' | 'name' | 'subjects'>

function NewList({ sections, onDone }: { sections: Section[]; onDone: () => void }) {
  const { user } = useAuth()
  const [key, setKey] = useState(sections[0]?.key ?? '')
  const section = sections.find((s) => s.key === key)
  const [name, setName] = useState(section ? defaultListName(section.name) : '')
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ile materiałów trafi na listę (podgląd dla wybranego przedmiotu)
  useEffect(() => {
    let live = true
    setCount(null)
    if (section) fetchMaterials(section.subjects.map((s) => s.id)).then((m) => live && setCount(m.length)).catch(() => live && setCount(0))
    return () => {
      live = false
    }
  }, [section])

  const pick = (k: string) => {
    const next = sections.find((s) => s.key === k)
    // nazwę podmieniamy tylko, jeśli użytkownik nie zmienił jej ręcznie
    if (next && (!name || (section && name === defaultListName(section.name)))) setName(defaultListName(next.name))
    setKey(k)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!section || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const materials = await fetchMaterials(section.subjects.map((s) => s.id))
      await addDoc(collection(db, 'todoLists'), {
        ownerId: user!.uid,
        name: name.trim().slice(0, 100),
        subjectId: section.subjects[0].id,
        items: itemsFromMaterials(materials).slice(0, 300),
        createdAt: serverTimestamp(),
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card mt-3 space-y-3 p-3">
      <select className="input" value={key} onChange={(e) => pick(e.target.value)} aria-label="Przedmiot">
        {sections.map((s) => (
          <option key={s.key} value={s.key}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        required
        className="input"
        placeholder="Nazwa listy"
        maxLength={100}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <p className="text-muted text-xs">
        {count === null
          ? 'Sprawdzam materiały przedmiotu…'
          : count === 0
            ? 'Ten przedmiot nie ma jeszcze materiałów — lista będzie pusta, punkty możesz dodać ręcznie.'
            : `Lista wypełni się tytułami materiałów przedmiotu (${count}). Odznaczysz te, które już opanowałeś.`}
      </p>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy || !section || !name.trim()} className="btn-primary">
          {busy ? 'Tworzę…' : 'Utwórz listę'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Anuluj
        </button>
      </div>
    </form>
  )
}

function TodoCard({ list, subjectIds, subjectName }: { list: TodoList; subjectIds: string[]; subjectName?: string }) {
  const [hideDone, setHideDone] = useState(false)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { done, total, percent } = progress(list.items)

  const save = (items: TodoItem[]) =>
    updateDoc(doc(db, 'todoLists', list.id), { items, updatedAt: serverTimestamp() }).catch((e) => setError(e.message))

  const toggle = (id: string) => save(list.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  const remove = (id: string) => save(list.items.filter((i) => i.id !== id))

  const add = (e: FormEvent) => {
    e.preventDefault()
    const title = text.trim()
    if (!title || list.items.length >= 300) return
    setText('')
    return save([...list.items, { id: crypto.randomUUID(), title, done: false }])
  }

  const refresh = async () => {
    setMsg(null)
    setError(null)
    try {
      const r = syncWithMaterials(list.items, await fetchMaterials(subjectIds))
      await save(r.items.slice(0, 300))
      setMsg(r.added || r.removed ? `Dodano ${r.added}, usunięto ${r.removed}.` : 'Lista jest aktualna.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const removeList = async () => {
    if (!confirm(`Usunąć listę „${list.name}”?`)) return
    await deleteDoc(doc(db, 'todoLists', list.id)).catch((e) => setError(e.message))
  }

  const shown = hideDone ? list.items.filter((i) => !i.done) : list.items

  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold break-words">{list.name}</h4>
          {subjectName && <p className="text-muted text-xs">{subjectName}</p>}
        </div>
        <span className={`badge shrink-0 ${percent === 100 && total > 0 ? 'bg-emerald-600 text-white' : 'bg-accent-soft text-accent'}`}>
          {done}/{total}
        </span>
      </div>

      <div
        className="bg-bg mt-3 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Opanowane: ${done} z ${total}`}
      >
        <div className="bg-accent h-full rounded-full transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ul className="mt-2">
        {shown.map((i) => (
          <li key={i.id} className="border-line flex items-start gap-3 border-b py-2.5 last:border-b-0">
            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="accent-accent mt-0.5 h-5 w-5 shrink-0"
                checked={i.done}
                onChange={() => toggle(i.id)}
              />
              <span className={`min-w-0 break-words ${i.done ? 'text-muted line-through' : ''}`}>
                {i.title}
                {!i.materialId && <span className="text-muted ml-1.5 text-xs no-underline">(własny)</span>}
              </span>
            </label>
            <button className="btn-ghost -my-1 -mr-2 px-2 text-xs" onClick={() => remove(i.id)} aria-label={`Usuń punkt: ${i.title}`}>
              ×
            </button>
          </li>
        ))}
        {shown.length === 0 && (
          <li className="text-muted py-3 text-sm">
            {list.items.length === 0 ? 'Pusta lista — dodaj punkt albo odśwież z materiałów.' : 'Wszystko opanowane. 🎉'}
          </li>
        )}
      </ul>

      <form onSubmit={add} className="mt-2 flex gap-2">
        <input
          className="input min-w-0 flex-1 py-2"
          placeholder="Dodaj własny punkt"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-secondary" disabled={!text.trim()}>
          Dodaj
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <label className="text-muted mr-auto flex items-center gap-2 text-xs">
          <input type="checkbox" className="accent-accent h-4 w-4" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Ukryj opanowane
        </label>
        <button className="btn-ghost" onClick={refresh}>
          Odśwież z materiałów
        </button>
        <button className="btn-danger" onClick={removeList}>
          Usuń listę
        </button>
      </div>
      {msg && <p className="text-muted mt-1 text-xs">{msg}</p>}
      {error && <p className="text-danger mt-1 text-sm">{error}</p>}
    </li>
  )
}

/** Prywatne listy do nauki: punkty z tytułów materiałów przedmiotu, odznaczane jako opanowane (per użytkownik). */
export default function TodoLists({ sections }: { sections: Section[] }) {
  const { lists, error } = useTodoLists()
  const [creating, setCreating] = useState(false)
  const bySubject = new Map(sections.flatMap((s) => s.subjects.map((x) => [x.id, s] as const)))

  return (
    <div>
      {error && <p className="text-danger mb-3 text-sm">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-sm">Prywatne listy — widzisz je tylko Ty.</p>
        <button className="btn-secondary" disabled={sections.length === 0} onClick={() => setCreating((v) => !v)}>
          + Lista
        </button>
      </div>

      {creating && <NewList sections={sections} onDone={() => setCreating(false)} />}

      {lists === null ? (
        <p className="text-muted mt-4">Ładowanie…</p>
      ) : lists.length === 0 ? (
        <p className="border-line text-muted mt-4 rounded-2xl border border-dashed p-8 text-center text-sm">
          Nie masz jeszcze list do nauki. Utwórz listę — wypełni się tytułami materiałów wybranego przedmiotu, a Ty
          odznaczysz to, co już opanowałeś.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {lists.map((l) => {
            const sec = l.subjectId ? bySubject.get(l.subjectId) : undefined
            return (
              <TodoCard
                key={l.id}
                list={l}
                subjectIds={sec ? sec.subjects.map((s) => s.id) : l.subjectId ? [l.subjectId] : []}
                subjectName={sec?.name}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}
