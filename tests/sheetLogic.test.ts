import { describe, expect, it } from 'vitest'
import { decideRelease, project, releaseVelocity, rubberband } from '../src/components/sheetLogic'

describe('project', () => {
  it('rzutuje pęd wykładniczo (0.998): 1000 px/s ≈ 499 px', () => {
    expect(project(1000)).toBeCloseTo(499, 0)
    expect(project(0)).toBe(0)
    expect(project(-500)).toBeCloseTo(-249.5, 0)
  })
  it('szybsze zanikanie daje krótszy zasięg', () => {
    expect(project(1000, 0.99)).toBeLessThan(project(1000, 0.998))
  })
})

describe('rubberband', () => {
  it('im dalej za granicą, tym mniejszy przyrost, i nigdy nie przekracza wymiaru', () => {
    const a = rubberband(50, 500)
    const b = rubberband(100, 500)
    const c = rubberband(1000, 500)
    expect(a).toBeLessThan(50)
    expect(b - a).toBeLessThan(a)
    expect(c).toBeLessThan(500)
    expect(rubberband(0, 500)).toBe(0)
  })
})

describe('releaseVelocity', () => {
  it('liczy px/s z próbek z ostatnich 100 ms', () => {
    const s = [{ t: 0, y: 0 }, { t: 50, y: 25 }, { t: 100, y: 50 }]
    expect(releaseVelocity(s, 100)).toBeCloseTo(500, 5)
  })
  it('gdy palec stał przed puszczeniem albo jest za mało próbek, prędkość to 0', () => {
    expect(releaseVelocity([{ t: 0, y: 0 }, { t: 40, y: 80 }], 400)).toBe(0)
    expect(releaseVelocity([{ t: 10, y: 5 }], 20)).toBe(0)
    expect(releaseVelocity([], 0)).toBe(0)
  })
  it('ignoruje starsze próbki spoza okna', () => {
    const s = [{ t: 0, y: 0 }, { t: 500, y: 100 }, { t: 550, y: 100 }]
    expect(releaseVelocity(s, 560)).toBe(0)
  })
})

describe('decideRelease', () => {
  const h = 500
  it('szybki ruch w dół zamyka nawet z małego przesunięcia', () => {
    expect(decideRelease({ offset: 30, velocity: 1200, height: h })).toBe('dismiss')
  })
  it('szybki ruch w górę cofa, choć arkusz jest nisko', () => {
    expect(decideRelease({ offset: 400, velocity: -600, height: h })).toBe('snap')
  })
  it('wolne puszczenie: decyduje rzutowany punkt spoczynku (ponad połowa wysokości)', () => {
    expect(decideRelease({ offset: 60, velocity: 0, height: h })).toBe('snap')
    expect(decideRelease({ offset: 260, velocity: 0, height: h })).toBe('dismiss')
    expect(decideRelease({ offset: 60, velocity: 500, height: h })).toBe('dismiss') // 60 + ~249 > 250
  })
  it('przeciągnięcie w górę (poza granicę) zawsze wraca', () => {
    expect(decideRelease({ offset: -40, velocity: 900, height: h })).toBe('snap')
    expect(decideRelease({ offset: 0, velocity: 0, height: h })).toBe('snap')
  })
})
