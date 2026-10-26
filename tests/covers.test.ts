import { describe, expect, it } from 'vitest'
import * as server from '../functions/src/covers'
import * as client from '../src/features/textbooks/cover'
import { cropRect, fitText, hashString, paletteIndexFor, PALETTES, wrapLines } from '../src/features/textbooks/cover'

// miara tekstu: każdy znak ma szerokość `size`/2, więc zawijanie da się policzyć bez canvasa
const measureAt = (size: number) => (s: string) => s.length * (size / 2)

describe('stałe okładki', () => {
  it('są takie same w aplikacji i w funkcjach', () => {
    expect(client.MAX_COVER_CHARS).toBe(server.MAX_COVER_CHARS)
    expect(client.COVER_PREFIX).toBe(server.COVER_PREFIX)
  })
})

describe('validCover (serwer)', () => {
  const jpeg = `${server.COVER_PREFIX}/9j/4AAQSkZJRgABAQ`
  it('akceptuje brak okładki jako pusty tekst', () => {
    for (const v of [undefined, null, '']) expect(server.validCover(v)).toBe('')
  })
  it('akceptuje poprawny JPEG w limicie', () => {
    expect(server.validCover(jpeg)).toBe(jpeg)
  })
  it('odrzuca inny typ, brak prefiksu, znaki spoza base64 i brak sygnatury JPEG', () => {
    expect(server.validCover('data:image/png;base64,iVBORw0KGgo')).toBeNull()
    expect(server.validCover('/9j/4AAQ')).toBeNull()
    expect(server.validCover(`${server.COVER_PREFIX}/9j/<script>alert(1)</script>`)).toBeNull()
    expect(server.validCover(`${server.COVER_PREFIX}iVBORw0KGgoAAAA`)).toBeNull() // PNG w kopercie JPEG
    expect(server.validCover(42)).toBeNull()
  })
  it('odrzuca zbyt dużą okładkę', () => {
    expect(server.validCover(jpeg + 'A'.repeat(server.MAX_COVER_CHARS))).toBeNull()
  })
})

describe('cropRect', () => {
  it('szeroki obraz: wycina środek w poziomie', () => {
    const r = cropRect(1000, 400, 0.75)
    expect(r.sw / r.sh).toBeCloseTo(0.75, 5)
    expect(r.sx).toBeCloseTo((1000 - 300) / 2, 5)
    expect(r.sy).toBe(0)
  })
  it('wysoki obraz: środek w pionie, a dla stron PDF od góry', () => {
    expect(cropRect(300, 1000, 0.75).sy).toBeCloseTo((1000 - 400) / 2, 5)
    expect(cropRect(300, 1000, 0.75, true).sy).toBe(0)
  })
  it('obraz o proporcjach okładki nie jest przycinany', () => {
    expect(cropRect(240, 320)).toEqual({ sx: 0, sy: 0, sw: 240, sh: 320 })
  })
})

describe('wrapLines', () => {
  it('zawija po słowach do podanej szerokości', () => {
    expect(wrapLines('ala ma kota i psa', 40, measureAt(10), 9)).toEqual(['ala ma', 'kota i', 'psa'])
  })
  it('łamie zbyt długie słowo', () => {
    const lines = wrapLines('Nieprawdopodobnie', 50, measureAt(10), 9)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join('')).toBe('Nieprawdopodobnie')
    for (const l of lines) expect(measureAt(10)(l)).toBeLessThanOrEqual(50)
  })
  it('ucina nadmiar wielokropkiem w ostatniej dozwolonej linii', () => {
    const lines = wrapLines('jeden dwa trzy cztery pięć sześć siedem', 40, measureAt(10), 2)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(measureAt(10)(lines[1])).toBeLessThanOrEqual(40)
  })
  it('pusty tekst daje pustą listę', () => {
    expect(wrapLines('   ', 100, measureAt(10), 3)).toEqual([])
  })
})

describe('fitText', () => {
  it('krótki tytuł dostaje największą czcionkę, długi mniejszą', () => {
    const short = fitText('Algebra', 180, 190, measureAt)
    const long = fitText('Wprowadzenie do mikroekonomii i teorii decyzji konsumenckich', 180, 190, measureAt)
    expect(short.size).toBe(30)
    expect(long.size).toBeLessThan(short.size)
  })
  it('tytuł, który się nie mieści nawet w minimalnej czcionce, jest ucinany do dostępnej wysokości', () => {
    const r = fitText('słowo '.repeat(200), 180, 60, measureAt)
    expect(r.size).toBe(14)
    expect(r.lines.length).toBeLessThanOrEqual(Math.floor(60 / (14 * 1.22)))
    expect(r.lines[r.lines.length - 1].endsWith('…')).toBe(true)
  })
})

describe('paleta', () => {
  it('ten sam tytuł zawsze daje ten sam kolor, niezależnie od wielkości liter i spacji na brzegach', () => {
    expect(paletteIndexFor('Calculus')).toBe(paletteIndexFor('  calculus '))
    expect(paletteIndexFor('x')).toBeGreaterThanOrEqual(0)
    expect(paletteIndexFor('x')).toBeLessThan(PALETTES.length)
  })
  it('różne tytuły rozkładają się na różne kolory', () => {
    const used = new Set(['Algebra', 'Mikroekonomia', 'Prawo', 'Statystyka', 'Historia', 'Fizyka', 'Chemia', 'Geografia'].map(paletteIndexFor))
    expect(used.size).toBeGreaterThan(3)
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})
