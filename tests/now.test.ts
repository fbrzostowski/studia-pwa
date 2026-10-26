import { describe, expect, it } from 'vitest'
import { isOngoing, ongoingEvents } from '../src/features/schedule/now'
import type { IcsEvent } from '../src/features/schedule/parseIcs'

const ev = (name: string, start: string, end: string): IcsEvent => ({ code: name, name, form: 'WYK', start, end })

describe('isOngoing', () => {
  const e = ev('A', '2026-10-22T09:50', '2026-10-22T11:30')
  it('początek jest włączony, koniec wyłączony', () => {
    expect(isOngoing(e, '2026-10-22T09:49')).toBe(false)
    expect(isOngoing(e, '2026-10-22T09:50')).toBe(true)
    expect(isOngoing(e, '2026-10-22T11:29')).toBe(true)
    expect(isOngoing(e, '2026-10-22T11:30')).toBe(false)
  })
  it('nie myli dni: ta sama godzina innego dnia to nie „teraz”', () => {
    expect(isOngoing(e, '2026-10-23T10:30')).toBe(false)
    expect(isOngoing(e, '2026-10-21T10:30')).toBe(false)
  })
})

describe('ongoingEvents', () => {
  const events = [
    ev('Późniejsze', '2026-10-22T10:30', '2026-10-22T12:00'),
    ev('Wcześniejsze', '2026-10-22T09:50', '2026-10-22T11:30'),
    ev('Minione', '2026-10-22T08:00', '2026-10-22T09:40'),
    ev('Jutro', '2026-10-23T10:00', '2026-10-23T11:30'),
  ]
  it('zwraca tylko trwające, od najwcześniej rozpoczętych (także gdy się nakładają)', () => {
    expect(ongoingEvents(events, '2026-10-22T10:45').map((e) => e.name)).toEqual(['Wcześniejsze', 'Późniejsze'])
  })
  it('poza zajęciami i przy pustym planie lista jest pusta', () => {
    expect(ongoingEvents(events, '2026-10-22T20:00')).toEqual([])
    expect(ongoingEvents([], '2026-10-22T10:00')).toEqual([])
  })
})
