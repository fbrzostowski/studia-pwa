import { describe, expect, it } from 'vitest'
import { canDelete, fileNameFor, findByName, folderHasBooks, folderPath, norm, storagePathFor, titleOf, validFolderName } from '../functions/src/textbooks'

describe('validFolderName', () => {
  it('przycina i scala spacje, odrzuca niepoprawne nazwy', () => {
    expect(validFolderName('  Mikroekonomia   I ')).toBe('Mikroekonomia I')
    for (const bad of ['', '   ', 'a/b', 'a\\b', '..', '.', 'x'.repeat(101), 5, null, undefined]) {
      expect(validFolderName(bad)).toBeNull()
    }
    expect(validFolderName('x'.repeat(100))).toHaveLength(100)
  })
})

describe('norm / findByName', () => {
  it('ignoruje wielkość liter, polskie znaki (także ł) i spacje', () => {
    expect(norm('Łódź  Ćwiczenia')).toBe('lodz cwiczenia')
    const list = [{ id: '1', name: 'Mikroekonomia' }, { id: '2', name: 'Łódź i okolice' }]
    expect(findByName(list, ' MIKROEKONOMIA ')?.id).toBe('1')
    expect(findByName(list, 'lodz  i okolice')?.id).toBe('2')
    expect(findByName(list, 'Mathematics')).toBeUndefined()
  })
})

describe('nazwy plików i ścieżki', () => {
  it('czyści znaki specjalne, zachowuje polskie litery i spacje', () => {
    expect(fileNameFor('Ekonomia: część 1/2?.pdf')).toBe('Ekonomia_ część 1_2_.pdf')
    expect(fileNameFor('???')).toBe('_')
    expect(fileNameFor('   ')).toBe('plik')
  })
  it('ścieżka w Storage zawiera identyfikator dokumentu, więc dwa pliki o tej samej nazwie się nie nadpiszą', () => {
    expect(storagePathFor('A1', 'a.pdf')).toBe('textbooks/A1/a.pdf')
    expect(storagePathFor('A1', 'a.pdf')).not.toBe(storagePathFor('B2', 'a.pdf'))
  })
  it('tytuł to nazwa bez rozszerzenia (a gdyby wyszedł pusty, cała nazwa)', () => {
    expect(titleOf('Mikroekonomia - Varian.pdf')).toBe('Mikroekonomia - Varian')
    expect(titleOf('bez rozszerzenia')).toBe('bez rozszerzenia')
    expect(titleOf('.pdf')).toBe('.pdf')
  })
  it('folderPath składa przedmiot i podfolder', () => {
    expect(folderPath('Mathematics', null)).toBe('Mathematics')
    expect(folderPath('Mathematics', 'Prezentacje')).toBe('Mathematics / Prezentacje')
  })
})

describe('canDelete: tylko autor albo admin', () => {
  it('autor i admin mogą, inni nie', () => {
    expect(canDelete('u1', 'u1', false)).toBe(true)
    expect(canDelete('u1', 'u2', false)).toBe(false)
    expect(canDelete('u1', 'u2', true)).toBe(true)
  })
  it('wpis bez zapisanego autora (np. starszy) usuwa tylko admin', () => {
    for (const author of [undefined, null, '', 5]) {
      expect(canDelete(author, 'u1', false)).toBe(false)
      expect(canDelete(author, 'u1', true)).toBe(true)
    }
  })
})

describe('folderHasBooks', () => {
  const folders = ['Mathematics', 'Mathematics / Prezentacje', 'Mikroekonomia']
  it('widzi pliki w folderze głównym i w podfolderach, ignorując wielkość liter i polskie znaki', () => {
    expect(folderHasBooks('mathematics', folders)).toBe(true)
    expect(folderHasBooks('MIKROEKONOMIA', folders)).toBe(true)
    expect(folderHasBooks('Łódź', ['lodz / skrypty'])).toBe(true)
  })
  it('pusty folder i folder o podobnej nazwie nie są mylone z niepustym', () => {
    expect(folderHasBooks('Prawo', folders)).toBe(false)
    expect(folderHasBooks('Math', folders)).toBe(false)
    expect(folderHasBooks('Mathematics', [])).toBe(false)
  })
})
