import { describe, expect, it } from 'vitest'
import { ALLOWED_TYPES } from '../src/features/textbooks/upload'
import { canPreview, hintFor, previewInApp, sandboxFor } from '../src/features/textbooks/viewer'

describe('canPreview', () => {
  it('formaty wyświetlane przez przeglądarkę są w ramce, także z parametrem charset', () => {
    for (const m of ['application/pdf', 'text/html', 'text/html; charset=utf-8', 'text/plain', 'image/png', 'image/jpeg', 'IMAGE/JPEG']) expect(canPreview(m), m).toBe(true)
  })
  it('Word, PowerPoint, Excel i OpenDocument nie mają podglądu (nie wysyłamy ich do osób trzecich)', () => {
    for (const ext of ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'odp', 'ods']) expect(canPreview(ALLOWED_TYPES[ext]!), ext).toBe(false)
    expect(canPreview('')).toBe(false)
  })
  it('każdy dozwolony typ jest świadomie przypisany: w ramce albo w nowej karcie', () => {
    const inline = Object.entries(ALLOWED_TYPES).filter(([, m]) => canPreview(m)).map(([e]) => e).sort()
    expect(inline).toEqual(['htm', 'html', 'jpeg', 'jpg', 'pdf', 'png', 'txt'])
  })
})

describe('sandboxFor', () => {
  it('piaskownica tylko dla HTML i bez allow-same-origin / allow-top-navigation', () => {
    const sb = sandboxFor('text/html; charset=utf-8')!
    expect(sb).toContain('allow-scripts')
    expect(sb).not.toMatch(/allow-same-origin|allow-top-navigation|allow-forms/)
    for (const m of ['application/pdf', 'text/plain', 'image/png']) expect(sandboxFor(m)).toBeUndefined()
  })
})

describe('hintFor', () => {
  it('PDF ma podpowiedź o telefonach, reszta ogólną', () => {
    expect(hintFor('application/pdf')).toContain('telefonie')
    expect(hintFor('text/html')).toContain('Nie wyświetla się')
  })
})

describe('previewInApp', () => {
  it('na telefonie nigdy w ramce, na większym ekranie tylko formaty z podglądem', () => {
    for (const m of ['application/pdf', 'text/html', 'text/plain', 'image/png']) {
      expect(previewInApp(m, true), m + ' na telefonie').toBe(false)
      expect(previewInApp(m, false), m + ' na tablecie/komputerze').toBe(true)
    }
    expect(previewInApp('application/vnd.openxmlformats-officedocument.wordprocessingml.document', false)).toBe(false)
  })
})
