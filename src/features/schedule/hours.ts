import type { IcsEvent } from './parseIcs'

/** Godzina dydaktyczna na uczelni trwa 45 minut. */
export const ACADEMIC_MINUTES = 45

type Span = Pick<IcsEvent, 'start' | 'end'>

const utc = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN
}

/** Długość zajęć w minutach (czas lokalny z planu, bez stref); uszkodzony lub ujemny przedział daje 0. */
export const lessonMinutes = (e: Span) => {
  const d = (utc(e.end) - utc(e.start)) / 60_000
  return Number.isFinite(d) && d > 0 ? d : 0
}

export interface HoursPart {
  count: number
  minutes: number
  doneCount: number // zajęcia zakończone przed `now`
  doneMinutes: number
}

export interface HoursSummary extends HoursPart {
  byForm: ({ form: string } & HoursPart)[]
  first?: string // data pierwszych zajęć YYYY-MM-DD
  last?: string
  next?: IcsEvent // najbliższe zajęcia, które jeszcze się nie zakończyły
}

const empty = (): HoursPart => ({ count: 0, minutes: 0, doneCount: 0, doneMinutes: 0 })

/** Godziny zajęć przedmiotu w całym semestrze (z planu): razem, według formy i ile już się odbyło. */
export function summarizeHours(events: IcsEvent[], now: string): HoursSummary {
  const total = empty()
  const forms = new Map<string, HoursPart>()
  for (const e of events) {
    const min = lessonMinutes(e)
    const f = forms.get(e.form) ?? empty()
    for (const p of [total, f]) {
      p.count++
      p.minutes += min
      if (e.end <= now) {
        p.doneCount++
        p.doneMinutes += min
      }
    }
    forms.set(e.form, f)
  }
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start))
  return {
    ...total,
    byForm: [...forms.entries()].map(([form, p]) => ({ form, ...p })).sort((a, b) => a.form.localeCompare(b.form)),
    first: sorted[0]?.start.slice(0, 10),
    last: sorted[sorted.length - 1]?.start.slice(0, 10),
    next: sorted.find((e) => e.end > now),
  }
}

const trim = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** 90 → „1,5 h”, 120 → „2 h”. */
export const fmtHours = (minutes: number) => `${trim(minutes / 60)} h`

/** 90 → „2” (godz. dydaktyczne po 45 min), 100 → „2,2”. */
export const academicHours = (minutes: number) => trim(minutes / ACADEMIC_MINUTES)
