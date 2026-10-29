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
  detail?: string
}

const ADD_STEPS: Step[] = [
  { title: 'Wybierz „Dodaj do ekranu głównego”', detail: 'Przewiń listę w arkuszu Udostępnij w dół, jeśli opcji nie widać od razu.' },
  { title: 'Dotknij „Dodaj”', detail: 'Nazwę „LOM.SGH” możesz zostawić. Przycisk jest w prawym górnym rogu.' },
  { title: 'Otwieraj aplikację z ikony na ekranie głównym', detail: 'Tylko wtedy działa jak zwykła aplikacja: na całym ekranie i bez paska przeglądarki.' },
]

/** Kroki instalacji dopasowane do urządzenia i przeglądarki. */
export function installSteps(c: InstallContext): Step[] {
  const where = c.ipad ? 'w pasku narzędzi u góry, obok adresu' : 'na dolnym pasku'
  const shareSafari: Step = {
    title: 'Dotknij przycisku Udostępnij',
    detail: `To kwadrat ze strzałką w górę, ${where}.${c.ipad ? '' : ' Jeśli go nie widać, dotknij „•••” (Więcej) i wybierz Udostępnij.'}`,
  }
  switch (c.browser) {
    case 'safari':
      return [shareSafari, ...ADD_STEPS]
    case 'chrome':
      return [
        { title: 'Dotknij przycisku Udostępnij w pasku adresu', detail: 'To kwadrat ze strzałką w górę, przy adresie strony. Dodawanie z Chrome wymaga iOS 16.4 lub nowszego.' },
        ...ADD_STEPS,
        { title: 'Nie ma takiej opcji?', detail: 'Otwórz stronę w Safari i zrób to samo, bo Safari działa na każdej wersji iOS.' },
      ]
    case 'inapp':
      return [
        { title: 'Otwórz tę stronę w Safari', detail: 'Ta przeglądarka jest częścią innej aplikacji i nie potrafi dodać strony do ekranu głównego. Dotknij „•••” albo ikony kompasu i wybierz „Otwórz w Safari”, albo skopiuj adres i wklej go w Safari.' },
        shareSafari,
        ...ADD_STEPS,
      ]
    default:
      return [
        { title: 'Najpewniej zrób to w Safari', detail: 'Skopiuj adres tej strony i otwórz go w Safari. Inne przeglądarki na iOS nie zawsze oferują dodanie do ekranu głównego.' },
        shareSafari,
        ...ADD_STEPS,
      ]
  }
}

export const browserName = (b: IosBrowser) =>
  ({ safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', opera: 'Opera', inapp: 'przeglądarka w aplikacji' })[b]
