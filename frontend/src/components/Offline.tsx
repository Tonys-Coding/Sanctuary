import { useEffect, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RefreshCw, Trash2, TriangleAlert } from 'lucide-react'
import { useApp } from '../lib/app'
import { discardPending, flushPending, pendingOfferings, subscribePending } from '../lib/offline'
import { useErrorText } from '../lib/labels'
import { ApiError } from '../lib/api'
import { Button, Modal, useFeedback } from './ui'

const useOnline = () => {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

/** Tells people when they are offline, how many offerings wait on this computer, and sends them when possible. */
export function OfflineBanner() {
  const { tr, money, date } = useApp()
  const errorText = useErrorText()
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const online = useOnline()
  const pending = useSyncExternalStore(subscribePending, pendingOfferings)
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  const failed = pending.filter((p) => p.error)

  const send = async (quiet = false) => {
    if (!pendingOfferings().length) return
    setBusy(true)
    try {
      const n = await flushPending()
      if (n) { await qc.invalidateQueries(); toast(tr(`Se enviaron ${n} ofrendas guardadas sin conexión`, `${n} offerings saved offline were sent`)) }
      else if (!quiet && pendingOfferings().some((p) => !p.error)) toast(tr('Todavía no hay conexión con el servidor.', 'Still no connection to the server.'), 'bad')
    } finally { setBusy(false) }
  }
  // Try when the connection comes back, at start, and every 30 seconds while something waits.
  useEffect(() => { if (online) send(true) }, [online]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pending.some((p) => !p.error)) return
    const t = setInterval(() => send(true), 30_000)
    return () => clearInterval(t)
  }, [pending.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (online && !pending.length) return null
  return (
    <div className="no-print px-4 sm:px-6 2xl:px-10 pt-4" role="status">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warn bg-warn-soft px-4 py-3">
        {failed.length ? <TriangleAlert size={22} className="text-warn shrink-0" aria-hidden /> : <CloudOff size={22} className="text-warn shrink-0" aria-hidden />}
        <p className="flex-1 min-w-[16rem]">
          {!online && <strong className="font-semibold">{tr('Sin conexión a internet. ', 'No internet connection. ')}</strong>}
          {pending.length
            ? tr(`${pending.length} ${pending.length === 1 ? 'ofrenda está guardada' : 'ofrendas están guardadas'} en esta computadora y se ${pending.length === 1 ? 'enviará' : 'enviarán'} sola${pending.length === 1 ? '' : 's'} cuando vuelva la conexión. No cierres esta ventana del navegador.`,
              `${pending.length} ${pending.length === 1 ? 'offering is' : 'offerings are'} saved on this computer and will be sent automatically when the connection is back. Do not clear this browser’s data.`)
            : tr('Puedes seguir registrando ofrendas: se guardan aquí y se envían después.', 'You can keep recording offerings: they are kept here and sent later.')}
        </p>
        {pending.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>{tr('Ver', 'View')}</Button>}
        {pending.length > 0 && online && <Button size="sm" icon={<RefreshCw size={16} />} busy={busy} onClick={() => send()}>{tr('Enviar ahora', 'Send now')}</Button>}
      </div>
      <Modal open={details} onClose={() => setDetails(false)} title={tr('Ofrendas guardadas sin conexión', 'Offerings saved offline')}>
        <ul className="grid gap-2">
          {pending.map((p) => (
            <li key={p.ref} className="flex items-center gap-3 p-3 rounded-xl border border-line">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{money(Number(p.body.amount))} · {date(String(p.body.date))}</p>
                <p className="text-muted text-[0.87rem]">{tr('Guardada', 'Saved')} {new Date(p.savedAt).toLocaleTimeString()}</p>
                {p.error && <p className="text-bad text-[0.87rem]">{errorText(new ApiError(400, p.error))}</p>}
              </div>
              {p.error && <Button size="sm" variant="danger" icon={<Trash2 size={16} />} onClick={() => discardPending(p.ref)}>{tr('Descartar', 'Discard')}</Button>}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
