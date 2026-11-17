import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import { ChevronRight, HandCoins, PieChart, RefreshCw, Sparkles, Star, TrendingDown, TrendingUp, UserPlus, UserX } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useLabels, useErrorText } from '../lib/labels'
import type { Goal, Offering } from '../lib/types'
import { Avatar, Badge, Button, Card, Delta, Empty, PageHeader, Spinner, Tabs, cx } from '../components/ui'
import { Breakdown, Columns, MonthlyChart, ProgressBar, Ranking } from '../components/charts'
import { useOfferingForm } from '../components/OfferingForm'
import { seriesColor } from '../lib/labels'

interface Dash {
  year: number; isCurrent: boolean; ref: string; refMonth: number; years: number[]
  kpis: { total: number; totalPrevSamePeriod: number; ytdChange: number | null; thisMonth: number; prevMonth: number; count: number; average: number; givers: number; giversPrev: number; loose: number }
  monthly: { month: number; total: number; previous: number; count: number }[]
  byFund: { id: string; name: string; color_slot: number; total: number }[]
  byMethod: { method: string; total: number; count: number }[]
  topMembers: { id: string; name: string; avatar_file: string | null; total: number; count: number }[]
  yearly: { year: number; total: number }[]
  recent: Offering[]
  goals: Goal[]
  insights: { type: string; tone: 'good' | 'bad' | 'neutral'; data: any }[]
}

function Stat({ label, value, note, badge }: { label: string; value: string; note?: string; badge?: ReactNode }) {
  return (
    <div className="p-5 sm:p-6">
      <p className="text-muted text-[0.93rem]">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[1.75rem] font-bold leading-none tracking-tight">{value}</span>
        {badge}
      </p>
      {note && <p className="text-muted text-[0.87rem] mt-2">{note}</p>}
    </div>
  )
}

