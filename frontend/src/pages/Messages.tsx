import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Cake, CalendarClock, MessageSquareText, Send, X } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import type { SmsMessage } from '../lib/types'
import { Avatar, Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner, useFeedback } from '../components/ui'
import { SmsComposer } from '../components/SmsComposer'

interface Data { enabled: boolean; countryCode: string; birthday: { enabled: boolean; message: string }; messages: SmsMessage[] }

function Setup() {
  const { tr } = useApp()
  const code = (s: string) => <code className="bg-raised px-1.5 py-0.5 rounded text-[0.9em]">{s}</code>
  return (
    <Card className="max-w-3xl">
      <div className="inline-grid place-items-center size-14 rounded-full bg-accent-soft text-accent-ink mb-4"><MessageSquareText size={28} /></div>
      <h2 className="font-semibold text-[1.2rem]">{tr('Los mensajes de texto están listos; solo falta conectarlos', 'Text messages are ready; they just need connecting')}</h2>
      <p className="text-ink-soft mt-2">
        {tr('Sanctuary envía los SMS a través de Twilio, un servicio muy usado para esto. Cada mensaje cuesta alrededor de 1 centavo de dólar y se paga directamente a Twilio. Quien administra el servidor debe:',
          'Sanctuary sends texts through Twilio, a widely used service for this. Each message costs about 1 US cent, paid directly to Twilio. Whoever runs the server needs to:')}
      </p>
      <ol className="list-decimal pl-6 mt-4 grid gap-2 text-ink-soft">
        <li>{tr('Crear una cuenta en', 'Create an account at')} <span className="font-semibold text-ink">twilio.com</span> {tr('y comprar un número de teléfono (en EE. UU. hay que registrarlo para mensajes, un trámite de unos días).', 'and buy a phone number (in the US it must be registered for messaging, which takes a few days).')}</li>
        <li>{tr('Copiar en', 'Copy into')} {code('backend/.env')}: {code('TWILIO_ACCOUNT_SID')}, {code('TWILIO_AUTH_TOKEN')} {tr('y', 'and')} {code('TWILIO_FROM')} {tr('(el número comprado).', '(the number you bought).')}</li>
        <li>{tr('Reiniciar el servidor.', 'Restart the server.')}</li>
        <li>{tr('Marcar en cada miembro la casilla', 'Tick, for each member, the box')} <span className="font-semibold text-ink">{tr('«Acepta recibir mensajes de texto»', '“Agrees to receive text messages”')}</span>. {tr('Solo se envían SMS a quienes lo aceptaron.', 'Texts only go to people who agreed.')}</li>
      </ol>
      <p className="text-muted text-[0.88rem] mt-4">{tr('Si alguien responde STOP, Twilio deja de enviarle mensajes automáticamente.', 'If someone replies STOP, Twilio automatically stops texting them.')}</p>
    </Card>
  )
}

function BirthdayCard({ data }: { data: Data['birthday'] }) {
  const { tr } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const [enabled, setEnabled] = useState(data.enabled)
  const [message, setMessage] = useState(data.message)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setEnabled(data.enabled); setMessage(data.message) }, [data])
  const save = async (on = enabled) => {
    setBusy(true)
    try { await api.patch('/messages/birthday', { enabled: on, message }); await qc.invalidateQueries({ queryKey: ['messages'] }); toast(tr('Guardado', 'Saved')) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  return (
    <Card title={<span className="flex items-center gap-2"><Cake size={19} className="text-accent-ink" />{tr('Felicitaciones de cumpleaños automáticas', 'Automatic birthday greetings')}</span>}
      hint={tr('Cada día, a partir de las 9:00 a. m., se envía este mensaje a quienes cumplen años (si aceptaron recibir mensajes).', 'Every day from 9:00 a.m., this message goes to whoever has a birthday (if they agreed to texts).')}>
      <label className="flex items-center gap-3 cursor-pointer w-fit">
        <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); save(e.target.checked) }} />
        <span className="font-semibold">{enabled ? tr('Activadas', 'On') : tr('Desactivadas', 'Off')}</span>
      </label>
      <textarea className="ctl mt-4 !min-h-24" aria-label={tr('Mensaje de cumpleaños', 'Birthday message')} value={message} onChange={(e) => setMessage(e.target.value)} />
      <p className="text-muted text-[0.88rem] mt-1.5">{tr('{nombre} se cambia por el nombre de la persona y {iglesia} por el nombre de la iglesia.', '{name} becomes the person’s first name and {church} the church’s name.')}</p>
      <Button className="mt-3" busy={busy} onClick={() => save()}>{tr('Guardar mensaje', 'Save message')}</Button>
    </Card>
  )
}

