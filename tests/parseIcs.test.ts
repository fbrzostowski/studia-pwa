import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classKey, normGroup, parseIcs, summarizeClasses, toCandidates } from '../src/features/schedule/parseIcs'

const text = readFileSync('tests/fixtures/plan.ics', 'utf8')
const { candidates, skipped } = toCandidates(parseIcs(text))
const by = (name: string) => candidates.filter((c) => c.name === name)

describe('parseIcs', () => {
  it('wczytuje wszystkie zdarzenia z polami USOS', () => {
    const ev = parseIcs(text)
    expect(ev).toHaveLength(10)
    expect(ev[0]).toMatchObject({ code: '100-D', name: 'Algebra', form: 'WYK', group: '1', room: 'A-1', start: '2026-10-01T09:50', end: '2026-10-01T11:30' })
  })
  it('radzi sobie z brakiem sali i z escape\'owanymi przecinkami', () => {
    const ev = parseIcs(text)
    expect(ev.find((e) => e.code === '300-D')?.room).toBeUndefined()
    expect(ev.find((e) => e.code === '200-D')?.name).toBe('Historia, część I')
  })
  it('rozwija zawinięte linie i obsługuje CRLF oraz BOM', () => {
    const crlf = '﻿' + text.replace(/\n/g, '\r\n')
    expect(parseIcs(crlf).find((e) => e.code === '600-D')?.name).toBe('Bardzo długa nazwa przedmiotu zawinięta w drugiej linii')
    expect(parseIcs(crlf)).toHaveLength(10)
  })
  it('zwraca pustą listę dla pliku, który nie jest planem', () => {
    expect(parseIcs('hello')).toEqual([])
  })
})

describe('toCandidates', () => {
  it('wykład + ćwiczenia pod jedną sygnaturą to jeden przedmiot WYK+CW', () => {
    expect(by('Algebra')).toHaveLength(1)
    expect(by('Algebra')[0]).toMatchObject({ kind: 'WYK+CW', count: 3, firstDate: '2026-10-01', lastDate: '2026-10-08' })
  })
  it('konwersatorium + ćwiczenia to KON+CW', () => {
    expect(by('Historia, część I')[0].kind).toBe('KON+CW')
  })
  it('pojedyncza forma daje własny rodzaj', () => {
    expect(by('Informatyka')[0].kind).toBe('LAB')
    expect(by('Bardzo długa nazwa przedmiotu zawinięta w drugiej linii')[0].kind).toBe('CW')
  })
  it('kombinacja bez odpowiednika (WYK+LAB) rozpada się na osobne przedmioty', () => {
    expect(by('Fizyka').map((c) => c.kind).sort()).toEqual(['LAB', 'WYK'])
    expect(new Set(by('Fizyka').map((c) => c.key)).size).toBe(2)
  })
  it('nieobsługiwane formy są pomijane i zgłaszane', () => {
    expect(by('Lektorat')).toHaveLength(0)
    expect(skipped).toEqual([{ name: 'Lektorat', form: 'LEKT', count: 1 }])
  })
})

describe('summarizeClasses', () => {
  const events = parseIcs(text)
  const of = (code: string) => summarizeClasses(events.filter((e) => e.code === code))

  it('wykład i ćwiczenia z jednego przedmiotu to osobne grupy z własnym terminem i salą', () => {
    expect(of('100-D')).toEqual([
      { form: 'CW', group: '15', when: ['pt 11:40–13:15'], rooms: ['B-2'] },
      { form: 'WYK', group: '1', when: ['cz 09:50–11:30'], rooms: ['A-1'] },
    ])
  })
  it('brak sali daje pustą listę, a nie undefined', () => {
    expect(of('300-D')[0].rooms).toEqual([])
  })
  it('ta sama grupa w kilku dniach tygodnia zbiera terminy w kolejności pn→nd', () => {
    const ev = ['2026-10-06', '2026-10-09', '2026-10-13'].map((d) => ({
      code: 'X', name: 'X', form: 'CW', group: '4', room: 'S-1', start: `${d}T08:00`, end: `${d}T09:40`,
    }))
    expect(summarizeClasses(ev)[0].when).toEqual(['wt 08:00–09:40', 'pt 08:00–09:40'])
  })
  it('różne sale tej samej grupy są zebrane bez duplikatów', () => {
    const ev = ['2026-10-05', '2026-10-12', '2026-10-19'].map((d, i) => ({
      code: 'X', name: 'X', form: 'WYK', group: '3', room: i === 1 ? 'G-316' : 'G-Aula', start: `${d}T09:50`, end: `${d}T11:30`,
    }))
    const [c] = summarizeClasses(ev)
    expect(c.when).toEqual(['pn 09:50–11:30'])
    expect(c.rooms.sort()).toEqual(['G-316', 'G-Aula'])
  })
})

describe('klucze grup', () => {
  it('normGroup czyści znaki niedozwolone w id i obsługuje brak grupy', () => {
    expect(normGroup('4')).toBe('4')
    expect(normGroup(' 15, ')).toBe('15_')
    expect(normGroup(undefined)).toBe('_')
    expect(normGroup('')).toBe('_')
  })
  it('classKey jest stabilny i różny dla różnych grup', () => {
    expect(classKey('abc', 'CW', '15')).toBe('abc_CW_15')
    expect(classKey('abc', 'CW', '15')).not.toBe(classKey('abc', 'CW', '16'))
    expect(classKey('abc', 'WYK', '15')).not.toBe(classKey('abc', 'CW', '15'))
  })
})
