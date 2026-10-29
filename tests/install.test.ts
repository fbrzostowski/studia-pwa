import { describe, expect, it } from 'vitest'
import { detectInstall, installSteps, needsInstallGuide } from '../src/lib/install'

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/126.2592.87 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.20.111',
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
  const steps = (ua: string, touchPoints?: number) => installSteps(detectInstall({ ua, touchPoints }))
  const text = (s: ReturnType<typeof steps>) => s.map((x) => `${x.title} ${x.detail ?? ''}`).join(' | ')

  it('Safari na iPhonie: przycisk na dolnym pasku, potem dodanie do ekranu głównego', () => {
    const t = text(steps(UA.iphoneSafari))
    expect(t).toMatch(/dolnym pasku/)
    expect(t).toMatch(/Dodaj do ekranu głównego/)
    expect(t).toMatch(/•••/)
    expect(steps(UA.iphoneSafari)).toHaveLength(4)
  })
  it('Safari na iPadzie: przycisk u góry, bez podpowiedzi o „•••”', () => {
    const t = text(steps(UA.ipadSafariDesktop, 5))
    expect(t).toMatch(/u góry/)
    expect(t).not.toMatch(/dolnym pasku/)
    expect(t).not.toMatch(/•••/)
  })
  it('Chrome: przycisk w pasku adresu, informacja o iOS 16.4 i podpowiedź o Safari', () => {
    const t = text(steps(UA.iphoneChrome))
    expect(t).toMatch(/pasku adresu/)
    expect(t).toMatch(/16\.4/)
    expect(t).toMatch(/Safari/)
  })
  it('przeglądarka w aplikacji i inne przeglądarki najpierw odsyłają do Safari', () => {
    expect(steps(UA.iphoneInstagram)[0]!.title).toMatch(/Safari/)
    expect(steps(UA.iphoneFirefox)[0]!.title).toMatch(/Safari/)
  })
  it('każdy wariant kończy się otwieraniem z ikony na ekranie głównym', () => {
    for (const ua of [UA.iphoneSafari, UA.iphoneChrome, UA.iphoneInstagram, UA.iphoneFirefox]) {
      const s = steps(ua)
      expect(s.some((x) => /z ikony na ekranie głównym/.test(x.title))).toBe(true)
    }
  })
})
