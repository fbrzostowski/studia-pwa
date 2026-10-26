import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { animate, motionValue, type AnimationPlaybackControls } from 'motion'
import { decideRelease, releaseVelocity, rubberband } from './sheetLogic'

// Arkusz (telefon: wysuwany od dołu, komputer: okno na środku). Ruch wg wytycznych apple-design:
// sprężyna bez odbicia przy otwieraniu, przeciąganie 1:1, przekazanie prędkości puszczenia do sprężyny,
// przerywalność (złapanie arkusza w locie przejmuje go od bieżącej pozycji) i gumowanie górnej granicy.

const SheetContext = createContext<{ setLocked: (locked: boolean) => void } | null>(null)

/** Formularz w arkuszu woła to na czas operacji, której nie wolno przerwać (np. wgrywanie pliku). */
export function useSheetLock(locked: boolean) {
  const ctx = useContext(SheetContext)
  useEffect(() => {
    ctx?.setLocked(locked)
    return () => ctx?.setLocked(false)
  }, [ctx, locked])
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export default function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  // Zawartość zamrażamy na czas animacji zamykania, bo rodzic zwykle już ją usunął.
  const lastChildren = useRef(children)
  const lastTitle = useRef(title)
  if (open) {
    lastChildren.current = children
    lastTitle.current = title
  }
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  if (!open && !mounted) return null
  return (
    <Panel title={lastTitle.current} closing={!open} onClose={onClose} onExited={() => setMounted(false)}>
      {lastChildren.current}
    </Panel>
  )
}

function Panel({
  title,
  closing,
  onClose,
  onExited,
  children,
}: {
  title: string
  closing: boolean
  onClose: () => void
  onExited: () => void
  children: ReactNode
}) {
  const wide = useMediaQuery('(min-width: 640px)')
  const reduce = useMediaQuery('(prefers-reduced-motion: reduce)')
  const slides = !wide && !reduce // tylko tu ruch jest sprężyną sterowaną gestem
  const [locked, setLocked] = useState(false)
  const ctx = useMemo(() => ({ setLocked }), [])
  const titleId = useId()

  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const y = useRef(motionValue(0)).current // aktualne przesunięcie arkusza w px (to, co widać na ekranie)
  const anim = useRef<AnimationPlaybackControls | null>(null)
  const exitVelocity = useRef(0)
  const drag = useRef<{ startY: number; startOffset: number; samples: { t: number; y: number }[] } | null>(null)

  const requestClose = () => {
    if (!locked) onClose()
  }

  // przesunięcie → DOM; tło ciemnieje proporcjonalnie do tego, ile arkusza jest widać (ciągła informacja zwrotna)
  useLayoutEffect(() => {
    const apply = (v: number) => {
      const panel = panelRef.current
      if (!panel || !slides) return
      panel.style.transform = `translate3d(0, ${v}px, 0)`
      const h = panel.offsetHeight || window.innerHeight
      if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.max(v, 0) / h)))
    }
    return y.on('change', apply)
  }, [y, slides])

  // wejście: start dokładnie poza ekranem, sprężyna krytycznie tłumiona (bez odbicia)
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (!slides) {
      y.set(0)
      return
    }
    y.set(panel.offsetHeight)
    anim.current = animate(y, 0, { type: 'spring', bounce: 0, duration: 0.4 })
    return () => anim.current?.stop()
  }, [slides, y])

  // wyjście: z bieżącej pozycji i z prędkością puszczenia palca (bez „szwu” między gestem a animacją)
  useEffect(() => {
    if (!closing) return
    if (!slides) {
      const t = setTimeout(onExited, reduce ? 130 : 150)
      return () => clearTimeout(t)
    }
    anim.current?.stop()
    const h = panelRef.current?.offsetHeight ?? window.innerHeight
    const a = animate(y, h, { type: 'spring', bounce: 0, duration: 0.35, velocity: exitVelocity.current })
    anim.current = a
    void a.then(onExited)
    return () => a.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing])

  // focus, przywracanie focusu i blokada przewijania strony pod arkuszem
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      requestClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // --- przeciąganie za uchwyt i nagłówek (zawartość przewija się normalnie) ---
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!slides || locked || closing || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    anim.current?.stop() // przerwanie: nowy ruch zaczyna od tego, co jest teraz na ekranie
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, startOffset: y.get(), samples: [{ t: e.timeStamp, y: e.clientY }] }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const panel = panelRef.current
    if (!d || !panel) return
    const offset = d.startOffset + (e.clientY - d.startY) // 1:1, z zachowaniem miejsca chwytu
    y.set(offset >= 0 ? offset : -rubberband(-offset, panel.offsetHeight))
    d.samples.push({ t: e.timeStamp, y: e.clientY })
    if (d.samples.length > 12) d.samples.shift()
  }

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current
    const panel = panelRef.current
    if (!d || !panel) return
    drag.current = null
    const velocity = cancelled ? 0 : releaseVelocity(d.samples, e.timeStamp)
    const verdict = decideRelease({ offset: y.get(), velocity, height: panel.offsetHeight })
    if (verdict === 'dismiss') {
      exitVelocity.current = velocity
      onClose()
    } else {
      // po geście z pędem dopuszczamy lekkie odbicie (wytyczne: bounce tylko gdy gest niósł pęd)
      anim.current = animate(y, 0, { type: 'spring', bounce: 0.2, duration: 0.4, velocity })
    }
  }

  const motionClass = slides ? '' : closing ? 'sheet-out' : 'sheet-in'

  return (
    <SheetContext.Provider value={ctx}>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onKeyDown={onKeyDown}>
        <div
          ref={scrimRef}
          className={`absolute inset-0 bg-black/45 ${slides ? '' : closing ? 'scrim-out' : 'scrim-in'}`}
          onClick={requestClose}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`sheet-panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl outline-none sm:max-w-lg sm:rounded-2xl ${motionClass}`}
          style={slides ? { transform: `translate3d(0, ${y.get()}px, 0)` } : undefined}
        >
          <div
            className={`shrink-0 select-none ${slides ? 'touch-none' : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => finishDrag(e, false)}
            onPointerCancel={(e) => finishDrag(e, true)}
          >
            <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
              <span className="bg-line h-1.5 w-10 rounded-full" />
            </div>
            <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3 sm:pt-4">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <button className="btn-ghost -mr-2 px-2.5" onClick={requestClose} disabled={locked} aria-label="Zamknij">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
          <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </div>
      </div>
    </SheetContext.Provider>
  )
}
