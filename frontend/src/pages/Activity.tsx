import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { Avatar, Card, Empty, PageHeader, Spinner } from '../components/ui'

interface Entry { id: number; user_name: string | null; action: string; entity: string; summary: string | null; created_at: string; changes: Record<string, [unknown, unknown]> | null }

export default function Activity() {
  const { tr, lang } = useApp()
  const { data, isPending } = useQuery({ queryKey: ['activity'], queryFn: () => api.get<Entry[]>('/org/activity?limit=200') })

  const verb: Record<string, string> = {
    create: tr('agregó', 'added'), update: tr('modificó', 'changed'), delete: tr('eliminó', 'deleted'), close: tr('cerró', 'closed'), email: tr('envió por correo', 'e-mailed'),
    import: tr('importó', 'imported'), export: tr('descargó', 'downloaded'), join: tr('se unió al equipo', 'joined the team'),
    reopen: tr('reabrió', 'reopened'), merge: tr('unió dos registros de', 'merged two records of'), restore: tr('restauró', 'restored'),
    deposit: tr('marcó como depositado', 'marked as deposited'), reconcile: tr('concilió', 'reconciled'), send: tr('envió', 'sent'), schedule: tr('programó', 'scheduled'),
  }
  const noun: Record<string, string> = {
    offering: tr('una ofrenda', 'an offering'), member: tr('un miembro', 'a member'), fund: tr('un fondo', 'a fund'), batch: tr('un conteo', 'a count'), goal: tr('una meta', 'a goal'),
    org: tr('los datos de la iglesia', 'the church details'), user: tr('una cuenta', 'an account'), invitation: tr('una invitación', 'an invitation'),
    report: tr('un informe', 'a report'), tax_statement: tr('constancias de impuestos', 'tax statements'), backup: tr('un respaldo', 'a backup'),
    deposit: tr('un depósito', 'a deposit'), expense: tr('un gasto', 'an expense'), expense_category: tr('una categoría de gasto', 'an expense category'), budget: tr('el presupuesto', 'the budget'),
    household: tr('una familia', 'a household'), pledge: tr('un compromiso', 'a pledge'), noncash_gift: tr('una donación en especie', 'a gift of property'),
    member_link: tr('un enlace personal', 'a personal link'), board_report: tr('el informe a la junta', 'the board report'), sms: tr('mensajes de texto', 'text messages'),
  }
  const field: Record<string, string> = {
    amount: tr('Monto', 'Amount'), date: tr('Fecha', 'Date'), member_id: tr('Miembro', 'Member'), fund_id: tr('Fondo', 'Fund'), method: tr('Método', 'Method'), check_number: tr('Cheque', 'Check'),
    notes: tr('Notas', 'Notes'), goods_value: tr('Bienes recibidos', 'Goods received'), name: tr('Nombre', 'Name'), status: tr('Estado', 'Status'), first_name: tr('Nombre', 'First name'),
    last_name: tr('Apellido', 'Last name'), email: tr('Correo', 'E-mail'), phone: tr('Teléfono', 'Phone'), envelope_number: tr('Sobre', 'Envelope'), address: tr('Dirección', 'Address'),
    timezone: tr('Zona horaria', 'Time zone'), fiscal_year_start: tr('Inicio del año fiscal', 'Fiscal year start'), idle_minutes: tr('Minutos sin actividad', 'Idle minutes'),
    opening_balance: tr('Saldo inicial', 'Opening balance'), tax_deductible: tr('Deducible', 'Deductible'), payee: tr('Pagado a', 'Paid to'), category_id: tr('Categoría', 'Category'),
    bank_amount: tr('Monto del banco', 'Bank amount'), target_amount: tr('Meta', 'Target'), batch_id: tr('Conteo', 'Count'), offerings: tr('Ofrendas movidas', 'Offerings moved'),
  }
  const show = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? tr('Sí', 'Yes') : tr('No', 'No')
    if (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)) return tr('(otro registro)', '(another record)')
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US')
    return String(v).slice(0, 120)
  }
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const rows = (data || []).filter((e) => !filter || e.entity === filter)
  const plural: Record<string, string> = { offering: tr('ofrendas', 'offerings'), member: tr('miembros', 'members') }
  const line = (e: Entry) => {
    if (e.action === 'join' || (e.action === 'create' && e.entity === 'user')) return e.action === 'join' ? verb.join : tr('creó la iglesia en Sanctuary', 'created the church in Sanctuary')
    if (e.action === 'import') return `${verb.import} ${e.summary} ${plural[e.entity] || ''}`
    return `${verb[e.action] || e.action} ${noun[e.entity] || e.entity}`
  }
  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'es' ? 'es-US' : 'en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <PageHeader title={tr('Actividad', 'Activity')} subtitle={tr('Un registro de quién hizo qué. Como todo el equipo puede modificar la información, aquí queda constancia de cada cambio.', 'A record of who did what. Since the whole team can change information, every change is noted here.')} />
      <div className="mb-4 max-w-xs">
        <select className="ctl" aria-label={tr('Mostrar', 'Show')} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">{tr('Toda la actividad', 'All activity')}</option>
          {['offering', 'batch', 'member', 'deposit', 'expense', 'org', 'backup', 'fund', 'user'].map((k) => <option key={k} value={k}>{noun[k]?.replace(/^(un|una|los|el|a|an|the) /, '') || k}</option>)}
        </select>
      </div>
      <Card pad={false} className="max-w-4xl">
        {isPending ? <Spinner /> : !rows.length ? <Empty icon={<History size={28} />} title={tr('Aún no hay actividad', 'No activity yet')} /> : (
          <ul>
            {rows.map((e, i) => {
              const d = day(e.created_at)
              const head = i === 0 || day(rows[i - 1].created_at) !== d
              const changes = e.changes ? Object.entries(e.changes) : []
              return (
                <li key={e.id}>
                  {head && <p className="px-5 sm:px-6 pt-5 pb-2 text-[0.82rem] font-semibold uppercase tracking-wide text-muted first-letter:uppercase border-t border-line first:border-t-0">{d}</p>}
                  <div className="flex items-start gap-3.5 px-5 sm:px-6 py-2.5">
                    <Avatar name={e.user_name} size={36} />
                    <p className="flex-1 min-w-0 pt-1">
                      <span className="font-semibold">{e.user_name || tr('Alguien', 'Someone')}</span> {line(e)}
                      {e.summary && e.action !== 'import' && e.action !== 'join' && <span className="text-muted"> · {e.summary}</span>}
                      {changes.length > 0 && (
                        <button type="button" className="ml-2 text-accent-ink text-[0.88rem] font-semibold hover:underline underline-offset-4" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                          {open === e.id ? tr('Ocultar cambios', 'Hide changes') : tr(`Ver ${changes.length} ${changes.length === 1 ? 'cambio' : 'cambios'}`, `See ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`)}
                        </button>
                      )}
                      {open === e.id && (
                        <span className="block mt-2 rounded-[11px] bg-raised p-3 text-[0.92rem]">
                          {changes.map(([k, [before, after]]) => (
                            <span key={k} className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 py-0.5">
                              <span className="text-muted">{field[k] || k}</span>
                              <span><span className="line-through decoration-bad/60 text-ink-soft">{show(before)}</span> <span aria-hidden>→</span><span className="sr-only">{tr('cambió a', 'changed to')}</span> <span className="font-semibold">{show(after)}</span></span>
                            </span>
                          ))}
                        </span>
                      )}
                    </p>
                    <time className="text-muted text-[0.87rem] whitespace-nowrap pt-1.5">{when(e.created_at).split(', ').pop()}</time>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
