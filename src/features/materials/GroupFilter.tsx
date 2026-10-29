import { useEffect, useRef, useState } from 'react'
import { scopeTitle, sameScope, type Scope } from '../exams/groups'
import { groupFilterLabel } from './filters'

/**
 * Krótka lista rozwijana z wyborem wielu grup. Pusty wybór = wszystkie grupy.
 * Zamyka się po kliknięciu poza nią i klawiszem Esc.
 */
export default function GroupFilter({
  groups,
  mine,
  selected,
  onChange,
}: {
  groups: Scope[]
  mine: Scope[]
  selected: Scope[]
  onChange: (next: Scope[]) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (groups.length === 0) return null
  const has = (g: Scope) => selected.some((s) => sameScope(s, g))
  const toggle = (g: Scope) => onChange(has(g) ? selected.filter((s) => !sameScope(s, g)) : [...selected, g])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        className="input flex min-h-10 items-center justify-between gap-2 py-1.5 text-left text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtr grup"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{groupFilterLabel(selected, scopeTitle)}</span>
        <svg viewBox="0 0 24 24" className="text-muted h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="card absolute z-20 mt-1 max-h-72 w-full min-w-56 overflow-auto p-1.5 shadow-lg" role="listbox" aria-multiselectable="true" aria-label="Grupy">
          <button type="button" className="hover:bg-accent-soft w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium" onClick={() => onChange([])}>
            Wszystkie grupy
          </button>
          {mine.length > 0 && (
            <button type="button" className="hover:bg-accent-soft w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium" onClick={() => onChange(mine)}>
              Tylko moje grupy
            </button>
          )}
          <div className="border-line my-1 border-t" />
          {groups.map((g) => (
            <label key={`${g.form}|${g.group}`} className="hover:bg-accent-soft flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4 shrink-0" checked={has(g)} onChange={() => toggle(g)} />
              <span className="min-w-0 flex-1">{scopeTitle(g)}</span>
              {mine.some((m) => sameScope(m, g)) && <span className="badge bg-accent-soft text-accent">moja</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
