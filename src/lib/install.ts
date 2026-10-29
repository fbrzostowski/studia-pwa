// Poradnik instalacji aplikacji na iPhonie i iPadzie. Czysta logika (bez dostępu do window), testowana w tests/install.test.ts.

export type IosBrowser = 'safari' | 'chrome' | 'firefox' | 'edge' | 'opera' | 'inapp'

export interface InstallContext {
  ios: boolean // iPhone, iPod albo iPad (także iPadOS 13+, który podaje się za Maca)
  ipad: boolean
  browser: IosBrowser
  standalone: boolean // już uruchomiona z ekranu głównego (PWA)
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|LinkedInApp|Messenger|GSA\/|Teams\//i

/** Rozpoznaje urządzenie i przeglądarkę. iPadOS 13+ ma UA „Macintosh”, więc rozpoznajemy go po ekranie dotykowym. */
export function detectInstall(env: { ua: string; platform?: string; touchPoints?: number; standalone?: boolean }): InstallContext {
  const { ua } = env
  const iPadOs = /Macintosh/i.test(ua) && (env.touchPoints ?? 0) > 1
  const ipad = /iPad/i.test(ua) || iPadOs
  const ios = /iPhone|iPod/i.test(ua) || ipad
  let browser: IosBrowser = 'safari'
  if (/CriOS/i.test(ua)) browser = 'chrome'
  else if (/FxiOS/i.test(ua)) browser = 'firefox'
  else if (/EdgiOS/i.test(ua)) browser = 'edge'
  else if (/OPiOS|OPT\//i.test(ua)) browser = 'opera'
  else if (IN_APP.test(ua) || !/Safari\//i.test(ua)) browser = 'inapp' // przeglądarka wbudowana w aplikację (bez „Safari/”)
  return { ios, ipad, browser, standalone: !!env.standalone }
}

/** Czy pokazać poradnik: iOS/iPadOS i aplikacja nie jest uruchomiona z ekranu głównego. */
export const needsInstallGuide = (c: InstallContext) => c.ios && !c.standalone

export interface Step {
  title: string
}

const ADD: Step = { title: 'Wybierz „Dodaj do ekranu głównego”' }

/** Krótkie kroki instalacji dopasowane do przeglądarki: Udostępnij, potem „Dodaj do ekranu głównego”. */
export function installSteps(c: InstallContext): Step[] {
  const share: Step = { title: 'Dotknij Udostępnij' }
  switch (c.browser) {
    case 'safari':
      return [share, ADD]
    case 'chrome':
      return [{ title: 'Dotknij Udostępnij w pasku adresu' }, ADD]
    default:
      // Firefox, Edge, Opera i przeglądarki w aplikacjach: najpewniej przez Safari
      return [{ title: 'Otwórz tę stronę w Safari' }, share, ADD]
  }
}

export const browserName = (b: IosBrowser) =>
  ({ safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', opera: 'Opera', inapp: 'przeglądarka w aplikacji' })[b]

/**
 * Adres, który iOS otwiera w Safari (nieoficjalny schemat x-safari-*). Działa po dotknięciu linku w wielu przeglądarkach
 * (Chrome, Firefox, Edge), ale nie jest gwarantowany, dlatego zawsze jest też „skopiuj adres”.
 */
export const safariUrl = (href: string) => `x-safari-${href}`

/**
 * Czy próbujemy przejścia do Safari. Z Chrome, Firefoksa, Edge i Opery zwykle działa; w przeglądarkach wbudowanych w aplikacje
 * (Messenger, Instagram) często jest blokowane, ale dotknięcie nic nie kosztuje, więc przycisk też tam jest.
 */
export const canTryHandoff = (c: InstallContext) => c.ios && c.browser !== 'safari'
