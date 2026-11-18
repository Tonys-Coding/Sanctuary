import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Download, ExternalLink, FileText } from 'lucide-react'
import { saveBlob } from '../lib/api'
import { useApp } from '../lib/app'
import { Button, ErrorNote, Modal, Spinner } from './ui'

interface Request { title: string; filename: string; load: () => Promise<Blob> }
const PdfPages = lazy(() => import('./PdfPages'))
const Ctx = createContext<(r: Request) => void>(() => {})

/**
 * Every "Descargar PDF" goes through here: the document is shown first, and only
 * "Descargar" saves it, so nobody downloads the wrong report by accident.
 */
export const usePdfPreview = () => useContext(Ctx)

export function PdfPreviewProvider({ children }: { children: ReactNode }) {
  const { tr } = useApp()
  const [req, setReq] = useState<Request | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const open = useCallback((r: Request) => {
    setReq(r); setBlob(null); setUrl(null); setError(null)
    r.load().then(setBlob).catch(setError)
  }, [])

  // The object URL is created and revoked together with the PDF it points to.
  useEffect(() => {
    if (!blob) return
    const pdf = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
    const u = URL.createObjectURL(pdf)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  const close = () => { setReq(null); setBlob(null) }
  const save = () => { if (blob && req) { saveBlob(blob, req.filename); close() } }

  return (
    <Ctx.Provider value={open}>
      {children}
      <Modal open={!!req} onClose={close} wide="xl" title={tr('Vista previa', 'Preview')}
        footer={<>
          {url && <a href={url} target="_blank" rel="noopener" className="mr-auto"><Button variant="ghost" icon={<ExternalLink size={18} />}>{tr('Abrir en otra pestaña', 'Open in a new tab')}</Button></a>}
          <Button onClick={close}>{tr('Cancelar', 'Cancel')}</Button>
          <Button variant="primary" icon={<Download size={18} />} disabled={!blob} onClick={save}>{tr('Descargar', 'Download')}</Button>
        </>}>
        {req && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2.5 text-ink-soft">
              <FileText size={20} className="text-accent-ink shrink-0" aria-hidden />
              <span>{tr('Revisa que sea el documento que necesitas:', 'Check this is the document you need:')} <strong className="text-ink font-semibold">{req.title}</strong></span>
            </p>
            {error ? <ErrorNote error={error} /> : !blob ? (
              <div className="h-[68vh] grid place-items-center rounded-[12px] bg-raised"><Spinner label={tr('Preparando el documento…', 'Preparing the document…')} /></div>
            ) : (
              <Suspense fallback={<div className="h-[68vh] grid place-items-center rounded-[12px] bg-raised"><Spinner /></div>}>
                <div role="document" aria-label={req.title}><PdfPages blob={blob} onError={setError} /></div>
              </Suspense>
            )}
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
