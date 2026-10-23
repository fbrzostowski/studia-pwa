import { describe, expect, it } from 'vitest'
import { FOLDER_MIME, MAX_BYTES, fileNameFor, findFolderByName, norm, planFolders, planSync, storagePathFor, titleOf, validFolderName, type DriveFile } from '../functions/src/syncPlan'

const f = (id: string, over: Partial<DriveFile> = {}): DriveFile => ({
  id, name: `${id}.pdf`, mimeType: 'application/pdf', size: 1000, modifiedTime: '2026-10-01T10:00:00Z', folder: '', ...over,
})

describe('planSync', () => {
  it('pierwsza synchronizacja wgrywa wszystkie kwalifikujące się pliki', () => {
    const r = planSync([f('a'), f('b')], [])
    expect(r.upload.map((x) => x.id)).toEqual(['a', 'b'])
    expect(r.remove).toEqual([])
  })
  it('niezmienione pomija, zmienione (nowszy modifiedTime) wgrywa ponownie', () => {
    const r = planSync(
      [f('a'), f('b', { modifiedTime: '2026-10-05T00:00:00Z' })],
      [
        { id: 'a', driveModifiedTime: '2026-10-01T10:00:00Z', storagePath: 'textbooks/a/a.pdf' },
        { id: 'b', driveModifiedTime: '2026-10-01T10:00:00Z', storagePath: 'textbooks/b/b.pdf' },
      ],
    )
    expect(r.upload.map((x) => x.id)).toEqual(['b'])
    expect(r.unchanged).toBe(1)
  })
  it('usuwa pliki, których nie ma już na Drive', () => {
    const r = planSync([f('a')], [
      { id: 'a', driveModifiedTime: '2026-10-01T10:00:00Z', storagePath: 'x' },
      { id: 'gone', driveModifiedTime: '2026-10-01T10:00:00Z', storagePath: 'y' },
    ])
    expect(r.remove.map((x) => x.id)).toEqual(['gone'])
  })
  it('pomija foldery, nieobsługiwane pliki Google i za duże; za duży usuwa ze zsynchronizowanych', () => {
    const r = planSync(
      [
        f('dir', { mimeType: FOLDER_MIME, name: 'Rozdział 1' }),
        f('form', { mimeType: 'application/vnd.google-apps.form', name: 'Ankieta' }),
        f('big', { size: MAX_BYTES + 1, name: 'Wielki.pdf' }),
        f('doc', { mimeType: 'application/vnd.google-apps.document', size: undefined, name: 'Notatki' }),
      ],
      [{ id: 'big', driveModifiedTime: 'old', storagePath: 'z' }],
    )
    expect(r.upload.map((x) => x.id)).toEqual(['doc'])
    expect(r.skipped.map((s) => s.name)).toEqual(['Ankieta', 'Wielki.pdf'])
    expect(r.remove.map((x) => x.id)).toEqual(['big'])
  })
})

describe('nazwy', () => {
  it('pliki Google eksportowane do PDF dostają rozszerzenie .pdf', () => {
    expect(fileNameFor({ name: 'Notatki', mimeType: 'application/vnd.google-apps.document' })).toBe('Notatki.pdf')
    expect(fileNameFor({ name: 'slajdy.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).toBe('slajdy.pptx')
  })
  it('czyści znaki niedozwolone, zachowuje polskie litery', () => {
    expect(fileNameFor({ name: 'Ekonomia: część 1/2?.pdf', mimeType: 'application/pdf' })).toBe('Ekonomia_ część 1_2_.pdf')
    expect(storagePathFor({ id: 'X1', name: 'a.pdf', mimeType: 'application/pdf' })).toBe('textbooks/X1/a.pdf')
  })
  it('tytuł bez rozszerzenia, ale nazwy plików Google bez zmian', () => {
    expect(titleOf({ name: 'Mikroekonomia - Varian.pdf', mimeType: 'application/pdf' })).toBe('Mikroekonomia - Varian')
    expect(titleOf({ name: 'Wykład 3. Popyt', mimeType: 'application/vnd.google-apps.presentation' })).toBe('Wykład 3. Popyt')
  })
})

describe('foldery przedmiotów', () => {
  it('validFolderName przycina i odrzuca niepoprawne nazwy', () => {
    expect(validFolderName('  Mikroekonomia   I ')).toBe('Mikroekonomia I')
    for (const bad of ['', '   ', 'a/b', 'a\\b', '..', '.', 'x'.repeat(101), 5, null, undefined]) {
      expect(validFolderName(bad)).toBeNull()
    }
    expect(validFolderName('x'.repeat(100))).toHaveLength(100)
  })
  it('findFolderByName ignoruje wielkość liter, polskie znaki i spacje', () => {
    const folders = [{ id: '1', name: 'Mikroekonomia' }, { id: '2', name: 'Łódź i okolice' }]
    expect(findFolderByName(folders, ' MIKROEKONOMIA ')?.id).toBe('1')
    expect(findFolderByName(folders, 'lodz  i okolice')?.id).toBe('2')
    expect(findFolderByName(folders, 'Mathematics')).toBeUndefined()
    expect(norm('Łódź  Ćwiczenia')).toBe('lodz cwiczenia')
  })
  it('planFolders usuwa z rejestru foldery, których nie ma już na Drive', () => {
    const r = planFolders([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], ['b', 'gone', 'a'])
    expect(r.upsert.map((f) => f.id)).toEqual(['a', 'b'])
    expect(r.remove).toEqual(['gone'])
  })
})
