import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, MessageSquareText, CircleCheck, Copy, DatabaseBackup, Download, History, Mail, Monitor, Moon, Pencil, Plus, Sparkles, Sun, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { api, download } from '../lib/api'
import { useApp } from '../lib/app'
import { fileUrl } from '../lib/api'
import { useFunds } from '../lib/data'
import { seriesColor, useErrorText, useLabels } from '../lib/labels'
import { OnlineImport } from '../components/OnlineImport'
import type { Fund, Org, Theme } from '../lib/types'
import { Avatar, AvatarPicker, Badge, Button, Card, Choice, ErrorNote, Field, IconButton, Modal, PageHeader, Spinner, Tabs, cx, useFeedback } from '../components/ui'
import { Logo } from '../components/Layout'

type Tab = 'iglesia' | 'finanzas' | 'fondos' | 'equipo' | 'perfil' | 'datos' | 'sistema'

// ─── Church ──────────────────────────────────────────────────────────────────

function ChurchTab() {
  const { tr, session, refresh } = useApp()
  const labels = useLabels()
  const { toast, fail } = useFeedback()
  const [f, setF] = useState<Org>(session!.org)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const file = useRef<HTMLInputElement>(null)
  const bind = (k: keyof Org) => ({ value: (f[k] as string) || '', onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) })
  const save = async () => {
    setBusy(true); setError(null)
    try { await api.patch('/org', f); await refresh(); toast(tr('Datos de la iglesia guardados', 'Church details saved')) } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const logo = async (fl: File) => { try { await api.upload('/org/logo', fl); await refresh(); toast(tr('Logo actualizado', 'Logo updated')) } catch (e) { fail(e) } }
  const input = (k: keyof Org, label: string, opts: { hint?: string; optional?: boolean; className?: string; type?: string } = {}) => (
    <Field label={label} hint={opts.hint} optional={opts.optional} className={opts.className}>{(id) => <input id={id} className="ctl" type={opts.type} {...bind(k)} />}</Field>
  )
  return (
    <form className="grid gap-5 max-w-4xl" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Card title={tr('Logo de la iglesia', 'Church logo')} hint={tr('Aparece en el menú, en los informes y en las constancias.', 'Shown in the menu, on reports and on statements.')}>
        <div className="flex flex-wrap items-center gap-5">
          <div className="size-24 rounded-[14px] border border-line bg-bg grid place-items-center p-2">
            {session!.org.logo_file ? <img src={fileUrl(session!.org.logo_file)} alt="" className="max-h-full max-w-full object-contain" /> : <Logo size={72} />}
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button icon={<Upload size={18} />} onClick={() => file.current?.click()}>{tr('Subir logo', 'Upload logo')}</Button>
            {session!.org.logo_file && <Button variant="ghost" onClick={() => api.del('/org/logo').then(refresh).catch(fail)}>{tr('Usar el logo de Sanctuary', 'Use the Sanctuary logo')}</Button>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) logo(x); e.target.value = '' }} />
          </div>
        </div>
      </Card>
      <Card title={tr('Datos de la iglesia', 'Church details')}>
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-4">
          {input('name', tr('Nombre de la iglesia', 'Church name'))}
          {input('legal_name', tr('Nombre legal', 'Legal name'), { optional: true, hint: tr('Como aparece ante el gobierno, si es distinto.', 'As registered with the government, if different.') })}
          {input('tax_id', tr('Número de identificación fiscal (EIN)', 'Tax ID (EIN)'), { optional: true, hint: tr('Se imprime en las constancias de impuestos.', 'Printed on tax statements.') })}
          {input('phone', tr('Teléfono', 'Phone'), { optional: true, type: 'tel' })}
          {input('address', tr('Dirección', 'Address'), { optional: true, className: 'sm:col-span-2' })}
          {input('city', tr('Ciudad', 'City'), { optional: true })}
          <div className="grid grid-cols-2 gap-4">{input('state', tr('Estado', 'State'), { optional: true })}{input('postal_code', tr('Código postal', 'Zip code'), { optional: true })}</div>
          {input('email', tr('Correo de la tesorería', 'Treasury e-mail'), { optional: true, type: 'email', hint: tr('Las respuestas a los correos enviados llegan aquí.', 'Replies to e-mails you send arrive here.') })}
          <Field label={tr('Moneda', 'Currency')}>
            {(id) => <select id={id} className="ctl" {...bind('currency')}>{['USD', 'MXN', 'CAD', 'EUR', 'GTQ', 'HNL', 'CRC', 'DOP', 'COP', 'PEN', 'CLP', 'ARS'].map((c) => <option key={c}>{c}</option>)}</select>}
          </Field>
          {input('pastor_name', tr('Pastor', 'Pastor'), { optional: true })}
          {input('treasurer_name', tr('Tesorero o tesorera', 'Treasurer'), { optional: true, hint: tr('Firma las constancias.', 'Signs the statements.') })}
          <Field label={tr('Texto legal de las constancias', 'Legal wording on statements')} optional className="sm:col-span-2"
            hint={tr('Si lo dejas vacío se usa el texto estándar del IRS: “No se entregaron bienes ni servicios a cambio de estas contribuciones, salvo beneficios religiosos intangibles.”', 'If left empty, the standard IRS wording is used: “No goods or services were provided in exchange for these contributions, other than intangible religious benefits.”')}>
            {(id) => <textarea id={id} className="ctl" {...bind('statement_note')} />}
          </Field>
        </div>
      </Card>
      <Card title={tr('Hora, año fiscal y seguridad', 'Time, fiscal year and security')}>
        <div className="grid sm:grid-cols-3 gap-x-5 gap-y-4">
          <Field label={tr('Zona horaria de la iglesia', 'Church time zone')} hint={tr('Decide qué día es «hoy» y a qué hora salen los mensajes automáticos.', 'Decides what day “today” is and when automatic messages go out.')}>
            {(id) => <select id={id} className="ctl" value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{timeZones(f.timezone).map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select>}
          </Field>
          <Field label={tr('El año fiscal empieza en', 'The fiscal year starts in')} hint={tr('Enero si la iglesia usa el año normal.', 'January if the church uses the calendar year.')}>
            {(id) => <select id={id} className="ctl" value={f.fiscal_year_start} onChange={(e) => setF({ ...f, fiscal_year_start: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{labels.month(i + 1, 'long')}</option>)}</select>}
          </Field>
          <Field label={tr('Cerrar sesión sin actividad después de', 'Sign out when idle after')} hint={tr('Protege la información si alguien deja la computadora abierta.', 'Protects the data if someone leaves the computer open.')}>
            {(id) => <select id={id} className="ctl" value={f.idle_minutes} onChange={(e) => setF({ ...f, idle_minutes: Number(e.target.value) })}>
              {[5, 10, 15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? tr(`${m} minutos`, `${m} minutes`) : tr(`${m / 60} ${m === 60 ? 'hora' : 'horas'}`, `${m / 60} ${m === 60 ? 'hour' : 'hours'}`)}</option>)}
              <option value={0}>{tr('Nunca (no recomendado)', 'Never (not recommended)')}</option>
            </select>}
          </Field>
        </div>
      </Card>
      {session!.features.aiConfigured && (
        <Card title={tr('Inteligencia artificial', 'Artificial intelligence')} hint={tr('Cuando está encendida, los datos necesarios para cada respuesta se envían a Google Gemini. Puedes apagarla para toda la iglesia.', 'When on, the data needed for each answer is sent to Google Gemini. You can turn it off for the whole church.')}>
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <input type="checkbox" className="size-6 accent-[var(--accent)]" checked={f.ai_enabled} onChange={(e) => setF({ ...f, ai_enabled: e.target.checked })} />
            <span className="font-semibold">{tr('Usar funciones de IA en esta iglesia', 'Use AI features in this church')}</span>
          </label>
        </Card>
      )}
      <ErrorNote error={error} />
      <div><Button type="submit" variant="primary" size="lg" busy={busy}>{tr('Guardar cambios', 'Save changes')}</Button></div>
    </form>
  )
}

