import { getStorage } from 'firebase-admin/storage'
import { STORAGE_BUCKET } from './config.js'

/** Podpisany adres (V4) do odczytu pliku z bucketu; po `minutes` przestaje działać. */
export async function signedLink(path: string, fileName: string, minutes: number) {
  const [url] = await getStorage()
    .bucket(STORAGE_BUCKET)
    .file(path)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + minutes * 60_000,
      responseDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    })
  return url
}
