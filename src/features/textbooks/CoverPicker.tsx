import { useEffect, useRef, useState } from 'react'
import {
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  PALETTES,
  canvasToCover,
  coverFromImage,
  drawGeneratedCover,
  paletteIndexFor,
} from './cover'
import { openPdf, type PdfDoc } from './pdfPages'

type Mode = 'pdf' | 'image' | 'gen' | 'none'

const isPdf = (f: File | null) => !!f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name))

const MODE_LABEL: Record<Mode, string> = {
  pdf: 'Strona PDF',
  image: 'Własny obraz',
  gen: 'Kreator',
  none: 'Bez okładki',
}

/**
 * Wybór okładki podręcznika: strona wybranego PDF-a, własny obraz albo prosty kreator.
 * Wynikiem (`onChange`) jest miniatura JPEG jako data URL albo pusty tekst, gdy okładki nie ma.
 */
export default function CoverPicker({
  file,
  title,
  subject,
  value,
  onChange,
}: {
  file: File | null
  title: string
  subject: string
  value: string
  onChange: (cover: string) => void
}) {
  const [mode, setMode] = useState<Mode>('gen')
  const [pdf, setPdf] = useState<PdfDoc | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [image, setImage] = useState<File | null>(null)
  const [palette, setPalette] = useState<number | null>(null) // null = kolor z tytułu
  const [subtitle, setSubtitle] = useState(subject)
  const [error, setError] = useState<string | null>(null)
  const token = useRef(0) // odrzuca spóźnione wyniki po zmianie ustawień
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // nowy plik: domyślnie strona 1 dla PDF-a, a dla innych typów okładka z kreatora
  useEffect(() => {
    let live = true
    setError(null)
    setPage(1)
    setPdf((prev) => {
      prev?.destroy()
      return null
    })
    if (isPdf(file)) {
      setMode('pdf')
      setPdfLoading(true)
      openPdf(file!)
        .then((doc) => (live ? setPdf(doc) : doc.destroy()))
        .catch(() => {
          if (!live) return
          setError('Nie udało się odczytać tego PDF-a (uszkodzony lub zabezpieczony hasłem). Wybierz inną okładkę.')
          setMode('gen')
        })
        .finally(() => live && setPdfLoading(false))
    } else {
      setMode('gen')
    }
    return () => {
      live = false
    }
  }, [file])

  useEffect(() => () => pdf?.destroy(), [pdf])

  // tytuł i przedmiot podpowiadają treść okładki z kreatora
  useEffect(() => setSubtitle(subject), [subject])

  // wyliczenie okładki dla bieżących ustawień
  useEffect(() => {
    const mine = ++token.current
    const done = (cover: string) => mine === token.current && onChangeRef.current(cover)
    const fail = (msg: string) => {
      if (mine !== token.current) return
      setError(msg)
      onChangeRef.current('')
    }

    if (mode === 'none') {
      done('')
      return
    }
    if (mode === 'gen') {
      const t = setTimeout(() => {
        try {
          done(
            canvasToCover(
              drawGeneratedCover({ title, subtitle, paletteIndex: palette ?? paletteIndexFor(title || 'Podręcznik') }),
            ),
          )
        } catch {
          fail('Nie udało się wygenerować okładki.')
        }
      }, 150)
      return () => clearTimeout(t)
    }
    if (mode === 'pdf') {
      if (!pdf) return
      pdf
        .coverOfPage(page)
        .then(done)
        .catch(() => fail('Nie udało się narysować tej strony. Spróbuj innej.'))
      return
    }
    if (mode === 'image') {
      if (!image) {
        done('')
        return
      }
      coverFromImage(image)
        .then(done)
        .catch(() => fail('Nie udało się odczytać tego obrazu.'))
    }
  }, [mode, pdf, page, image, palette, title, subtitle])

  const choose = (m: Mode) => {
    setError(null)
    setMode(m)
  }

  const modes: Mode[] = isPdf(file) ? ['pdf', 'image', 'gen', 'none'] : ['image', 'gen', 'none']
  const pages = pdf?.numPages ?? 0
  const kb = value ? Math.round((value.length * 0.75) / 1024) : 0

  return (
    <fieldset className="border-line rounded-xl border p-3">
      <legend className="text-muted px-1 text-xs font-semibold tracking-wide uppercase">Okładka</legend>

      <div className="flex gap-3">
        <div className="w-28 shrink-0">
          <div className="bg-bg border-line aspect-[3/4] w-full overflow-hidden rounded-lg border shadow-sm">
            {value ? (
              <img src={value} alt="Podgląd okładki" className="h-full w-full object-cover" />
            ) : (
              <div className="text-muted flex h-full items-center justify-center p-2 text-center text-xs">
                {pdfLoading ? 'Wczytuję PDF…' : mode === 'none' ? 'Bez okładki' : 'Podgląd'}
              </div>
            )}
          </div>
          {kb > 0 && <p className="text-muted mt-1 text-center text-[11px]">{kb} kB</p>}
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Źródło okładki">
            {modes.map((m) => (
              <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => choose(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {mode === 'pdf' && (
            <div className="flex items-center gap-2">
              {pdfLoading || !pdf ? (
                <p className="text-muted text-sm">Wczytuję PDF…</p>
              ) : (
                <>
                  <button type="button" className="btn-secondary px-3" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Poprzednia strona">
                    −
                  </button>
                  <label className="text-muted flex items-center gap-1.5 text-sm whitespace-nowrap">
                    Strona
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={pages}
                      value={page}
                      onChange={(e) => setPage(Math.min(Math.max(1, Math.floor(+e.target.value) || 1), pages))}
                      className="input w-16 px-2 py-1.5 text-center"
                      aria-label="Numer strony okładki"
                    />
                    z {pages}
                  </label>
                  <button type="button" className="btn-secondary px-3" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} aria-label="Następna strona">
                    +
                  </button>
                </>
              )}
            </div>
          )}

          {mode === 'image' && (
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                if (f && f.size > MAX_IMAGE_BYTES) {
                  setError('Obraz jest za duży (limit 15 MB).')
                  setImage(null)
                  return
                }
                setError(null)
                setImage(f)
              }}
              className="text-muted file:bg-accent-soft file:text-accent block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
              aria-label="Plik z obrazem okładki"
            />
          )}

          {mode === 'gen' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Kolor okładki">
                {PALETTES.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.name}
                    aria-label={p.name}
                    aria-pressed={(palette ?? paletteIndexFor(title || 'Podręcznik')) === i}
                    onClick={() => setPalette(i)}
                    className="ring-offset-surface aria-pressed:ring-accent h-7 w-7 rounded-full ring-2 ring-transparent ring-offset-2"
                    style={{ background: `linear-gradient(135deg, ${p.from}, ${p.to})` }}
                  />
                ))}
              </div>
              <input
                className="input py-2 text-sm"
                placeholder="Podtytuł (np. przedmiot)"
                maxLength={60}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                aria-label="Podtytuł okładki"
              />
              <p className="text-muted text-xs">Tytuł okładki to tytuł podręcznika powyżej.</p>
            </div>
          )}

          {mode === 'none' && <p className="text-muted text-sm">Na liście pojawi się neutralna ikona typu pliku.</p>}
        </div>
      </div>

      {error && <p className="text-danger mt-2 text-sm">{error}</p>}
    </fieldset>
  )
}
