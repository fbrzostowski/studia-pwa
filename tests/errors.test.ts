import { describe, expect, it } from 'vitest'
import { uploadErrorMessage } from '../src/lib/errors'

describe('uploadErrorMessage', () => {
  it('podpowiada odświeżenie przy storage/unauthorized', () => {
    const e = new Error("Firebase Storage: User does not have permission to access 'uploads/x'. (storage/unauthorized)")
    expect(uploadErrorMessage(e)).toMatch(/odśwież stronę/)
  })
  it('tłumaczy przerwanie i problemy z siecią', () => {
    expect(uploadErrorMessage(new Error('Firebase Storage: User canceled the upload/download. (storage/canceled)'))).toMatch(/przerwane/)
    expect(uploadErrorMessage(new Error('(storage/retry-limit-exceeded)'))).toMatch(/połączenie/)
  })
  it('inne błędy przepuszcza bez zmian, także nie-Error', () => {
    expect(uploadErrorMessage(new Error('Plik jest za duży'))).toBe('Plik jest za duży')
    expect(uploadErrorMessage('tekst')).toBe('tekst')
  })
})