export default function Messages() {
  const { tr, lang } = useApp()
  const qc = useQueryClient()
  const { fail } = useFeedback()
  const [composing, setComposing] = useState(false)
  const { data, isPending, error } = useQuery({ queryKey: ['messages'], queryFn: () => api.get<Data>('/messages') })

  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const statusBadge = (st: SmsMessage['status']) => ({
    scheduled: <Badge tone="accent"><CalendarClock size={13} />{tr('Programado', 'Scheduled')}</Badge>,
    sending: <Badge>{tr('Enviando…', 'Sending…')}</Badge>,
    sent: <Badge tone="good">{tr('Enviado', 'Sent')}</Badge>,
    failed: <Badge tone="bad">{tr('Falló', 'Failed')}</Badge>,
    canceled: <Badge>{tr('Cancelado', 'Canceled')}</Badge>,
  })[st]
  const kind = { manual: '', reminder: tr('Recordatorio', 'Reminder'), birthday: tr('Cumpleaños', 'Birthday') }
  const cancel = (batchId: string) => api.del(`/messages/batch/${batchId}`).then(() => qc.invalidateQueries({ queryKey: ['messages'] })).catch(fail)

  // One row per send: a message to 38 people is one entry, not 38.
  type Group = { key: string; batchId: string | null; items: SmsMessage[] }
  const groups: Group[] = []
  for (const m of data?.messages || []) {
    const key = m.batch_id || m.id
    const g = groups.find((x) => x.key === key)
    if (g) g.items.push(m)
    else groups.push({ key, batchId: m.batch_id, items: [m] })
  }
  const scheduled = groups.filter((g) => g.items.some((m) => m.status === 'scheduled'))
  const history = groups.filter((g) => !g.items.some((m) => m.status === 'scheduled'))

  const row = (g: Group) => {
    const first = g.items[0]
    const n = g.items.length
    const count = (st: SmsMessage['status']) => g.items.filter((m) => m.status === st).length
    const names = g.items.map((m) => (m.member_name || m.to_phone).split(' ')[0])
    const who = n === 1 ? (first.member_name || first.to_phone) : n === 2 ? `${names[0]} ${tr('y', 'and')} ${names[1]}` : `${names[0]}, ${names[1]} ${tr(`y ${n - 2} más`, `and ${n - 2} more`)}`
    const isScheduled = count('scheduled') > 0
    return (
      <li key={g.key} className="px-5 sm:px-6 py-4">
        <div className="flex items-start gap-3.5">
          <div className="flex -space-x-2 shrink-0" aria-hidden>
            {g.items.slice(0, 3).map((m) => <Avatar key={m.id} name={m.member_name || m.to_phone} file={m.member_avatar} size={38} className="ring-2 ring-surface" />)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{who}</span>
              {isScheduled ? statusBadge('scheduled') : n === 1 ? statusBadge(first.status) : (<>
                {count('sent') > 0 && <Badge tone="good">{tr(`${count('sent')} enviados`, `${count('sent')} sent`)}</Badge>}
                {count('failed') > 0 && <Badge tone="bad">{tr(`${count('failed')} fallaron`, `${count('failed')} failed`)}</Badge>}
                {count('canceled') > 0 && <Badge>{tr(`${count('canceled')} cancelados`, `${count('canceled')} canceled`)}</Badge>}
              </>)}
              {kind[first.kind] && <Badge>{kind[first.kind]}</Badge>}
            </p>
            <p className="text-ink-soft mt-1 whitespace-pre-wrap break-words">{first.body}</p>
            <p className="text-muted text-[0.85rem] mt-1">
              {isScheduled ? `${tr('Se enviará', 'Will send')} ${when(first.send_at)}` : when(first.sent_at || first.send_at)}
              {n > 1 && ` · ${tr('cada persona lo recibe con su nombre', 'each person gets it with their own name')}`}
            </p>
            {(n > 1 || first.error) && (
              <details className="mt-2">
                <summary className="text-accent-ink font-semibold text-[0.92rem] w-fit">{tr(`Ver destinatarios (${n})`, `See recipients (${n})`)}</summary>
                <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[0.92rem]">
                  {g.items.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{m.member_name || m.to_phone}</span>
                      {statusBadge(m.status)}
                      {m.error && <span className="text-bad truncate" title={m.error}>{m.error}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          {isScheduled && g.batchId && <Button size="sm" variant="ghost" icon={<X size={17} />} onClick={() => cancel(g.batchId!)}>{tr('Cancelar envío', 'Cancel sending')}</Button>}
        </div>
      </li>
    )
  }

  return (
    <>
      <PageHeader title={tr('Mensajes', 'Messages')} subtitle={tr('Envía mensajes de texto (SMS) a los miembros: recordatorios, felicitaciones y avisos. Puedes programarlos para otro día.', 'Send text messages (SMS) to members: reminders, greetings and notices. You can schedule them for another day.')}>
        {data?.enabled && <Button variant="primary" icon={<Send size={19} />} onClick={() => setComposing(true)}>{tr('Nuevo mensaje', 'New message')}</Button>}
      </PageHeader>
      {isPending ? <Spinner /> : error ? <ErrorNote error={error} /> : !data!.enabled ? <Setup /> : (
        <div className="grid 2xl:grid-cols-[minmax(0,1fr)_28rem] gap-5 items-start">
          <div className="grid gap-5">
            <Card pad={false} title={tr(`Programados (${scheduled.length})`, `Scheduled (${scheduled.length})`)} hint={tr('Se enviarán solos a la hora indicada.', 'They will go out on their own at the set time.')}>
              {scheduled.length === 0 ? <p className="text-muted px-5 sm:px-6 py-4">{tr('No hay mensajes programados.', 'No scheduled messages.')}</p> : <ul className="mt-3 border-t border-line divide-y divide-line">{scheduled.map(row)}</ul>}
            </Card>
            <Card pad={false} title={tr('Enviados en los últimos 90 días', 'Sent in the last 90 days')}>
              {history.length === 0 ? <Empty icon={<MessageSquareText size={28} />} title={tr('Todavía no se ha enviado ningún mensaje', 'No messages sent yet')} /> : <ul className="mt-3 border-t border-line divide-y divide-line">{history.map(row)}</ul>}
            </Card>
          </div>
          <BirthdayCard data={data!.birthday} />
        </div>
      )}
      <SmsComposer open={composing} onClose={() => setComposing(false)} />
    </>
  )
}
