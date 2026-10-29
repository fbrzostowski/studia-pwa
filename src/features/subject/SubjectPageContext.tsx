import { createContext, useContext, type ReactNode } from 'react'
import type { PlanPerson } from '../schedule/useSharedPlans'

/**
 * Otwiera stronę przedmiotu (o danym id) z dowolnego miejsca aplikacji; dostarcza ją panel w App.
 * Z `person` strona pokazuje dane tej osoby (jej plan, grupy), np. gdy oglądasz cudzy plan.
 */
const OpenSubjectCtx = createContext<(id: string, person?: PlanPerson) => void>(() => {})
export const SubjectPageProvider = OpenSubjectCtx.Provider
export const useOpenSubjectPage = () => useContext(OpenSubjectCtx)

/** Nazwa przedmiotu jako link do jego strony (do list i wierszy, gdzie jest sam tekst). */
export function SubjectLink({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  const open = useOpenSubjectPage()
  if (!id) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      className={`hover:text-accent text-left underline-offset-2 hover:underline ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        open(id)
      }}
      title="Strona przedmiotu"
    >
      {children}
    </button>
  )
}

/** Mały przycisk „strona przedmiotu” w rogu kafelka (kafelek sam ma inną akcję). Rodzic musi mieć `relative`. */
export function SubjectShortcut({ id, name }: { id?: string; name: string }) {
  const open = useOpenSubjectPage()
  if (!id) return null
  return (
    <button
      type="button"
      className="text-muted hover:text-accent hover:bg-accent-soft absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full"
      aria-label={`Strona przedmiotu: ${name}`}
      title="Strona przedmiotu"
      onClick={() => open(id)}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    </button>
  )
}