/** Every time zone the browser knows, with the church's current one always included. */
function timeZones(current: string) {
  let all: string[] = []
  try { all = (Intl as any).supportedValuesOf('timeZone') } catch { /* older browsers */ }
  const common = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico', 'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Guatemala', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Santo_Domingo', 'Europe/Madrid', 'UTC']
  return Array.from(new Set([current, ...common, ...all]))
}

// ─── Finances ────────────────────────────────────────────────────────────────

function FinanceTab() {
  const { tr, session, refresh, money } = useApp()
  const { toast } = useFeedback()
  const [f, setF] = useState<Org>(session!.org)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)
  const save = async () => {
    setBusy('save'); setError(null)
    try { await api.patch('/org', { ...f, opening_balance: f.opening_balance === null || (f.opening_balance as unknown) === '' ? null : Number(f.opening_balance) }); await refresh(); toast(tr('Guardado', 'Saved')) } catch (e) { setError(e) } finally { setBusy('') }
  }
  const test = async () => {
    setBusy('test'); setError(null)
    try { await api.patch('/org', f); await refresh(); const r = await api.post<{ sent: number }>('/org/board-report/test'); toast(tr(`Informe enviado a ${r.sent} ${r.sent === 1 ? 'persona' : 'personas'}`, `Report sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}`)) } catch (e) { setError(e) } finally { setBusy('') }
  }
  return (
    <form className="grid gap-5 max-w-4xl" onSubmit={(e) => { e.preventDefault(); save() }}>
      <Card title={tr('Saldo inicial', 'Opening balance')} hint={tr('Lo que había en el banco el día que empezaste a usar Sanctuary. Con esto, el informe de tesorería calcula el saldo de cada mes.', 'What was in the bank the day you started using Sanctuary. With it, the treasurer’s report works out each month’s balance.')}>
        <div className="grid sm:grid-cols-2 gap-5 max-w-xl">
          <Field label={tr('Saldo en el banco', 'Bank balance')} optional>
            {(id) => <input id={id} className="ctl" inputMode="decimal" placeholder="0.00" value={f.opening_balance ?? ''} onChange={(e) => setF({ ...f, opening_balance: (e.target.value.replace(/[^\d.-]/g, '') as unknown as number) })} />}
          </Field>
          <Field label={tr('A la fecha de', 'As of')} optional>
            {(id) => <input id={id} type="date" className="ctl" value={f.opening_balance_date ?? ''} onChange={(e) => setF({ ...f, opening_balance_date: e.target.value || null })} />}
          </Field>
        </div>
        {f.opening_balance != null && f.opening_balance_date && <p className="text-muted mt-2">{tr(`Desde ese día se suman las ofrendas y se restan los gastos. Saldo inicial: ${money(Number(f.opening_balance) || 0)}.`, `From that day offerings are added and expenses subtracted. Opening balance: ${money(Number(f.opening_balance) || 0)}.`)}</p>}
      </Card>
      <Card title={tr('Informe mensual a la junta', 'Monthly report to the board')} hint={tr('Cada mes, Sanctuary envía por correo el informe de tesorería del mes anterior (en PDF) a las personas que indiques.', 'Every month, Sanctuary e-mails the previous month’s treasurer’s report (as a PDF) to the people you choose.')}>
        {!session!.features.email && <p className="rounded-[11px] bg-warn-soft px-4 py-2.5 mb-4">{tr('Para enviarlo hace falta configurar el correo (SMTP) en el servidor.', 'E-mail (SMTP) must be set up on the server to send it.')}</p>}
        <div className="grid gap-5">
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <input type="checkbox" className="size-6 accent-[var(--accent)]" checked={f.board_report_enabled} onChange={(e) => setF({ ...f, board_report_enabled: e.target.checked })} />
            <span className="font-semibold">{tr('Enviar el informe automáticamente cada mes', 'Send the report automatically every month')}</span>
          </label>
          <Field label={tr('Correos de la junta', 'Board e-mails')} hint={tr('Separados por comas.', 'Separated by commas.')}>
            {(id) => <textarea id={id} className="ctl !min-h-20" placeholder="pastor@iglesia.org, junta@iglesia.org" value={f.board_emails ?? ''} onChange={(e) => setF({ ...f, board_emails: e.target.value })} />}
          </Field>
          <div className="grid sm:grid-cols-2 gap-5 max-w-xl">
            <Field label={tr('Día del mes', 'Day of the month')}>
              {(id) => <select id={id} className="ctl" value={f.board_report_day} onChange={(e) => setF({ ...f, board_report_day: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>}
            </Field>
            <Field label={tr('Idioma del informe', 'Report language')}>
              {(id) => <select id={id} className="ctl" value={f.board_report_lang} onChange={(e) => setF({ ...f, board_report_lang: e.target.value as Org['board_report_lang'] })}><option value="es">Español</option><option value="en">English</option></select>}
            </Field>
          </div>
          {f.board_report_last && <p className="text-muted">{tr(`Último informe enviado: ${f.board_report_last}`, `Last report sent: ${f.board_report_last}`)}</p>}
        </div>
      </Card>
      <ErrorNote error={error} />
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="primary" size="lg" busy={busy === 'save'}>{tr('Guardar cambios', 'Save changes')}</Button>
        {session!.features.email && <Button size="lg" icon={<Mail size={19} />} busy={busy === 'test'} disabled={!f.board_emails?.trim()} onClick={test}>{tr('Enviar el del mes pasado ahora', 'Send last month’s now')}</Button>}
      </div>
    </form>
  )
}

// ─── Funds ───────────────────────────────────────────────────────────────────

function FundsTab() {
  const { tr, money } = useApp()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const { data: funds, isPending } = useFunds(true)
  const [f, setF] = useState<{ id?: string; name: string; color_slot: number; tax_deductible: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const done = async (msg: string) => { await qc.invalidateQueries(); toast(msg) }
  const save = async () => {
    if (!f) return
    setBusy(true); setError(null)
    try { if (f.id) await api.patch(`/funds/${f.id}`, f); else await api.post('/funds', f); await done(tr('Fondo guardado', 'Fund saved')); setF(null) } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const archive = (x: Fund, archived: boolean) => api.patch(`/funds/${x.id}`, { ...x, archived }).then(() => done(archived ? tr('Fondo archivado', 'Fund archived') : tr('Fondo restaurado', 'Fund restored'))).catch(fail)
  const remove = async (x: Fund) => {
    if (!(await confirm({ title: tr(`¿Eliminar el fondo “${x.name}”?`, `Delete the fund “${x.name}”?`), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete') }))) return
    api.del(`/funds/${x.id}`).then(() => done(tr('Fondo eliminado', 'Fund deleted'))).catch(fail)
  }
  return (
    <div className="max-w-4xl">
      <Card pad={false} title={tr('Fondos', 'Funds')} hint={tr('Los fondos separan el dinero según su propósito: diezmos, ofrendas, misiones…', 'Funds separate money by purpose: tithes, offerings, missions…')}
        action={<Button variant="primary" icon={<Plus size={19} />} onClick={() => { setError(null); setF({ name: '', color_slot: ((funds?.length || 0) % 8) + 1, tax_deductible: true }) }}>{tr('Nuevo fondo', 'New fund')}</Button>}>
        {isPending ? <Spinner /> : (
          <ul className="mt-4 border-t border-line divide-y divide-line">
            {funds!.map((x) => (
              <li key={x.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 px-5 sm:px-6 py-3', x.archived_at && 'opacity-60')}>
                <span className="size-4 rounded-[5px] shrink-0" style={{ background: seriesColor(x.color_slot) }} aria-hidden />
                <span className="flex-1 min-w-[140px] font-semibold">{x.name}</span>
                {x.archived_at ? <Badge>{tr('Archivado', 'Archived')}</Badge> : x.tax_deductible ? <Badge tone="good">{tr('Deducible', 'Deductible')}</Badge> : <Badge tone="warn">{tr('No deducible', 'Not deductible')}</Badge>}
                <span className="w-32 text-right text-ink-soft">{money(x.total_year)} <span className="block text-muted text-[0.8rem]">{tr('este año', 'this year')}</span></span>
                <span className="flex">
                  <IconButton label={tr('Editar', 'Edit')} onClick={() => { setError(null); setF({ id: x.id, name: x.name, color_slot: x.color_slot, tax_deductible: x.tax_deductible }) }}><Pencil size={18} /></IconButton>
                  {x.archived_at
                    ? <IconButton label={tr('Restaurar', 'Restore')} onClick={() => archive(x, false)}><ArchiveRestore size={18} /></IconButton>
                    : x.offering_count > 0
                      ? <IconButton label={tr('Archivar', 'Archive')} onClick={() => archive(x, true)}><Archive size={18} /></IconButton>
                      : <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(x)}><Trash2 size={18} /></IconButton>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? tr('Editar fondo', 'Edit fund') : tr('Nuevo fondo', 'New fund')}
        footer={<><Button onClick={() => setF(null)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} onClick={save} disabled={!f?.name.trim()}>{tr('Guardar', 'Save')}</Button></>}>
        {f && (
          <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
            <Field label={tr('Nombre del fondo', 'Fund name')}>{(id) => <input id={id} className="ctl" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            <Field label={tr('Color en las gráficas', 'Colour in charts')}>
              {() => (
                <div role="radiogroup" className="flex flex-wrap gap-2.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={f.color_slot === s} aria-label={`${tr('Color', 'Colour')} ${s}`} onClick={() => setF({ ...f, color_slot: s })}
                      className={cx('size-11 rounded-full grid place-items-center border-[3px]', f.color_slot === s ? 'border-ink' : 'border-transparent')}>
                      <span className="size-8 rounded-full" style={{ background: seriesColor(s) }} />
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label={tr('¿Cuenta para la deducción de impuestos?', 'Does it count toward tax deductions?')} hint={tr('Elige “No” para ventas de comida, rifas o cualquier pago donde la persona recibe algo a cambio.', 'Choose “No” for food sales, raffles or any payment where the person receives something in return.')}>
              {() => <Choice value={f.tax_deductible ? 'si' : 'no'} onChange={(v) => setF({ ...f, tax_deductible: v === 'si' })} options={[{ value: 'si', label: tr('Sí, es deducible', 'Yes, deductible') }, { value: 'no', label: tr('No', 'No') }]} />}
            </Field>
            <ErrorNote error={error} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </div>
  )
}

// ─── Team & invitations ──────────────────────────────────────────────────────

function TeamTab() {
  const { tr, session, date } = useApp()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const team = useQuery({ queryKey: ['team'], queryFn: () => api.get<any[]>('/org/team') })
  const invites = useQuery({ queryKey: ['invitations'], queryFn: () => api.get<any[]>('/org/invitations') })
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ note: '', maxUses: '1', expiresInDays: '7' })
  const [busy, setBusy] = useState(false)

  const pretty = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`
  const link = (c: string) => `${location.origin}/registro?codigo=${c}`
  const copy = (text: string, msg: string) => navigator.clipboard.writeText(text).then(() => toast(msg)).catch(() => {})
  const create = async () => {
    setBusy(true)
    try { await api.post('/org/invitations', { note: f.note, maxUses: f.maxUses || null, expiresInDays: f.expiresInDays || null }); await qc.invalidateQueries({ queryKey: ['invitations'] }); setOpen(false); toast(tr('Invitación creada', 'Invitation created')) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const revoke = (i: any) => api.del(`/org/invitations/${i.id}`).then(() => qc.invalidateQueries({ queryKey: ['invitations'] })).catch(fail)
  const removeUser = async (u: any) => {
    if (!(await confirm({ title: tr(`¿Quitar el acceso de ${u.full_name}?`, `Remove ${u.full_name}’s access?`), danger: true, confirm: tr('Sí, quitar acceso', 'Yes, remove access'), body: tr('Ya no podrá entrar a Sanctuary. Lo que registró se conserva.', 'They will no longer be able to sign in. Everything they recorded is kept.') }))) return
    api.del(`/org/team/${u.id}`).then(() => qc.invalidateQueries({ queryKey: ['team'] })).catch(fail)
  }
  const active = (invites.data || []).filter((i) => i.active)

  return (
    <div className="grid gap-5 max-w-4xl">
      <Card pad={false} title={tr('Equipo de tesorería', 'Treasury team')} hint={tr('Todas las personas del equipo pueden ver y modificar la información de la iglesia.', 'Everyone on the team can see and change the church’s information.')}>
        {team.isPending ? <Spinner /> : (
          <ul className="mt-4 border-t border-line divide-y divide-line">
            {team.data!.map((u) => (
              <li key={u.id} className="flex items-center gap-4 px-5 sm:px-6 py-3">
                <Avatar name={u.full_name} file={u.avatar_file} size={44} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{u.full_name} {u.id === session!.user.id && <span className="text-muted font-normal">({tr('tú', 'you')})</span>}</p>
                  <p className="text-muted text-[0.88rem] truncate">{u.email}</p>
                </div>
                <p className="text-muted text-[0.88rem] hidden sm:block">{u.last_login_at ? `${tr('Última visita', 'Last visit')}: ${date(u.last_login_at.slice(0, 10))}` : ''}</p>
                {u.id !== session!.user.id && <IconButton label={tr('Quitar acceso', 'Remove access')} onClick={() => removeUser(u)}><Trash2 size={18} /></IconButton>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={tr('Invitar a alguien', 'Invite someone')} hint={tr('Crea un código y compártelo. Con él, la persona crea su cuenta y entra directamente a esta iglesia.', 'Create a code and share it. With it, the person creates their account and joins this church directly.')}
        action={<Button variant="primary" icon={<Plus size={19} />} onClick={() => { setF({ note: '', maxUses: '1', expiresInDays: '7' }); setOpen(true) }}>{tr('Crear código', 'Create code')}</Button>}>
        {invites.isPending ? <Spinner /> : active.length === 0 ? <p className="text-muted">{tr('No hay códigos activos en este momento.', 'There are no active codes right now.')}</p> : (
          <ul className="grid gap-3">
            {active.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-raised px-4 py-3">
                <code className="text-[1.35rem] font-bold tracking-[0.14em]">{pretty(i.code)}</code>
                <p className="flex-1 min-w-[180px] text-ink-soft text-[0.9rem]">
                  {i.note && <span className="font-semibold text-ink">{i.note} · </span>}
                  {i.max_uses ? tr(`usado ${i.uses} de ${i.max_uses}`, `used ${i.uses} of ${i.max_uses}`) : tr(`usado ${i.uses} veces`, `used ${i.uses} times`)}
                  {i.expires_at ? ` · ${tr('vence el', 'expires')} ${date(i.expires_at.slice(0, 10))}` : ` · ${tr('no vence', 'never expires')}`}
                </p>
                <Button size="sm" icon={<Copy size={16} />} onClick={() => copy(link(i.code), tr('Enlace copiado: pégalo en WhatsApp o en un correo', 'Link copied: paste it into WhatsApp or an e-mail'))}>{tr('Copiar enlace', 'Copy link')}</Button>
                <Button size="sm" variant="ghost" onClick={() => revoke(i)}>{tr('Anular', 'Revoke')}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('Nuevo código de invitación', 'New invitation code')}
        footer={<><Button onClick={() => setOpen(false)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} onClick={create}>{tr('Crear código', 'Create code')}</Button></>}>
        <div className="grid gap-5">
          <Field label={tr('¿Para quién es?', 'Who is it for?')} optional>{(id) => <input id={id} className="ctl" autoFocus placeholder={tr('Ej.: Hermano Luis, contador', 'E.g. Brother Luis, counter')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />}</Field>
          <Field label={tr('¿Cuántas personas pueden usarlo?', 'How many people can use it?')}>
            {() => <Choice value={f.maxUses} onChange={(v) => setF({ ...f, maxUses: v })} options={[{ value: '1', label: tr('Una persona', 'One person') }, { value: '5', label: tr('Hasta 5', 'Up to 5') }, { value: '', label: tr('Sin límite', 'No limit') }]} />}
          </Field>
          <Field label={tr('¿Cuándo vence?', 'When does it expire?')}>
            {() => <Choice value={f.expiresInDays} onChange={(v) => setF({ ...f, expiresInDays: v })} options={[{ value: '7', label: tr('En 7 días', 'In 7 days') }, { value: '30', label: tr('En 30 días', 'In 30 days') }, { value: '', label: tr('Nunca', 'Never') }]} />}
          </Field>
        </div>
      </Modal>
    </div>
  )
}

// ─── My profile ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { tr, session, setSession, theme, setTheme, lang, setLang } = useApp()
  const { toast, fail } = useFeedback()
  const u = session!.user
  const [name, setName] = useState(u.full_name)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState<unknown>(null)
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setError(null); try { await fn() } catch (e) { if (k === 'pw') setError(e); else fail(e) } finally { setBusy('') } }
  return (
    <div className="grid gap-5 max-w-3xl">
      <Card title={tr('Mi perfil', 'My profile')}>
        <div className="flex flex-wrap gap-6 items-start">
          <AvatarPicker name={u.full_name} file={u.avatar_file} busy={busy === 'avatar'} onPick={(f) => run('avatar', async () => { setSession(await api.upload('/auth/me/avatar', f)); toast(tr('Foto actualizada', 'Photo updated')) })} />
          <form className="flex-1 min-w-[240px] grid gap-4" onSubmit={(e) => { e.preventDefault(); run('name', async () => { setSession(await api.patch('/auth/me', { fullName: name })); toast(tr('Nombre guardado', 'Name saved')) }) }}>
            <Field label={tr('Nombre completo', 'Full name')}>{(id) => <input id={id} className="ctl" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={tr('Correo electrónico', 'E-mail')}>{(id) => <input id={id} className="ctl" value={u.email} disabled />}</Field>
            <div><Button type="submit" variant="primary" busy={busy === 'name'} disabled={name.trim().length < 2 || name === u.full_name}>{tr('Guardar', 'Save')}</Button></div>
          </form>
        </div>
      </Card>
      <Card title={tr('Apariencia e idioma', 'Appearance and language')}>
        <div className="grid gap-5">
          <Field label={tr('Tema', 'Theme')}>
            {() => (
              <div role="radiogroup" className="grid grid-cols-3 gap-3 max-w-md">
                {([['light', <Sun size={22} />, tr('Claro', 'Light')], ['dark', <Moon size={22} />, tr('Oscuro', 'Dark')], ['system', <Monitor size={22} />, tr('Automático', 'Automatic')]] as [Theme, ReactNode, string][]).map(([v, icon, label]) => (
                  <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => setTheme(v)} className={cx('p-4 rounded-[14px] border-[1.5px] grid justify-items-center gap-2 transition-colors', theme === v ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line-strong hover:bg-raised')}>
                    {icon}{label}
                  </button>
                ))}
              </div>
            )}
          </Field>
          <Field label={tr('Idioma', 'Language')}>{() => <Choice value={lang} onChange={setLang} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />}</Field>
        </div>
      </Card>
      <Card title={tr('Cambiar contraseña', 'Change password')}>
        <form className="grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); run('pw', async () => { await api.post('/auth/me/password', pw); setPw({ current: '', next: '' }); toast(tr('Contraseña cambiada', 'Password changed')) }) }}>
          <Field label={tr('Contraseña actual', 'Current password')}>{(id) => <input id={id} className="ctl" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>
          <Field label={tr('Contraseña nueva', 'New password')} hint={tr('Al menos 8 caracteres.', 'At least 8 characters.')}>{(id) => <input id={id} className="ctl" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <ErrorNote error={error} className="sm:col-span-2" />
          <div className="sm:col-span-2"><Button type="submit" busy={busy === 'pw'} disabled={!pw.current || pw.next.length < 8}>{tr('Cambiar contraseña', 'Change password')}</Button></div>
        </form>
      </Card>
    </div>
  )
}

// ─── Data ────────────────────────────────────────────────────────────────────

function DataTab() {
  const { tr, num } = useApp()
  const [online, setOnline] = useState(false)
  const qc = useQueryClient()
  const { fail } = useFeedback()
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<{ kind: string; data: any } | null>(null)
  const membersFile = useRef<HTMLInputElement>(null)
  const offeringsFile = useRef<HTMLInputElement>(null)
  const upload = async (kind: 'members' | 'offerings', f: File) => {
    setBusy(kind); setResult(null)
    try { setResult({ kind, data: await api.upload(`/data/import/${kind}`, f) }); await qc.invalidateQueries() } catch (e) { fail(e) } finally { setBusy('') }
  }
  const sample = (kind: 'members' | 'offerings') => {
    const text = kind === 'members'
      ? tr('Nombre,Apellido,Correo,Teléfono,Dirección,Ciudad,Estado,Código postal,Sobre\nMaría,López García,maria@ejemplo.com,555-0101,12 Calle Olivo,San Antonio,TX,78207,101\n', 'First name,Last name,Email,Phone,Address,City,State,Zip,Envelope\nMaria,Lopez Garcia,maria@example.com,555-0101,12 Olive St,San Antonio,TX,78207,101\n')
      : tr('Fecha,Miembro,Monto,Fondo,Método,Cheque,Notas\n15/03/2026,María López García,50.00,Diezmos,Efectivo,,\n15/03/2026,,135.00,Ofrendas,Efectivo,,Ofrenda suelta\n', 'Date,Member,Amount,Fund,Method,Check,Notes\n2026-03-15,Maria Lopez Garcia,50.00,Tithes,Cash,,\n2026-03-15,,135.00,Offerings,Cash,,Loose offering\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }))
    a.download = kind === 'members' ? tr('plantilla-miembros.csv', 'members-template.csv') : tr('plantilla-ofrendas.csv', 'offerings-template.csv')
    a.click()
  }
  const importer = (kind: 'members' | 'offerings', ref: React.RefObject<HTMLInputElement | null>, title: string, text: string) => (
    <div className="rounded-[14px] border border-line p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-muted text-[0.92rem] mt-1">{text}</p>
      <div className="flex flex-wrap gap-2.5 mt-4">
        <Button icon={<Upload size={18} />} busy={busy === kind} onClick={() => ref.current?.click()}>{tr('Elegir archivo CSV', 'Choose CSV file')}</Button>
        <Button variant="ghost" icon={<Download size={18} />} onClick={() => sample(kind)}>{tr('Descargar plantilla', 'Download template')}</Button>
        <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(kind, f); e.target.value = '' }} />
      </div>
      {result?.kind === kind && (
        <div className="mt-4 rounded-[11px] bg-good-soft text-good px-4 py-3">
          <p className="font-semibold flex items-center gap-2"><CircleCheck size={19} />
            {kind === 'members'
              ? tr(`Se agregaron ${num(result.data.created)} miembros. ${num(result.data.skipped)} ya existían o estaban vacíos.`, `${num(result.data.created)} members added. ${num(result.data.skipped)} already existed or were empty.`)
              : tr(`Se agregaron ${num(result.data.created)} ofrendas, ${num(result.data.newMembers)} miembros nuevos y ${num(result.data.newFunds)} fondos nuevos.`, `${num(result.data.created)} offerings added, with ${num(result.data.newMembers)} new members and ${num(result.data.newFunds)} new funds.`)}
          </p>
          {result.data.errorCount > 0 && (
            <p className="text-warn mt-2 flex items-start gap-2"><TriangleAlert size={18} className="mt-0.5 shrink-0" />
              {tr(`${result.data.errorCount} filas no se pudieron leer (fecha o monto inválido). Filas: ${result.data.errors.map((x: any) => x.line).join(', ')}`, `${result.data.errorCount} rows could not be read (invalid date or amount). Rows: ${result.data.errors.map((x: any) => x.line).join(', ')}`)}
            </p>
          )}
        </div>
      )}
    </div>
  )
  return (
    <div className="grid gap-5 max-w-4xl">
      <Card title={tr('Traer datos desde Excel', 'Bring in data from Excel')} hint={tr('Si llevabas las ofrendas en una hoja de cálculo, guárdala como CSV y súbela aquí. Sanctuary reconoce los nombres de columna en español e inglés.', 'If you kept offerings in a spreadsheet, save it as CSV and upload it here. Sanctuary recognises column names in Spanish and English.')}>
        <div className="grid md:grid-cols-2 gap-4">
          {importer('members', membersFile, tr('Miembros', 'Members'), tr('Columnas: Nombre, Apellido, Correo, Teléfono, Dirección, Ciudad, Estado, Código postal, Sobre.', 'Columns: First name, Last name, Email, Phone, Address, City, State, Zip, Envelope.'))}
          {importer('offerings', offeringsFile, tr('Ofrendas', 'Offerings'), tr('Columnas: Fecha, Miembro, Monto, Fondo, Método. Los miembros y fondos que no existan se crean solos.', 'Columns: Date, Member, Amount, Fund, Method. Members and funds that do not exist yet are created for you.'))}
        </div>
      </Card>
      <Card title={tr('Donaciones en línea', 'Online giving')} hint={tr('Zelle, Tithe.ly, Square, PayPal o el estado de cuenta del banco. Las donaciones que ya estén en Sanctuary no se repiten.', 'Zelle, Tithe.ly, Square, PayPal or the bank statement. Gifts already in Sanctuary are not repeated.')}>
        <Button icon={<Upload size={18} />} onClick={() => setOnline(true)}>{tr('Importar archivo de donaciones', 'Import a giving file')}</Button>
      </Card>
      <OnlineImport open={online} onClose={() => setOnline(false)} />
      <BackupsCard />
      <Card title={tr('Descargar una copia', 'Download a copy')} hint={tr('Conviene guardar una copia de seguridad cada mes en una memoria USB o en la nube.', 'It is wise to keep a backup every month on a USB drive or in the cloud.')}>
        <div className="flex flex-wrap gap-2.5">
          <Button icon={<DatabaseBackup size={18} />} onClick={() => download('/data/export/backup.json', `sanctuary-${new Date().toISOString().slice(0, 10)}.json`).catch(fail)}>{tr('Copia completa', 'Full backup')}</Button>
          <Button icon={<Download size={18} />} onClick={() => download('/offerings/export.csv', tr('ofrendas.csv', 'offerings.csv')).catch(fail)}>{tr('Ofrendas (Excel)', 'Offerings (Excel)')}</Button>
          <Button icon={<Download size={18} />} onClick={() => download('/data/export/members.csv', tr('miembros.csv', 'members.csv')).catch(fail)}>{tr('Miembros (Excel)', 'Members (Excel)')}</Button>
        </div>
      </Card>
    </div>
  )
}

interface BackupFile { name: string; kind: 'auto' | 'manual' | 'before-restore'; created_at: string; size: number }

/** Copies kept on the server (one automatic copy a day), and restoring any of them or an uploaded file. */
function BackupsCard() {
  const { tr, lang } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const { data: list = [], isPending } = useQuery({ queryKey: ['backups'], queryFn: () => api.get<BackupFile[]>('/data/backups') })
  const [busy, setBusy] = useState('')
  const [restoring, setRestoring] = useState<{ backup?: BackupFile; file?: File } | null>(null)
  const [word, setWord] = useState('')
  const [error, setError] = useState<unknown>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const kind = (k: BackupFile['kind']) => ({ auto: tr('Automática', 'Automatic'), manual: tr('Manual', 'Manual'), 'before-restore': tr('Antes de restaurar', 'Before a restore') })[k]
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const create = async () => {
    setBusy('create')
    try { await api.post('/data/backups'); await qc.invalidateQueries({ queryKey: ['backups'] }); qc.invalidateQueries({ queryKey: ['setup'] }); toast(tr('Copia guardada en el servidor', 'Backup saved on the server')) } catch (e) { fail(e) } finally { setBusy('') }
  }
  const restore = async () => {
    if (!restoring) return
    setBusy('restore'); setError(null)
    try {
      const form = new FormData()
      form.append('confirm', word)
      if (restoring.backup) form.append('backup', restoring.backup.name)
      if (restoring.file) form.append('file', restoring.file)
      const r = await api.post<{ counts: Record<string, number> }>('/data/restore', form)
      await qc.invalidateQueries()
      setRestoring(null); setWord('')
      toast(tr(`Datos restaurados: ${r.counts.members ?? 0} miembros y ${r.counts.offerings ?? 0} ofrendas`, `Data restored: ${r.counts.members ?? 0} members and ${r.counts.offerings ?? 0} offerings`))
    } catch (e) { setError(e) } finally { setBusy('') }
  }
  const expected = lang === 'es' ? 'RESTAURAR' : 'RESTORE'
  return (
    <Card pad={false} title={tr('Copias de seguridad en el servidor', 'Backups on the server')}
      hint={tr('Sanctuary guarda una copia automática cada día (las últimas 14). Puedes volver a cualquiera de ellas.', 'Sanctuary keeps an automatic copy every day (the last 14). You can go back to any of them.')}
      action={<div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<DatabaseBackup size={16} />} busy={busy === 'create'} onClick={create}>{tr('Crear copia ahora', 'Back up now')}</Button>
        <Button size="sm" variant="ghost" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()}>{tr('Restaurar desde archivo', 'Restore from a file')}</Button>
        <input ref={fileRef} type="file" accept=".json,.gz,application/json,application/gzip" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setError(null); setRestoring({ file: f }) } }} />
      </div>}>
      {isPending ? <Spinner /> : list.length === 0 ? <p className="text-muted px-5 sm:px-6 pb-5 pt-3">{tr('Todavía no hay copias. La primera automática se crea en menos de una hora.', 'No copies yet. The first automatic one is made within the hour.')}</p> : (
        <ul className="mt-4 border-t border-line divide-y divide-line max-h-[24rem] overflow-y-auto">
          {list.map((b) => (
            <li key={b.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 sm:px-6 py-2.5">
              <span className="flex-1 min-w-[12rem]">{when(b.created_at)}<span className="block text-muted text-[0.85rem]">{kind(b.kind)} · {(b.size / 1024).toFixed(0)} KB</span></span>
              <Button size="sm" variant="ghost" icon={<Download size={16} />} onClick={() => download(`/data/backups/${b.name}`, b.name.replace(/\.gz$/, '')).catch(fail)}>{tr('Descargar', 'Download')}</Button>
              <Button size="sm" icon={<History size={16} />} onClick={() => { setError(null); setRestoring({ backup: b }) }}>{tr('Volver a esta copia', 'Restore this copy')}</Button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!restoring} onClose={() => setRestoring(null)} title={tr('Restaurar una copia de seguridad', 'Restore a backup')}
        footer={<><Button onClick={() => setRestoring(null)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="danger" busy={busy === 'restore'} disabled={word.trim().toUpperCase() !== expected} onClick={restore}>{tr('Restaurar', 'Restore')}</Button></>}>
        <div className="grid gap-4">
          <p className="flex items-start gap-2.5 rounded-[11px] bg-warn-soft px-4 py-3"><TriangleAlert size={20} className="mt-0.5 shrink-0 text-warn" />
            {tr('Todos los datos actuales de la iglesia (miembros, ofrendas, conteos, gastos…) se reemplazarán por los de la copia. Antes de hacerlo, Sanctuary guarda una copia de lo que hay ahora, por si necesitas regresar.', 'All the church’s current data (members, offerings, counts, expenses…) will be replaced by the copy. Before doing so, Sanctuary saves a copy of what is there now, in case you need to go back.')}</p>
          <p>{restoring?.backup ? <>{tr('Copia del', 'Copy from')} <strong>{when(restoring.backup.created_at)}</strong></> : <>{tr('Archivo', 'File')}: <strong>{restoring?.file?.name}</strong></>}</p>
          <Field label={tr(`Para confirmar, escribe ${expected}`, `To confirm, type ${expected}`)}>{(id) => <input id={id} className="ctl" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />}</Field>
          <ErrorNote error={error} />
        </div>
      </Modal>
    </Card>
  )
}

// ─── System ──────────────────────────────────────────────────────────────────

/** Sends Gemini a tiny request and shows, in plain words, whether the key and model work. */
function AiTest() {
  const { tr } = useApp()
  const errorText = useErrorText()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: true; model: string; ms: number; reply: string } | { ok: false; error: string } | null>(null)
  const run = async () => {
    setBusy(true); setResult(null)
    try { setResult(await api.post('/ai/test')); qc.invalidateQueries({ queryKey: ['ai-status'] }) } catch (e) { setResult({ ok: false, error: errorText(e) }) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3">
      <Button size="sm" icon={<Sparkles size={16} />} busy={busy} onClick={run}>{tr('Probar conexión', 'Test connection')}</Button>
      {result && (result.ok ? (
        <div className="mt-3 rounded-[11px] bg-good-soft text-good px-4 py-3">
          <p className="font-semibold flex items-center gap-2"><CircleCheck size={18} />{tr(`Funciona. Respondió ${result.model} en ${(result.ms / 1000).toFixed(1)} s:`, `It works. ${result.model} answered in ${(result.ms / 1000).toFixed(1)} s:`)}</p>
          <p className="mt-1 text-ink italic">«{result.reply}»</p>
        </div>
      ) : (
        <p className="mt-3 rounded-[11px] bg-bad-soft text-bad px-4 py-3 flex items-start gap-2"><TriangleAlert size={18} className="shrink-0 mt-0.5" />{result.error}</p>
      ))}
    </div>
  )
}

function SystemTab() {
  const { tr, session, date } = useApp()
  const ai = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<{ enabled: boolean; model: string }>('/ai/status') })
  const emails = useQuery({ queryKey: ['emails'], queryFn: () => api.get<any[]>('/org/emails') })
  const row = (icon: ReactNode, title: string, on: boolean, yes: ReactNode, no: ReactNode) => (
    <div className="flex gap-4 items-start">
      <span className={cx('size-11 rounded-full grid place-items-center shrink-0', on ? 'bg-good-soft text-good' : 'bg-raised text-muted')}>{icon}</span>
      <div className="flex-1">
        <p className="font-semibold flex flex-wrap items-center gap-2">{title} {on ? <Badge tone="good">{tr('Activado', 'On')}</Badge> : <Badge>{tr('Sin configurar', 'Not set up')}</Badge>}</p>
        <div className="text-ink-soft mt-1">{on ? yes : no}</div>
      </div>
    </div>
  )
  const code = (s: string) => <code className="bg-raised px-1.5 py-0.5 rounded text-[0.9em]">{s}</code>
  return (
    <div className="grid gap-5 max-w-4xl">
      <Card title={tr('Servicios conectados', 'Connected services')} hint={tr('Estos ajustes los hace quien instaló Sanctuary, en el archivo .env del servidor.', 'These are set by whoever installed Sanctuary, in the server’s .env file.')}>
        <div className="grid gap-6">
          {row(<Sparkles size={21} />, tr('Inteligencia artificial (Google Gemini)', 'Artificial intelligence (Google Gemini)'), !!session!.features.aiConfigured,
            <>{tr(`Resúmenes, asistente, explicación de informes y redacción de correos. Modelo: ${ai.data?.model || '…'}.`, `Summaries, assistant, report explanations and e-mail drafting. Model: ${ai.data?.model || '…'}.`)}<AiTest /></>,
            <>{tr('Pega tu clave en', 'Paste your key into')} {code('GEMINI_API_KEY=')} {tr('dentro de', 'inside')} {code('backend/.env')} {tr('y reinicia el servidor. La clave se consigue gratis en aistudio.google.com/apikey.', 'and restart the server. You can get a key for free at aistudio.google.com/apikey.')}</>)}
          {row(<Mail size={21} />, tr('Envío de correos (SMTP)', 'Sending e-mail (SMTP)'), !!session!.features.email,
            tr('Se pueden enviar informes, constancias y enlaces para restablecer contraseñas.', 'Reports, statements and password-reset links can be sent.'),
            <>{tr('Completa', 'Fill in')} {code('SMTP_HOST')}, {code('SMTP_USER')} {tr('y', 'and')} {code('SMTP_PASS')} {tr('en', 'in')} {code('backend/.env')}. {tr('Mientras tanto, los enlaces para restablecer contraseñas aparecen en la consola del servidor.', 'Until then, password-reset links are printed in the server console.')}</>)}
          {row(<MessageSquareText size={21} />, tr('Mensajes de texto (Twilio)', 'Text messages (Twilio)'), !!session!.features.sms,
            tr('Se pueden enviar y programar SMS, y felicitar cumpleaños automáticamente desde Mensajes.', 'Texts can be sent and scheduled, and birthdays greeted automatically, from Messages.'),
            <>{tr('Completa', 'Fill in')} {code('TWILIO_ACCOUNT_SID')}, {code('TWILIO_AUTH_TOKEN')} {tr('y', 'and')} {code('TWILIO_FROM')} {tr('en', 'in')} {code('backend/.env')}. {tr('Los pasos están en la página Mensajes.', 'The steps are on the Messages page.')}</>)}
        </div>
      </Card>
      {!!emails.data?.length && (
        <Card pad={false} title={tr('Correos enviados recientemente', 'Recently sent e-mails')}>
          <ul className="mt-4 border-t border-line divide-y divide-line">
            {emails.data.slice(0, 30).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 px-5 sm:px-6 py-2.5">
                <span className="flex-1 min-w-[200px] truncate">{e.subject}<span className="block text-muted text-[0.85rem] truncate">{e.recipient}</span></span>
                <span className="text-muted text-[0.87rem]">{date(e.created_at.slice(0, 10))}</span>
                {e.status === 'sent' ? <Badge tone="good">{tr('Enviado', 'Sent')}</Badge> : <Badge tone="bad">{tr('Falló', 'Failed')}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { tr } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'iglesia'
  useEffect(() => { window.scrollTo(0, 0) }, [tab])
  return (
    <>
      <PageHeader title={tr('Configuración', 'Settings')} />
      <div className="mb-6">
        <Tabs value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} options={[
          { value: 'iglesia', label: tr('Iglesia', 'Church') }, { value: 'finanzas', label: tr('Finanzas', 'Finances') }, { value: 'fondos', label: tr('Fondos', 'Funds') }, { value: 'equipo', label: tr('Equipo e invitaciones', 'Team & invitations') },
          { value: 'perfil', label: tr('Mi perfil', 'My profile') }, { value: 'datos', label: tr('Importar y respaldar', 'Import & backup') }, { value: 'sistema', label: tr('IA, correo y SMS', 'AI, e-mail & SMS') },
        ]} />
      </div>
      {tab === 'iglesia' && <ChurchTab />}
      {tab === 'finanzas' && <FinanceTab />}
      {tab === 'fondos' && <FundsTab />}
      {tab === 'equipo' && <TeamTab />}
      {tab === 'perfil' && <ProfileTab />}
      {tab === 'datos' && <DataTab />}
      {tab === 'sistema' && <SystemTab />}
    </>
  )
}
