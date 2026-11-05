/**
 * Bucket z plikami podręczników i wgrań. Leży w us-central1, bo tylko tam Firebase daje bezpłatny limit
 * (5 GB i 100 GB pobrań miesięcznie). Ta sama nazwa jest w src/firebase/config.ts.
 */
export const STORAGE_BUCKET = 'studia-pwa-podreczniki'

/** Publiczny adres serwera MCP i OAuth (Firebase Hosting przekierowuje te ścieżki do funkcji `mcp`, patrz firebase.json). */
export const MCP_BASE = 'https://studia-pwa.web.app'
/** Adres aplikacji: tu użytkownik loguje się i zatwierdza dostęp klienta MCP. */
export const APP_URL = 'https://app.lomiankowe-sgh.pl'
