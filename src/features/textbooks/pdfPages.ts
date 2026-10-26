import { canvasToCover, drawCropped } from './cover'

export interface PdfDoc {
  numPages: number
  /** Okładka (data URL) z wybranej strony, 1-based. */
  coverOfPage(page: number): Promise<string>
  destroy(): void
}

/**
 * Otwiera PDF w przeglądarce. Biblioteka i jej worker (~1,8 MB) ładują się dopiero tutaj, na żądanie,
 * więc nie wchodzą do głównej paczki aplikacji ani do cache offline.
 */
export async function openPdf(file: File): Promise<PdfDoc> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.min.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise

  return {
    numPages: doc.numPages,
    async coverOfPage(n) {
      const page = await doc.getPage(Math.min(Math.max(1, n), doc.numPages))
      const base = page.getViewport({ scale: 1 })
      // render 2x większy niż miniatura, żeby po zmniejszeniu tekst był ostry
      const viewport = page.getViewport({ scale: 480 / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      page.cleanup()
      return canvasToCover(drawCropped(canvas, canvas.width, canvas.height, true))
    },
    destroy() {
      void doc.destroy()
    },
  }
}