function AiSummary({ year }: { year: number }) {
  const { tr, lang, date } = useApp()
  const errorText = useErrorText()
  const [refresh, setRefresh] = useState(0)
  const q = useQuery({
    queryKey: ['ai-summary', year, lang, refresh],
    queryFn: () => api.post<{ text: string; createdAt: string }>('/ai/dashboard-summary', { year, refresh: refresh > 0 }),
    staleTime: Infinity, retry: false,
  })
  return (
    <Card
      title={<span className="flex items-center gap-2"><Sparkles size={19} className="text-accent-ink" aria-hidden />{tr('Resumen inteligente', 'Smart summary')}</span>}
      hint={q.data ? tr(`Escrito por la IA con los datos del ${date(q.data.createdAt.slice(0, 10))}`, `Written by AI from the data on ${date(q.data.createdAt.slice(0, 10))}`) : undefined}
      action={<Button size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => setRefresh((n) => n + 1)} busy={q.isFetching}>{tr('Actualizar', 'Refresh')}</Button>}
      className="bg-accent-soft/40"
    >
      {q.isPending ? (
        <div className="grid gap-2.5" aria-busy><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" /></div>
      ) : q.error ? (
        <p className="text-muted">{errorText(q.error)}</p>
      ) : (
        <div className="prose-ai max-w-[80ch]"><Markdown>{q.data.text}</Markdown></div>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const { tr, money, date, num, session } = useApp()
  const labels = useLabels()
  const openOffering = useOfferingForm()
  const [year, setYear] = useState<number | undefined>()
  const [compare, setCompare] = useState<'member' | 'year' | 'method'>('member')
  const { data: d, isPending, error } = useQuery({ queryKey: ['dashboard', year], queryFn: () => api.get<Dash>(`/reports/dashboard${year ? `?year=${year}` : ''}`), placeholderData: (p) => p })

  if (isPending) return <Spinner />
  if (error || !d) return <Empty title={tr('No se pudo cargar el inicio', 'Could not load the dashboard')} />

  const title = tr('Inicio', 'Home')
  const picker = d.years.length > 1 && (
    <label className="flex items-center gap-2.5">
      <span className="text-muted">{tr('Año', 'Year')}</span>
      <select className="ctl !w-auto" value={d.year} onChange={(e) => setYear(Number(e.target.value))}>
        {d.years.map((y) => <option key={y}>{y}</option>)}
      </select>
    </label>
  )

  if (d.yearly.length === 0) {
    return (<>
      <PageHeader title={title} />
      <Card>
        <Empty icon={<HandCoins size={28} />} title={tr('Todo listo para empezar', 'Everything is ready to start')}
          action={<div className="flex flex-wrap justify-center gap-3">
            <Button variant="primary" onClick={() => openOffering()}>{tr('Registrar la primera ofrenda', 'Record the first offering')}</Button>
            <Link to="/configuracion?tab=datos"><Button>{tr('Importar desde Excel', 'Import from Excel')}</Button></Link>
          </div>}>
          {tr('Cuando registres ofrendas, aquí verás los totales, las tendencias y las novedades de tu iglesia.', 'Once you record offerings, you will see your church’s totals, trends and news here.')}
        </Empty>
      </Card>
    </>)
  }

  const k = d.kpis
  const monthName = labels.month(d.refMonth, 'long')
  const insightText = (i: Dash['insights'][number]): { icon: ReactNode; text: ReactNode; to?: string } => {
    const x = i.data
    const b = (s: ReactNode) => <strong className="font-semibold">{s}</strong>
    switch (i.type) {
      case 'ytd': return {
        icon: x.pct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />,
        text: x.pct >= 0
          ? <>{tr('Este año las ofrendas van', 'This year giving is')} {b(`${Math.abs(x.pct)}% ${tr('por encima', 'ahead')}`)} {tr(`de la misma fecha de ${x.year} (${money(x.previous, { whole: true })}).`, `of the same date in ${x.year} (${money(x.previous, { whole: true })}).`)}</>
          : <>{tr('Este año las ofrendas van', 'This year giving is')} {b(`${Math.abs(x.pct)}% ${tr('por debajo', 'behind')}`)} {tr(`de la misma fecha de ${x.year} (${money(x.previous, { whole: true })}).`, `of the same date in ${x.year} (${money(x.previous, { whole: true })}).`)}</>,
      }
      case 'last30': return {
        icon: x.pct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />,
        text: <>{tr('En los últimos 30 días entraron', 'In the last 30 days')} {b(money(x.amount, { whole: true }))}{tr(',', ' came in,')} {b(`${Math.abs(x.pct)}% ${x.pct >= 0 ? tr('más', 'more') : tr('menos', 'less')}`)} {tr('que en los 30 días anteriores.', 'than in the 30 days before.')}</>,
      }
      case 'best_month': return { icon: <Star size={20} />, text: <>{b(labels.month(x.month, 'long'))} {tr('fue el mejor mes del año, con', 'was the best month of the year, with')} {b(money(x.amount, { whole: true }))}.</> }
      case 'top_fund': return { icon: <PieChart size={20} />, text: <>{b(x.name)} {tr('representa el', 'makes up')} {b(`${x.share}%`)} {tr('de todo lo recibido este año.', 'of everything received this year.')}</> }
      case 'new_givers': return { icon: <UserPlus size={20} />, text: <>{b(x.count === 1 ? tr('1 persona dio', '1 person gave') : tr(`${x.count} personas dieron`, `${x.count} people gave`))} {tr('por primera vez en los últimos 60 días.', 'for the first time in the last 60 days.')}</> }
      case 'lapsed': return {
        icon: <UserX size={20} />, to: '/miembros?filtro=sin-ofrendar',
        text: <>{b(x.count === 1 ? tr('1 miembro que ofrendaba con frecuencia', '1 member who used to give regularly') : tr(`${x.count} miembros que ofrendaban con frecuencia`, `${x.count} members who used to give regularly`))} {tr('no lo hace desde hace más de 60 días', 'has not given in over 60 days')}: {x.names.join(', ')}{x.count > 3 ? '…' : ''}. {tr('Quizá agradezcan una llamada.', 'They might appreciate a call.')}</>,
      }
      case 'loose_share': return { icon: <HandCoins size={20} />, text: <>{tr('El', '')} {b(`${x.share}%`)} {tr('de lo recibido son ofrendas sueltas, sin nombre. Repartir sobres ayuda a que más personas reciban su constancia.', 'of what was received is loose offerings with no name. Handing out envelopes helps more people get a statement.')}</> }
      default: return { icon: <Star size={20} />, text: null }
    }
  }
  const tones = { good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', neutral: 'bg-raised text-ink-soft' }

  return (
    <div className="grid gap-5">
      <PageHeader title={title} subtitle={`${session!.org.name} · ${d.isCurrent ? date(d.ref, 'long') : d.year}`}>{picker}</PageHeader>

      {/* Headline figures, in one band rather than four separate boxes. */}
      <section className="card grid sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:[&>*:nth-child(n+3)]:border-t xl:[&>*:nth-child(n+3)]:border-t-0 sm:[&>*:nth-child(even)]:border-l xl:[&>*+*]:border-l divide-line [&>*]:border-line -mt-2">
        <Stat label={tr(`Recibido en ${d.year}`, `Received in ${d.year}`)} value={money(k.total, { whole: true })}
          badge={<Delta value={k.ytdChange} />} note={k.ytdChange != null ? tr(`comparado con la misma fecha de ${d.year - 1}`, `compared with the same date in ${d.year - 1}`) : undefined} />
        <Stat label={d.isCurrent ? tr(`${monthName}, hasta hoy`, `${monthName} so far`) : monthName} value={money(k.thisMonth, { whole: true })}
          note={tr(`Mes anterior completo: ${money(k.prevMonth, { whole: true })}`, `Full previous month: ${money(k.prevMonth, { whole: true })}`)} />
        <Stat label={tr('Personas que ofrendaron', 'People who gave')} value={num(k.givers)}
          note={k.giversPrev ? tr(`${k.giversPrev} en todo ${d.year - 1}`, `${k.giversPrev} in all of ${d.year - 1}`) : undefined} />
        <Stat label={tr('Ofrenda promedio', 'Average gift')} value={money(k.average)} note={tr(`${num(k.count)} ofrendas registradas`, `${num(k.count)} offerings recorded`)} />
      </section>

      {session!.features.ai && k.count > 0 && <AiSummary year={d.year} />}

      <div className="grid xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2" title={tr('Ofrendas por mes', 'Offerings by month')} hint={tr('Cada punto es el total de un mes.', 'Each point is the total for one month.')}>
          <MonthlyChart year={d.year} upTo={d.refMonth} data={d.monthly.map((m) => ({ label: labels.month(m.month), total: m.total, previous: m.previous }))} />
        </Card>
        <Card title={tr('¿A qué fondos se dio?', 'Which funds received?')} hint={tr(`Total de ${d.year}`, `${d.year} total`)}>
          <Breakdown empty={tr('Aún no hay ofrendas este año.', 'No offerings yet this year.')} items={d.byFund.map((f) => ({ key: f.id, label: f.name, value: f.total, slot: f.color_slot }))} />
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <Card title={tr('Novedades', 'What’s new')} hint={tr('Cambios y tendencias que vale la pena mirar.', 'Changes and trends worth a look.')}>
          {d.insights.length === 0 ? <p className="text-muted py-4">{tr('Cuando haya más datos, aquí aparecerán las tendencias.', 'Trends will appear here once there is more data.')}</p> : (
            <ul className="grid gap-3.5">
              {d.insights.map((i) => {
                const t = insightText(i)
                const row = (<>
                  <span className={cx('size-10 rounded-full grid place-items-center shrink-0', tones[i.tone])} aria-hidden>{t.icon}</span>
                  <span className="flex-1 pt-1.5 leading-snug">{t.text}</span>
                  {t.to && <ChevronRight size={20} className="text-muted mt-2 shrink-0" aria-hidden />}
                </>)
                return <li key={i.type}>{t.to ? <Link to={t.to} className="flex gap-3.5 -m-2 p-2 rounded-xl hover:bg-raised transition-colors">{row}</Link> : <div className="flex gap-3.5">{row}</div>}</li>
              })}
            </ul>
          )}
        </Card>
        <Card title={tr('Comparativos', 'Comparisons')}
          action={<Tabs value={compare} onChange={setCompare} options={[{ value: 'member', label: tr('Por miembro', 'By member') }, { value: 'year', label: tr('Por año', 'By year') }, { value: 'method', label: tr('Por método', 'By method') }]} />}>
          {compare === 'member' && (d.topMembers.length
            ? <Ranking items={d.topMembers.slice(0, 6).map((m) => ({ key: m.id, label: m.name, value: m.total, avatar: m.avatar_file, showAvatar: true }))} />
            : <p className="text-muted py-4">{tr('Aún no hay ofrendas con nombre este año.', 'No named offerings yet this year.')}</p>)}
          {compare === 'year' && <Columns data={d.yearly.map((y) => ({ label: String(y.year), value: y.total }))} highlight={String(d.year)} />}
          {compare === 'method' && <Ranking items={d.byMethod.map((m) => ({ key: m.method, label: labels.method(m.method), value: m.total, sub: tr(`${num(m.count)} ofrendas`, `${num(m.count)} gifts`) }))} />}
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        <Card pad={false} className="xl:col-span-2" title={tr('Últimas ofrendas', 'Latest offerings')}
          action={<Link to="/ofrendas" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Ver todas', 'See all')}</Link>}>
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {d.recent.map((o) => (
              <li key={o.id} className="flex items-center gap-3.5 px-5 sm:px-6 py-3">
                <Avatar name={o.member_name || '·'} file={o.member_avatar} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{o.member_name || <span className="text-ink-soft">{labels.loose}</span>}</p>
                  <p className="text-muted text-[0.87rem] flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: seriesColor(o.fund_color) }} aria-hidden />{o.fund_name} · {labels.method(o.method)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{money(o.amount)}</p>
                  <p className="text-muted text-[0.87rem]">{date(o.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={tr('Metas', 'Goals')} action={<Link to="/metas" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Ver todas', 'See all')}</Link>}>
          {d.goals.length === 0 ? (
            <div>
              <p className="text-muted">{tr('Pon una meta —un techo nuevo, un viaje misionero— y sigue su avance aquí.', 'Set a goal — a new roof, a mission trip — and follow its progress here.')}</p>
              <Link to="/metas" className="inline-block mt-4"><Button>{tr('Crear una meta', 'Create a goal')}</Button></Link>
            </div>
          ) : (
            <ul className="grid gap-5">
              {d.goals.map((g) => (
                <li key={g.id}>
                  <div className="flex justify-between gap-3 items-baseline mb-1.5">
                    <span className="font-medium truncate">{g.name}</span>
                    {g.raised >= g.target_amount ? <Badge tone="good">{tr('¡Lograda!', 'Reached!')}</Badge> : <span className="text-muted text-[0.9rem]">{Math.round((g.raised / g.target_amount) * 100)}%</span>}
                  </div>
                  <ProgressBar value={g.raised} target={g.target_amount} />
                  <p className="text-muted text-[0.87rem] mt-1.5">{money(g.raised, { whole: true })} {tr('de', 'of')} {money(g.target_amount, { whole: true })} · {tr('hasta el', 'until')} {date(g.end_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
