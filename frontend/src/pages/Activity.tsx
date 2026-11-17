import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { Avatar, Card, Empty, PageHeader, Spinner } from '../components/ui'

interface Entry { id: number; user_name: string | null; action: string; entity: string; summary: string | null; created_at: string }

export default function Activity() {
  const { tr, lang } = useApp()
  const { data, isPending } = useQuery({ queryKey: ['activity'], queryFn: () => api.get<Entry[]>('/org/activity?limit=200') })

  const verb: Record<string, string> = {
    create: tr('agregó', 'added'), update: tr('modificó', 'changed'), delete: tr('eliminó', 'deleted'), close: tr('cerró', 'closed'), email: tr('envió por correo', 'e-mailed'),
    import: tr('importó', 'imported'), export: tr('descargó', 'downloaded'), join: tr('se unió al equipo', 'joined the team'),
  }
  const noun: Record<string, string> = {
    offering: tr('una ofrenda', 'an offering'), member: tr('un miembro', 'a member'), fund: tr('un fondo', 'a fund'), batch: tr('un conteo', 'a count'), goal: tr('una meta', 'a goal'),
    org: tr('los datos de la iglesia', 'the church details'), user: tr('una cuenta', 'an account'), invitation: tr('una invitación', 'an invitation'),
    report: tr('un informe', 'a report'), tax_statement: tr('constancias de impuestos', 'tax statements'), backup: tr('un respaldo', 'a backup'),
  }
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
      <Card pad={false} className="max-w-4xl">
        {isPending ? <Spinner /> : !data?.length ? <Empty icon={<History size={28} />} title={tr('Aún no hay actividad', 'No activity yet')} /> : (
          <ul>
            {data.map((e, i) => {
              const d = day(e.created_at)
              const head = i === 0 || day(data[i - 1].created_at) !== d
              return (
                <li key={e.id}>
                  {head && <p className="px-5 sm:px-6 pt-5 pb-2 text-[0.82rem] font-semibold uppercase tracking-wide text-muted first-letter:uppercase border-t border-line first:border-t-0">{d}</p>}
                  <div className="flex items-start gap-3.5 px-5 sm:px-6 py-2.5">
                    <Avatar name={e.user_name} size={36} />
                    <p className="flex-1 min-w-0 pt-1">
                      <span className="font-semibold">{e.user_name || tr('Alguien', 'Someone')}</span> {line(e)}
                      {e.summary && e.action !== 'import' && e.action !== 'join' && <span className="text-muted"> · {e.summary}</span>}
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
