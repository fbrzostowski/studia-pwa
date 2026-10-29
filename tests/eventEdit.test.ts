import { describe, expect, it } from 'vitest'
import { draftOf, eventFromDraft, replaceEvent } from '../src/features/schedule/eventEdit'
import type { IcsEvent } from '../src/features/schedule/parseIcs'

const ev = (name: string, start = '2026-10-27T08:00'): IcsEvent => ({ code: 'X-1', name, form: 'CW', group: '4', room: 'G-205', start, end: start.slice(0, 11) + '09:40' })

describe('eventFromDraft', () => {
  const ok = { name: ' Mathematics ', form: 'WYK', group: ' 1 ', room: '', date: '2026-10-29', from: '09:50', to: '11:30' }
  it('buduje zajęcia, przycina tekst i pomija puste pola', () => {
    const r = eventFromDraft(ok, 'C-1')
    expect(r).toEqual({ event: { code: 'C-1', name: 'Mathematics', form: 'WYK', group: '1', start: '2026-10-29T09:50', end: '2026-10-29T11:30' } })
    expect('room' in (r as { event: IcsEvent }).event).toBe(false)
  })
  it('odrzuca błędne dane', () => {
    for (const bad of [
      { ...ok, name: '  ' },
      { ...ok, name: 'x'.repeat(201) },
      { ...ok, form: 'INNE' },
      { ...ok, date: '29.10.2026' },
      { ...ok, date: '2026-13-45' },
      { ...ok, from: '9:50' },
      { ...ok, to: '25:00' },
      { ...ok, to: '09:50' },
      { ...ok, to: '09:00' },
      { ...ok, group: 'g'.repeat(21) },
      { ...ok, room: 's'.repeat(101) },
    ]) expect('error' in eventFromDraft(bad), JSON.stringify(bad)).toBe(true)
  })
  it('draftOf i eventFromDraft są wzajemnie odwracalne', () => {
    const e = ev('Basics of Law')
    expect(eventFromDraft(draftOf(e), e.code)).toEqual({ event: e })
    expect(draftOf(undefined, '2026-11-02')).toMatchObject({ date: '2026-11-02', form: 'CW', name: '' })
  })
})

describe('replaceEvent', () => {
  const list = [ev('A'), ev('B'), ev('C')]
  it('zmienia, usuwa i dodaje bez ruszania oryginału', () => {
    expect(replaceEvent(list, 1, ev('B2')).map((e) => e.name)).toEqual(['A', 'B2', 'C'])
    expect(replaceEvent(list, 0, null).map((e) => e.name)).toEqual(['B', 'C'])
    expect(replaceEvent(list, -1, ev('D')).map((e) => e.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(replaceEvent(list, -1, null)).toEqual(list)
    expect(list.map((e) => e.name)).toEqual(['A', 'B', 'C'])
  })
})
