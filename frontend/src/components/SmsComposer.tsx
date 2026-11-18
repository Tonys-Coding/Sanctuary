import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, MessageSquareText, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useMembers } from '../lib/data'
import { todayIso } from '../lib/labels'
import { Avatar, Button, Choice, ErrorNote, Field, Modal, useFeedback } from './ui'

const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/
/** How many SMS a text becomes; accents like á/í/ó/ú use a smaller alphabet (70 characters). */
function smsParts(text: string) {
  const gsm = GSM.test(text)
  const len = [...text].length
  const single = gsm ? 160 : 70
  return { len, gsm, parts: len <= single ? 1 : Math.ceil(len / (gsm ? 153 : 67)), single }
}

interface Result { queued: number; sent: number; failed: number; scheduled: number; skipped: { name: string; reason: 'no_consent' | 'no_phone' }[] }

/**
 * Window for writing a text message to members. `preselect` opens it with people already chosen
 * (e.g. a birthday greeting from the dashboard); `template` fills in the message.
 */
export function SmsComposer({ open, onClose, preselect = [], template = '', kind = 'manual' }: {
  open: boolean
  onClose: () => void
  preselect?: string[]
  template?: string
  kind?: 'manual' | 'reminder' | 'birthday'
}) {
  const { tr, session, date } = useApp()
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const { data: members = [] } = useMembers()
  const reachable = useMemo(() => members.filter((m) => m.sms_opt_in && m.phone), [members])
  const notReachable = members.length - reachable.length
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [when, setWhen] = useState<'now' | 'later'>('now')
  const [day, setDay] = useState(todayIso())
  const [time, setTime] = useState('09:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<Result | null>(null)
  // The current time, refreshed every 30 s, so a scheduled time that has just passed is flagged.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 30_000); return () => clearInterval(t) }, [])

  useEffect(() => {
    if (!open) return
    setChosen(new Set(preselect)); setMessage(template); setWhen('now'); setDay(todayIso()); setTime('09:00')
    setSearch(''); setError(null); setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const church = session?.org.name || ''
  const templates = [
    { label: tr('Recordatorio de culto', 'Service reminder'), text: tr(`Hola {nombre}, te esperamos este domingo a las 10:00 a. m. en ${church}. ¡Dios te bendiga!`, `Hi {name}, we look forward to seeing you this Sunday at 10:00 a.m. at ${church}. God bless you!`) },
    { label: tr('Cumpleaños', 'Birthday'), text: tr(`¡Feliz cumpleaños, {nombre}! Toda la familia de ${church} da gracias a Dios por tu vida.`, `Happy birthday, {name}! Everyone at ${church} thanks God for your life.`) },
    { label: tr('Constancia lista', 'Statement ready'), text: tr(`Hola {nombre}, tu constancia de ofrendas para impuestos ya está lista. Pídela en la tesorería o revisa tu correo. — ${church}`, `Hi {name}, your giving statement for taxes is ready. Ask the treasury or check your e-mail. — ${church}`) },
  ]
  const shown = reachable.filter((m) => m.full_name.toLowerCase().includes(search.toLowerCase()))
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const preview = message.replace(/\{nombre\}|\{name\}/gi, 'María')
  const info = smsParts(preview)
  const sendAt = when === 'later' ? new Date(`${day}T${time}`) : null
  const pastTime = !!sendAt && sendAt.getTime() < nowMs

  const send = async () => {
    setBusy(true); setError(null)
    try {
      const r = await api.post<Result>('/messages', { memberIds: [...chosen], message, kind, sendAt: sendAt ? sendAt.toISOString() : null })
      setResult(r)
      await qc.invalidateQueries({ queryKey: ['messages'] })
      if (!r.failed && !r.skipped.length) {
        toast(r.scheduled ? tr(`${r.scheduled} mensajes programados`, `${r.scheduled} messages scheduled`) : tr(`${r.sent} mensajes enviados`, `${r.sent} messages sent`))
        onClose()
      }
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={tr('Enviar mensaje de texto', 'Send a text message')}
      footer={result ? <Button variant="primary" onClick={onClose}>{tr('Listo', 'Done')}</Button> : (<>
        <Button onClick={onClose}>{tr('Cancelar', 'Cancel')}</Button>
        <Button variant="primary" icon={when === 'now' ? <Send size={18} /> : <CalendarClock size={18} />} busy={busy} onClick={send}
          disabled={!session?.features.sms || chosen.size === 0 || message.trim().length < 2 || pastTime}>
          {when === 'now' ? tr(`Enviar a ${chosen.size}`, `Send to ${chosen.size}`) : tr(`Programar para ${chosen.size}`, `Schedule for ${chosen.size}`)}
        </Button>
      </>)}>
      {result ? (
        <div className="grid gap-3">
          <p className="text-[1.1rem] font-semibold">
            {result.scheduled ? tr(`Se programaron ${result.scheduled} mensajes.`, `${result.scheduled} messages were scheduled.`) : tr(`Se enviaron ${result.sent} mensajes.`, `${result.sent} messages were sent.`)}
          </p>
          {result.failed > 0 && <p className="rounded-[11px] bg-bad-soft text-bad px-4 py-3">{tr(`${result.failed} no se pudieron entregar. Revisa los números en Mensajes → Enviados.`, `${result.failed} could not be delivered. Check the numbers in Messages → Sent.`)}</p>}
          {result.skipped.length > 0 && (
            <p className="rounded-[11px] bg-warn-soft text-warn px-4 py-3">
              {tr('No se enviaron a', 'Not sent to')}: {result.skipped.map((s) => `${s.name} (${s.reason === 'no_consent' ? tr('no aceptó mensajes', 'has not agreed to texts') : tr('sin teléfono válido', 'no valid phone')})`).join(', ')}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-5">
          {!session?.features.sms && <ErrorNote error={tr('Los mensajes de texto aún no están activados. Ve a Mensajes para ver cómo activarlos.', 'Text messages are not turned on yet. Go to Messages to see how to turn them on.')} />}
          <Field label={tr('¿A quién?', 'To whom?')}
            hint={notReachable > 0 ? tr(`Solo aparecen quienes aceptaron recibir mensajes y tienen teléfono (${reachable.length} de ${members.length}). Puedes marcarlo al editar a cada miembro.`, `Only people who agreed to texts and have a phone are listed (${reachable.length} of ${members.length}). You can tick it when editing each member.`) : undefined}>
            {(id) => (<>
              <div className="flex flex-wrap gap-2 mb-2">
                <input id={id} className="ctl !min-h-10 flex-1 min-w-[180px]" placeholder={tr('Buscar miembro', 'Search member')} value={search} onChange={(e) => setSearch(e.target.value)} />
                <Button size="sm" onClick={() => setChosen(new Set(chosen.size === reachable.length ? [] : reachable.map((m) => m.id)))}>
                  {chosen.size === reachable.length && reachable.length > 0 ? tr('Quitar todos', 'Clear all') : tr(`Elegir a todos (${reachable.length})`, `Select all (${reachable.length})`)}
                </Button>
              </div>
              <ul className="max-h-48 overflow-y-auto border border-line rounded-[11px] divide-y divide-line">
                {shown.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-3 px-3 py-2 hover:bg-raised cursor-pointer">
                      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                      <Avatar name={m.full_name} file={m.avatar_file} size={30} />
                      <span className="flex-1 truncate">{m.full_name}</span>
                      <span className="text-muted text-[0.85rem] hidden sm:block">{m.phone}</span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-3 py-3 text-muted">{tr('Nadie que haya aceptado recibir mensajes.', 'Nobody who agreed to receive texts.')}</li>}
              </ul>
            </>)}
          </Field>
          <Field label={tr('Mensaje', 'Message')} hint={tr('Escribe {nombre} donde quieras el nombre de cada persona.', 'Write {name} wherever each person’s first name should go.')}>
            {(id) => (<>
              <div className="flex flex-wrap gap-2 mb-2">
                {templates.map((t) => <Button key={t.label} size="sm" variant="ghost" icon={<MessageSquareText size={16} />} onClick={() => setMessage(t.text)}>{t.label}</Button>)}
              </div>
              <textarea id={id} className="ctl !min-h-28" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
              <p className="mt-1.5 text-[0.88rem] text-muted">
                {tr(`${info.len} caracteres · ${info.parts === 1 ? '1 mensaje' : `${info.parts} mensajes`} por persona`, `${info.len} characters · ${info.parts === 1 ? '1 message' : `${info.parts} messages`} per person`)}
                {!info.gsm && info.len > 0 && tr(' (los acentos como á, í, ó, ú reducen el límite a 70 caracteres por mensaje)', ' (accents like á, í, ó, ú lower the limit to 70 characters per message)')}
              </p>
            </>)}
          </Field>
          {message.trim() && (
            <div>
              <p className="font-semibold text-[0.95rem] mb-1.5">{tr('Así lo verá María', 'This is how María will see it')}</p>
              <div className="max-w-sm rounded-[18px] rounded-bl-[4px] bg-raised px-4 py-3 whitespace-pre-wrap">{preview}</div>
            </div>
          )}
          <Field label={tr('¿Cuándo?', 'When?')}>
            {() => (<div className="grid gap-3">
              <Choice value={when} onChange={setWhen} options={[{ value: 'now', label: tr('Enviar ahora', 'Send now') }, { value: 'later', label: tr('Programar para después', 'Schedule for later') }]} />
              {when === 'later' && (
                <div className="flex flex-wrap items-center gap-3">
                  <input type="date" className="ctl !w-auto" aria-label={tr('Día', 'Day')} min={todayIso()} value={day} onChange={(e) => setDay(e.target.value)} />
                  <input type="time" className="ctl !w-auto" aria-label={tr('Hora', 'Time')} value={time} onChange={(e) => setTime(e.target.value)} />
                  <span className={pastTime ? 'text-bad' : 'text-muted'}>{pastTime ? tr('Esa hora ya pasó.', 'That time has passed.') : `${date(day, 'long')}, ${time}`}</span>
                </div>
              )}
            </div>)}
          </Field>
          <ErrorNote error={error} />
        </div>
      )}
    </Modal>
  )
}
