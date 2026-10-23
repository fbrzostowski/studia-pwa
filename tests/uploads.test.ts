import { describe, expect, it } from 'vitest'
import * as server from '../functions/src/uploads'
import * as client from '../src/features/textbooks/upload'

describe('lista dozwolonych plików', () => {
  it('jest identyczna w aplikacji i w funkcjach', () => {
    expect(client.ALLOWED_TYPES).toEqual(server.ALLOWED_TYPES)
    expect(client.MAX_UPLOAD_BYTES).toBe(server.MAX_UPLOAD_BYTES)
  })
  it('nie zawiera typów wykonywalnych ani aktywnych', () => {
    for (const bad of ['exe', 'js', 'html', 'svg', 'sh', 'zip', 'bat', 'msi', 'jar']) {
      expect(server.ALLOWED_TYPES[bad]).toBeUndefined()
    }
  })
  it('accept dla inputu zawiera każde rozszerzenie', () => {
    for (const ext of Object.keys(server.ALLOWED_TYPES)) expect(client.ACCEPT.split(',')).toContain(`.${ext}`)
  })
})

describe('mimeFor / extOf', () => {
  it('rozpoznaje typ po rozszerzeniu, bez względu na wielkość liter', () => {
    expect(server.mimeFor('Calculus.PDF')).toBe('application/pdf')
    expect(server.mimeFor('slajdy.pptx')).toContain('presentationml')
    expect(server.mimeFor('zdjecie.JPEG')).toBe('image/jpeg')
  })
  it('odrzuca nieznane rozszerzenia, brak rozszerzenia i podwójne rozszerzenia z groźnym końcem', () => {
    expect(server.mimeFor('virus.exe')).toBeNull()
    expect(server.mimeFor('bez_rozszerzenia')).toBeNull()
    expect(server.mimeFor('podrecznik.pdf.exe')).toBeNull()
    expect(server.extOf('a.tar.gz')).toBe('gz')
  })
})

describe('checkFile', () => {
  it('akceptuje poprawny plik i odrzuca zły typ, pusty i za duży', () => {
    expect(client.checkFile({ name: 'a.pdf', size: 1000 })).toBeNull()
    expect(client.checkFile({ name: 'a.exe', size: 1000 })).toMatch(/nie jest obsługiwany/)
    expect(client.checkFile({ name: 'a.pdf', size: 0 })).toMatch(/pusty/)
    expect(client.checkFile({ name: 'a.pdf', size: client.MAX_UPLOAD_BYTES })).toMatch(/za duży/)
    expect(client.checkFile({ name: 'a.pdf', size: client.MAX_UPLOAD_BYTES - 1 })).toBeNull()
  })
})

describe('ścieżki tymczasowe', () => {
  it('tempName i originalName są odwrotne dla zwykłych nazw', () => {
    const t = client.tempName('Analiza: rozdział 1?.pdf', 1792752129108)
    expect(t).toBe('1792752129108-Analiza_ rozdział 1_.pdf')
    expect(server.originalName(`uploads/u1/${t}`)).toBe('Analiza_ rozdział 1_.pdf')
  })
  it('isOwnUpload przepuszcza tylko plik w katalogu użytkownika', () => {
    expect(server.isOwnUpload('uploads/u1/123-a.pdf', 'u1')).toBe(true)
    expect(server.isOwnUpload('uploads/u2/123-a.pdf', 'u1')).toBe(false)
    expect(server.isOwnUpload('uploads/u1/../u2/123-a.pdf', 'u1')).toBe(false)
    expect(server.isOwnUpload('uploads/u1/sub/123-a.pdf', 'u1')).toBe(false)
    expect(server.isOwnUpload('materials/u1/123-a.pdf', 'u1')).toBe(false)
    expect(server.isOwnUpload(42, 'u1')).toBe(false)
  })
  it('titleFromFile usuwa rozszerzenie', () => {
    expect(client.titleFromFile('Calculus - Stewart.pdf')).toBe('Calculus - Stewart')
    expect(client.titleFromFile('bez rozszerzenia')).toBe('bez rozszerzenia')
  })
})

describe('escapeDriveQuery', () => {
  it('escapuje apostrof i ukośnik, żeby nazwa nie wyszła poza cudzysłów zapytania', () => {
    expect(server.escapeDriveQuery("O'Reilly")).toBe("O\\'Reilly")
    expect(server.escapeDriveQuery('a\\b')).toBe('a\\\\b')
    expect(server.escapeDriveQuery("x' or name != '")).toBe("x\\' or name != \\'")
    expect(server.escapeDriveQuery('zwykła nazwa.pdf')).toBe('zwykła nazwa.pdf')
  })
})

describe('driveErrorInfo', () => {
  it('rozpoznaje brak miejsca konta usługi (storageQuotaExceeded) w obu kształtach błędu', () => {
    const a = { code: 403, errors: [{ reason: 'storageQuotaExceeded' }], message: 'Service Accounts do not have storage quota.' }
    expect(server.driveErrorInfo(a)).toMatchObject({ code: 403, reason: 'storageQuotaExceeded' })
    const b = { response: { status: 403, data: { error: { message: 'quota', errors: [{ reason: 'storageQuotaExceeded' }] } } } }
    expect(server.driveErrorInfo(b)).toMatchObject({ code: 403, reason: 'storageQuotaExceeded', message: 'quota' })
  })
  it('radzi sobie z błędami bez struktury', () => {
    expect(server.driveErrorInfo(new Error('boom'))).toMatchObject({ message: 'boom' })
    expect(server.driveErrorInfo('tekst').message).toBe('tekst')
    expect(server.driveErrorInfo(undefined).code).toBeUndefined()
  })
})
