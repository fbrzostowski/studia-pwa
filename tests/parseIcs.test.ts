import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseIcs, toCandidates } from '../src/features/schedule/parseIcs'

const text = readFileSync('tests/fixtures/plan.ics', 'utf8')
const { candidates, skipped } = toCandidates(parseIcs(text))
const by = (name: string) => candidates.filter((c) => c.name === name)

describe('parseIcs', () => {
  it('wczytuje wszystkie zdarzenia z polami USOS', () => {
    const ev = parseIcs(text)
    expect(ev).toHaveLength(10)
    expect(ev[0]).toMatchObject({ code: '100-D', name: 'Algebra', form: 'WYK', group: '1', room: 'A-1', start: '2026-10-01T09:50' })
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
