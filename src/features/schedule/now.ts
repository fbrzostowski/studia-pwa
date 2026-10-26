import type { IcsEvent } from './parseIcs'

/** Czy zajęcia trwają o danej chwili (`now` jako lokalny czas YYYY-MM-DDTHH:mm; początek włącznie, koniec wyłącznie). */
export const isOngoing = (e: Pick<IcsEvent, 'start' | 'end'>, now: string) => e.start <= now && now < e.end

/** Zajęcia z planu trwające teraz, od najwcześniej rozpoczętych. */
export const ongoingEvents = (events: IcsEvent[], now: string) =>
  events.filter((e) => isOngoing(e, now)).sort((a, b) => a.start.localeCompare(b.start))
