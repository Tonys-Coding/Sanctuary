import { useEffect, useMemo, useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useMembers } from '../lib/data'
import { Avatar, Button, ErrorNote, Field, Modal, useFeedback } from './ui'

export interface SendResult { sent: number; failed: string[]; skipped: string[] }

/**
 * Window for e-mailing a document to members. Recipients are either chosen here
 * (`pickRecipients`) or decided by the caller (`fixedRecipients` just shows how many).
 */
export function EmailComposer({ open, onClose, title, intro, defaultSubject, defaultMessage, aiContext, pickRecipients, fixedRecipients, onSend }: {
  open: boolean
  onClose: () => void
  title: string
  intro?: string
  defaultSubject: string
  defaultMessage: string
  aiContext: string
  pickRecipients?: boolean
  fixedRecipients?: number
  onSend: (m: { subject: string; message: string; memberIds: string[]; emails: string[] }) => Promise<SendResult>
}) {
  const { tr, session } = useApp()
  const { toast } = useFeedback()
  const { data: members = [] } = useMembers()
  const withEmail = useMemo(() => members.filter((m) => m.email), [members])
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<SendResult | null>(null)

  useEffect(() => {
    if (open) { setSubject(defaultSubject); setMessage(defaultMessage); setChosen(new Set()); setExtra(''); setError(null); setResult(null); setSearch('') }
  }, [open, defaultSubject, defaultMessage])

  const emails = extra.split(/[\s,;]+/).map((e) => e.trim()).filter((e) => /^\S+@\S+\.\S+$/.test(e))
  const count = pickRecipients ? chosen.size + emails.length : fixedRecipients || 0
  const shown = withEmail.filter((m) => m.full_name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const draft = async () => {
    setDrafting(true); setError(null)
    try {
      const d = await api.post<{ subject: string; body: string }>('/ai/draft-email', { purpose: message.trim() || defaultMessage, context: aiContext })
      if (d.subject) setSubject(d.subject)
      if (d.body) setMessage(d.body)
    } catch (e) { setError(e) } finally { setDrafting(false) }
  }
  const send = async () => {
    setBusy(true); setError(null)
    try {
      const r = await onSend({ subject, message, memberIds: [...chosen], emails })
      setResult(r)
      if (r.sent && !r.failed.length && !r.skipped.length) { toast(tr(`${r.sent} correos enviados`, `${r.sent} e-mails sent`)); onClose() }
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  const noEmail = !session?.features.email
  return (
    <Modal open={open} onClose={onClose} wide title={title}
      footer={result ? <Button variant="primary" onClick={onClose}>{tr('Listo', 'Done')}</Button> : (<>
        <Button onClick={onClose}>{tr('Cancelar', 'Cancel')}</Button>
        <Button variant="primary" icon={<Send size={18} />} busy={busy} onClick={send} disabled={noEmail || count === 0 || subject.trim().length < 2 || message.trim().length < 2}>
          {count > 0 ? tr(`Enviar a ${count}`, `Send to ${count}`) : tr('Enviar', 'Send')}
        </Button>
      </>)}>
      {result ? (
        <div className="grid gap-3">
          <p className="text-[1.1rem] font-semibold">{tr(`Se enviaron ${result.sent} correos.`, `${result.sent} e-mails were sent.`)}</p>
          {result.skipped.length > 0 && <p className="rounded-[11px] bg-warn-soft text-warn px-4 py-3">{tr('Sin correo registrado (no se les envió):', 'No e-mail on file (not sent):')} {result.skipped.join(', ')}</p>}
          {result.failed.length > 0 && <p className="rounded-[11px] bg-bad-soft text-bad px-4 py-3">{tr('No se pudo entregar a:', 'Could not deliver to:')} {result.failed.join(', ')}</p>}
        </div>
      ) : (
        <div className="grid gap-5">
          {noEmail && <ErrorNote error={tr('El envío de correos aún no está configurado. Quien administra el servidor debe completar los datos SMTP en el archivo .env.', 'Sending e-mail is not set up yet. Whoever runs the server needs to fill in the SMTP settings in the .env file.')} />}
          {intro && <p className="text-ink-soft">{intro}</p>}
          {pickRecipients && (
            <Field label={tr('¿A quién se lo envías?', 'Who are you sending it to?')} hint={tr('Solo aparecen los miembros que tienen correo registrado.', 'Only members with an e-mail on file are listed.')}>
              {(id) => (<>
                <div className="flex flex-wrap gap-2 mb-2">
                  <input id={id} className="ctl !min-h-10 flex-1 min-w-[180px]" placeholder={tr('Buscar miembro', 'Search member')} value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Button size="sm" onClick={() => setChosen(new Set(chosen.size === withEmail.length ? [] : withEmail.map((m) => m.id)))}>
                    {chosen.size === withEmail.length && withEmail.length > 0 ? tr('Quitar todos', 'Clear all') : tr(`Elegir a todos (${withEmail.length})`, `Select all (${withEmail.length})`)}
                  </Button>
                </div>
                <ul className="max-h-52 overflow-y-auto border border-line rounded-[11px] divide-y divide-line">
                  {shown.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-3 px-3 py-2 hover:bg-raised cursor-pointer">
                        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                        <Avatar name={m.full_name} file={m.avatar_file} size={30} />
                        <span className="flex-1 truncate">{m.full_name}</span>
                        <span className="text-muted text-[0.85rem] truncate hidden sm:block">{m.email}</span>
                      </label>
                    </li>
                  ))}
                  {shown.length === 0 && <li className="px-3 py-3 text-muted">{tr('Ningún miembro con correo.', 'No members with an e-mail.')}</li>}
                </ul>
                <input className="ctl mt-2" placeholder={tr('Otros correos, separados por comas (opcional)', 'Other e-mails, separated by commas (optional)')} value={extra} onChange={(e) => setExtra(e.target.value)} />
              </>)}
            </Field>
          )}
          <Field label={tr('Asunto', 'Subject')}>{(id) => <input id={id} className="ctl" value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
          <Field label={tr('Mensaje', 'Message')} hint={tr('Escribe {nombre} donde quieras que aparezca el nombre de cada persona.', 'Write {name} wherever each person’s first name should appear.')}>
            {(id) => <textarea id={id} className="ctl !min-h-44" value={message} onChange={(e) => setMessage(e.target.value)} />}
          </Field>
          {session?.features.ai && (
            <div className="-mt-2">
              <Button size="sm" icon={<Sparkles size={16} />} busy={drafting} onClick={draft}>{tr('Mejorar el mensaje con IA', 'Improve the message with AI')}</Button>
            </div>
          )}
          <ErrorNote error={error} />
        </div>
      )}
    </Modal>
  )
}
