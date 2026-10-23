import { describe, expect, it } from 'vitest'
import { findExisting } from '../src/features/schedule/match'
import type { Subject } from '../src/features/materials/types'

const s = (id: string, name: string, kind: Subject['kind'], usosCode?: string): Subject => ({ id, name, kind, usosCode, createdBy: 'x' })

describe('findExisting', () => {
  const subjects = [s('1', 'Mathematics', 'WYK+CW', '110491-D'), s('2', 'Łódź i okolice', 'CW')]

  it('po kodzie USOS i rodzaju, niezależnie od nazwy', () => {
    expect(findExisting({ code: '110491-D', name: 'Matematyka', kind: 'WYK+CW' }, subjects)?.id).toBe('1')
  })
  it('po nazwie i rodzaju, ignorując wielkość liter i polskie znaki', () => {
    expect(findExisting({ name: ' MATHEMATICS ', kind: 'WYK+CW' }, subjects)?.id).toBe('1')
    expect(findExisting({ name: 'lodz i okolice', kind: 'CW' }, subjects)?.id).toBe('2')
  })
  it('inny rodzaj zajęć to inny przedmiot', () => {
    expect(findExisting({ code: '110491-D', name: 'Mathematics', kind: 'WYK' }, subjects)).toBeUndefined()
  })
})
