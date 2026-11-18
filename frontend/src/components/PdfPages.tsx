import { useEffect, useRef, useState } from 'react'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useApp } from '../lib/app'

GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Draws every page of a PDF as images, so the preview looks the same in every browser
 * (including phones, which often show only the first page of an embedded PDF).
 * Loaded on demand: pdf.js is only downloaded when someone opens a preview.
 */
export default function PdfPages({ blob, onError }: { blob: Blob; onError: (e: unknown) => void }) {
  const { tr } = useApp()
  const box = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const holder = box.current!
    holder.replaceChildren()
    ;(async () => {
      try {
        const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) })
        const pdf = await task.promise
        if (cancelled) return
        setPages(pdf.numPages)
        const width = Math.min(holder.clientWidth - 32, 900)
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / base.width) * ratio })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = `${width}px`
          canvas.className = 'block mx-auto bg-white shadow-card rounded-[4px]'
          canvas.setAttribute('aria-label', tr(`Página ${n} de ${pdf.numPages}`, `Page ${n} of ${pdf.numPages}`))
          holder.appendChild(canvas)
          await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
        }
        await task.destroy()
      } catch (e) {
        if (!cancelled) onError(e)
      }
    })()
    return () => { cancelled = true }
  }, [blob, onError, tr])

  return (
    <div className="relative">
      {pages != null && (
        <p className="absolute right-3 top-3 z-10 rounded-full bg-ink/80 text-bg text-[0.82rem] font-semibold px-3 py-1">
          {pages === 1 ? tr('1 página', '1 page') : tr(`${pages} páginas`, `${pages} pages`)}
        </p>
      )}
      <div ref={box} className="h-[68vh] overflow-y-auto rounded-[12px] bg-raised p-4 grid gap-4 content-start" />
    </div>
  )
}
