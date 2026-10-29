import { describe, expect, it } from 'vitest'
import { canTryHandoff, detectInstall, installSteps, needsInstallGuide, safariUrl } from '../src/lib/install'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.87 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.111',
  iphoneMessenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/450.0.0.38.108;FBBV/565105341;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/pl_PL;FBOP/5]',
  iphoneWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadSafariDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  desktopChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
}

describe('detectInstall', () => {
  it('iPhone: rozpoznaje Safari i inne przeglądarki', () => {
    expect(detectInstall({ ua: UA.iphoneSafari })).toMatchObject({ ios: true, ipad: false, browser: 'safari' })
    expect(detectInstall({ ua: UA.iphoneChrome }).browser).toBe('chrome')
    expect(detectInstall({ ua: UA.iphoneFirefox }).browser).toBe('firefox')
    expect(detectInstall({ ua: UA.iphoneEdge }).browser).toBe('edge')
  })
  it('przeglądarki wbudowane w aplikacje (Instagram, WebView bez „Safari/”) to „inapp”', () => {
    expect(detectInstall({ ua: UA.iphoneInstagram }).browser).toBe('inapp')
    expect(detectInstall({ ua: UA.iphoneMessenger })).toMatchObject({ ios: true, browser: 'inapp' })
    expect(detectInstall({ ua: UA.iphoneWebView }).browser).toBe('inapp')
  })
  it('iPad: stary UA „iPad” i iPadOS 13+ udający Maca (po ekranie dotykowym)', () => {
    expect(detectInstall({ ua: UA.ipadLegacy })).toMatchObject({ ios: true, ipad: true })
    expect(detectInstall({ ua: UA.ipadSafariDesktop, touchPoints: 5 })).toMatchObject({ ios: true, ipad: true, browser: 'safari' })
  })
  it('Mac bez ekranu dotykowego, Android i komputer to nie iOS', () => {
    expect(detectInstall({ ua: UA.macSafari, touchPoints: 0 }).ios).toBe(false)
    expect(detectInstall({ ua: UA.macSafari }).ios).toBe(false)
    expect(detectInstall({ ua: UA.androidChrome }).ios).toBe(false)
    expect(detectInstall({ ua: UA.desktopChrome }).ios).toBe(false)
  })
})

describe('needsInstallGuide', () => {
  it('tylko na iOS/iPadOS i tylko gdy aplikacja nie jest już zainstalowana (standalone)', () => {
    expect(needsInstallGuide(detectInstall({ ua: UA.iphoneSafari }))).toBe(true)
    expect(needsInstallGuide(detectInstall({ ua: UA.iphoneSafari, standalone: true }))).toBe(false)
    expect(needsInstallGuide(detectInstall({ ua: UA.ipadSafariDesktop, touchPoints: 5 }))).toBe(true)
    expect(needsInstallGuide(detectInstall({ ua: UA.androidChrome }))).toBe(false)
    expect(needsInstallGuide(detectInstall({ ua: UA.desktopChrome }))).toBe(false)
  })
})

describe('installSteps', () => {
  const steps = (ua: string, touchPoints?: number) => installSteps(detectInstall({ ua, touchPoints })).map((x) => x.title)

  it('Safari (iPhone i iPad): dwa krótkie kroki, Udostępnij i „Dodaj do ekranu głównego”', () => {
    expect(steps(UA.iphoneSafari)).toEqual(['Dotknij Udostępnij', 'Wybierz „Dodaj do ekranu głównego”'])
    expect(steps(UA.ipadSafariDesktop, 5)).toEqual(['Dotknij Udostępnij', 'Wybierz „Dodaj do ekranu głównego”'])
  })
  it('Chrome: Udostępnij w pasku adresu, potem dodanie do ekranu głównego', () => {
    expect(steps(UA.iphoneChrome)).toEqual(['Dotknij Udostępnij w pasku adresu', 'Wybierz „Dodaj do ekranu głównego”'])
  })
  it('Firefox, Edge i przeglądarki w aplikacjach najpierw odsyłają do Safari', () => {
    for (const ua of [UA.iphoneFirefox, UA.iphoneEdge, UA.iphoneInstagram]) {
      const t = steps(ua)
      expect(t[0]).toBe('Otwórz tę stronę w Safari')
      expect(t).toHaveLength(3)
    }
  })
  it('kroki są krótkie, bez opisów, i nie ma kroków „Dodaj” ani „otwieraj z ikony”', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.iphoneInstagram, UA.iphoneFirefox]) {
      for (const step of installSteps(detectInstall({ ua }))) {
        expect(Object.keys(step)).toEqual(['title'])
        expect(step.title.length).toBeLessThanOrEqual(40)
        expect(step.title).not.toMatch(/Dotknij „Dodaj”|z ikony/)
      }
    }
  })
})

describe('przejście do Safari', () => {
  it('safariUrl dopisuje schemat x-safari- do pełnego adresu', () => {
    expect(safariUrl('https://app.lomiankowe-sgh.pl/')).toBe('x-safari-https://app.lomiankowe-sgh.pl/')
    expect(safariUrl('https://app.lomiankowe-sgh.pl/?a=1#x')).toBe('x-safari-https://app.lomiankowe-sgh.pl/?a=1#x')
  })
  it('próbujemy z każdej przeglądarki na iOS poza Safari (także z wbudowanych w aplikacje), a nie z Androida i komputera', () => {
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneChrome }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneFirefox }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneEdge }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneSafari }))).toBe(false)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneInstagram }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneMessenger }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.iphoneWebView }))).toBe(true)
    expect(canTryHandoff(detectInstall({ ua: UA.androidChrome }))).toBe(false)
  })
})
