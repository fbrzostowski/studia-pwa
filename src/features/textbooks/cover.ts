// Okładki podręczników: czysta logika (kadrowanie, zawijanie tytułu, paleta) oraz rysowanie na canvasie.
// UWAGA: MAX_COVER_CHARS i COVER_PREFIX muszą być takie same jak w functions/src/covers.ts.

export const COVER_W = 240
export const COVER_H = 320
export const COVER_ASPECT = COVER_W / COVER_H
export const MAX_COVER_CHARS = 90_000
export const COVER_PREFIX = 'data:image/jpeg;base64,'

export interface Palette {
  name: string
  from: string
  to: string
  fg: string
}

export const PALETTES: Palette[] = [
  { name: 'Indygo', from: '#4338ca', to: '#818cf8', fg: '#ffffff' },
  { name: 'Granat', from: '#0f3d6e', to: '#3b82c4', fg: '#ffffff' },
  { name: 'Szmaragd', from: '#047857', to: '#34d399', fg: '#ffffff' },
  { name: 'Burgund', from: '#9f1239', to: '#fb7185', fg: '#ffffff' },
  { name: 'Bursztyn', from: '#b45309', to: '#fbbf24', fg: '#1f1300' },
  { name: 'Grafit', from: '#1f2937', to: '#6b7280', fg: '#ffffff' },
  { name: 'Fiolet', from: '#6d28d9', to: '#c084fc', fg: '#ffffff' },
  { name: 'Morski', from: '#0e7490', to: '#67e8f9', fg: '#06222a' },
]

/** Stabilny skrót tekstu (djb2), żeby ten sam tytuł zawsze dostawał ten sam kolor. */
export function hashString(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

export const paletteIndexFor = (title: string) => hashString(title.trim().toLowerCase()) % PALETTES.length

/** Prostokąt źródła do wycięcia (cover, wyśrodkowany; dla stron PDF opcjonalnie od góry). */
export function cropRect(srcW: number, srcH: number, aspect = COVER_ASPECT, anchorTop = false) {
  if (srcW / srcH > aspect) {
    const sw = srcH * aspect
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH }
  }
  const sh = srcW / aspect
  return { sx: 0, sy: anchorTop ? 0 : (srcH - sh) / 2, sw: srcW, sh }
}

/** Zawijanie tekstu do szerokości, z łamaniem zbyt długich słów i wielokropkiem po przekroczeniu liczby linii. */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const original of text.trim().split(/\s+/).filter(Boolean)) {
    let word = original
    while (measure(word) > maxWidth && word.length > 1) {
      let cut = word.length - 1
      while (cut > 1 && measure(word.slice(0, cut)) > maxWidth) cut--
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      lines.push(word.slice(0, cut))
      word = word.slice(cut)
    }
    const next = cur ? `${cur} ${word}` : word
    if (measure(next) <= maxWidth) cur = next
    else {
      if (cur) lines.push(cur)
      cur = word
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last.replace(/\s+$/, '')}…`
  return kept
}

/** Największy rozmiar czcionki (od max w dół), przy którym tytuł mieści się w polu bez ucinania. */
export function fitText(
  text: string,
  maxWidth: number,
  maxHeight: number,
  measureAt: (size: number) => (s: string) => number,
  { max = 30, min = 14, lineHeight = 1.22 } = {},
) {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrapLines(text, maxWidth, measureAt(size), 99)
    if (lines.length * size * lineHeight <= maxHeight) return { size, lines }
  }
  const maxLines = Math.max(1, Math.floor(maxHeight / (min * lineHeight)))
  return { size: min, lines: wrapLines(text, maxWidth, measureAt(min), maxLines) }
}

// ---------- rysowanie (przeglądarka) ----------

const newCanvas = () => {
  const c = document.createElement('canvas')
  c.width = COVER_W
  c.height = COVER_H
  return c
}

/** JPEG jako data URL w limicie rozmiaru: jakość obniżamy, aż się zmieści. */
export function canvasToCover(c: HTMLCanvasElement) {
  let quality = 0.82
  let url = c.toDataURL('image/jpeg', quality)
  while (url.length > MAX_COVER_CHARS && quality > 0.35) {
    quality -= 0.1
    url = c.toDataURL('image/jpeg', quality)
  }
  return url
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

/** Okładka z kreatora: gradient, grzbiet i wycentrowany tytuł z podtytułem. */
export function drawGeneratedCover({ title, subtitle = '', paletteIndex }: { title: string; subtitle?: string; paletteIndex: number }) {
  const pal = PALETTES[((paletteIndex % PALETTES.length) + PALETTES.length) % PALETTES.length]
  const c = newCanvas()
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, COVER_W, COVER_H)
  g.addColorStop(0, pal.from)
  g.addColorStop(1, pal.to)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, COVER_W, COVER_H)

  // grzbiet książki
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, 0, 16, COVER_H)
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(16, 0, 2, COVER_H)

  const left = 34
  const maxW = COVER_W - left - 22
  ctx.fillStyle = pal.fg
  ctx.textBaseline = 'top'
  const measureAt = (size: number) => (s: string) => {
    ctx.font = `700 ${size}px ${FONT}`
    return ctx.measureText(s).width
  }
  const { size, lines } = fitText(title.trim() || 'Podręcznik', maxW, 190, measureAt)
  ctx.font = `700 ${size}px ${FONT}`
  const lh = size * 1.22
  let y = 48
  for (const line of lines) {
    ctx.fillText(line, left, y)
    y += lh
  }
  ctx.fillRect(left, y + 10, 40, 3)

  if (subtitle.trim()) {
    const sub = wrapLines(subtitle, maxW, measureAt(13), 2)
    ctx.globalAlpha = 0.88
    ctx.font = `500 13px ${FONT}`
    let sy = COVER_H - 26 - sub.length * 17
    for (const line of sub) {
      ctx.fillText(line, left, sy)
      sy += 17
    }
    ctx.globalAlpha = 1
  }
  return c
}

/** Przycina obraz do proporcji okładki i wypełnia białym tłem (przezroczyste PNG-i). */
export function drawCropped(source: CanvasImageSource, w: number, h: number, anchorTop = false) {
  const c = newCanvas()
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, COVER_W, COVER_H)
  const { sx, sy, sw, sh } = cropRect(w, h, COVER_ASPECT, anchorTop)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H)
  return c
}

/** Okładka z własnego obrazu (PNG, JPG, WebP). */
export async function coverFromImage(file: Blob) {
  const bmp = await createImageBitmap(file)
  try {
    return canvasToCover(drawCropped(bmp, bmp.width, bmp.height))
  } finally {
    bmp.close()
  }
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp'
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
