import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase/config'

const call = httpsCallable<{ kind: 'textbook' | 'material'; id: string }, { url: string }>(functions, 'fileLink')

/**
 * Krótkotrwały, podpisany adres pliku od serwera (tylko dla zatwierdzonych kont). Nie używamy getDownloadURL,
 * bo daje stały adres z tokenem, który działa bez logowania dla każdego, kto go zdobędzie.
 */
export const fileUrl = async (kind: 'textbook' | 'material', id: string) => (await call({ kind, id })).data.url
