import type { IcsEvent } from './parseIcs'

export const EVENT_FORMS = ['WYK', 'CW', 'KON', 'LAB'] as const

export interface EventDraft {
  name: string
  form: string
  group: string
  room: string
  date: string // YYYY-MM-DD
  from: string // HH:mm
  to: string
}

export const draftOf = (e?: IcsEvent, date = ''): EventDraft => ({
  name: e?.name ?? '',
  form: e?.form ?? 'CW',
  group: e?.group ?? '',
  room: e?.room ?? '',
  date: e ? e.start.slice(0, 10) : date,
  from: e ? e.start.slice(11, 16) : '',
  to: e ? e.end.slice(11, 16) : '',
})

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Zajęcia z formularza (bez pustych pól, bo Firestore nie przyjmuje undefined) albo komunikat błędu.
 * `code` (sygnatura z USOS) zostaje taki jak w edytowanych zajęciach.
 */
export function eventFromDraft(d: EventDraft, code = ''): { event: IcsEvent } | { error: string } {
  const name = d.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 200) return { error: 'Podaj nazwę zajęć (do 200 znaków).' }
  if (!(EVENT_FORMS as readonly string[]).includes(d.form)) return { error: 'Wybierz formę zajęć.' }
  if (!DATE.test(d.date) || Number.isNaN(Date.parse(d.date))) return { error: 'Podaj poprawną datę.' }
  if (!TIME.test(d.from) || !TIME.test(d.to)) return { error: 'Podaj godziny w formacie GG:MM.' }
  if (d.to <= d.from) return { error: 'Koniec zajęć musi być po ich początku.' }
  const group = d.group.trim()
  const room = d.room.trim()
  if (group.length > 20 || room.length > 100) return { error: 'Grupa (do 20 znaków) lub sala (do 100) jest za długa.' }
  return {
    event: {
      code,
      name,
      form: d.form,
      ...(group ? { group } : {}),
      ...(room ? { room } : {}),
      start: `${d.date}T${d.from}`,
      end: `${d.date}T${d.to}`,
    },
  }
}

/** Lista zajęć po zmianie jednego (index), usunięciu (event = null) albo dodaniu (index = -1). */
export function replaceEvent(events: IcsEvent[], index: number, event: IcsEvent | null): IcsEvent[] {
  if (index < 0) return event ? [...events, event] : events
  return event ? events.map((e, i) => (i === index ? event : e)) : events.filter((_, i) => i !== index)
}

/** Zajęcia bez pustych pól (Firestore nie przyjmuje undefined, a puste wartości tylko zajmują miejsce). */
export const compactEvents = (events: IcsEvent[]): IcsEvent[] =>
  events.map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== '')) as unknown as IcsEvent)
