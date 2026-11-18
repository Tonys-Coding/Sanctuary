import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import { ChevronRight, ClipboardList, FileText, HandCoins, Landmark, PieChart, Plus, RefreshCw, Sparkles, Star, TrendingDown, TrendingUp, UserPlus, UserX } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { METHODS, useLabels, useErrorText } from '../lib/labels'
import type { Goal, Offering } from '../lib/types'
import { Avatar, Button, Card, Delta, Empty, PageHeader, Spinner, Tabs, cx } from '../components/ui'
import { Columns, Donut, FundStack, MonthlyChart, Ranking, Ring, Sparkline } from '../components/charts'
import { useOfferingForm } from '../components/OfferingForm'
import { seriesColor } from '../lib/labels'

interface Dash {
  year: number; isCurrent: boolean; ref: string; refMonth: number; years: number[]
  kpis: { total: number; totalPrevSamePeriod: number; ytdChange: number | null; thisMonth: number; prevMonth: number; count: number; average: number; givers: number; giversPrev: number; loose: number }
  monthly: { month: number; total: number; previous: number; count: number; givers: number; byFund: Record<string, number> }[]
  weekly: { sunday: string; total: number; count: number }[]
  segments: { regular: number; occasional: number; new: number; regularMonths: number }
  byFund: { id: string; name: string; color_slot: number; total: number }[]
  byMethod: { method: string; total: number; count: number }[]
  topMembers: { id: string; name: string; avatar_file: string | null; total: number; count: number }[]
  yearly: { year: number; total: number }[]
  recent: Offering[]
  goals: Goal[]
  insights: { type: string; tone: 'good' | 'bad' | 'neutral'; data: any }[]
}

function Stat({ label, value, note, badge, spark, sparkLabel }: { label: string; value: string; note?: string; badge?: ReactNode; spark?: number[]; sparkLabel?: string }) {
  return (
    <div className="p-5 sm:p-6 flex flex-col">
      <p className="text-muted">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[2rem] font-bold leading-none tracking-tight">{value}</span>
        {badge}
      </p>
      {note && <p className="text-muted text-[0.88rem] mt-2">{note}</p>}
      {spark && spark.length > 1 && <div className="mt-auto pt-4"><Sparkline values={spark} height={34} label={sparkLabel} /></div>}
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
  const { tr, money, date, num, session, lang } = useApp()
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

  const shortDate = (iso: string) => {
    const [y, m, dd] = iso.split('-').map(Number)
    return new Date(y, m - 1, dd).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { day: 'numeric', month: 'short' }).replace('.', '')
  }
  const upTo = d.isCurrent ? d.refMonth : 12
  const months = d.monthly.slice(0, upTo)
  const weeks = d.weekly.map((w, i) => ({
    label: i === d.weekly.length - 1 && d.isCurrent ? tr('Esta sem.', 'This wk') : shortDate(w.sunday),
    value: w.total,
    tip: `${tr('Semana del domingo', 'Week ending Sunday')} ${shortDate(w.sunday)} · ${tr(`${num(w.count)} ofrendas`, `${num(w.count)} gifts`)}`,
  }))
  const seg = d.segments
  const actions: { icon: ReactNode; title: string; text: string; onClick?: () => void; to?: string }[] = [
    { icon: <Plus size={24} />, title: tr('Registrar una ofrenda', 'Record an offering'), text: tr('Un sobre, una transferencia…', 'An envelope, a transfer…'), onClick: () => openOffering() },
    { icon: <ClipboardList size={24} />, title: tr('Contar el culto de hoy', 'Count today’s service'), text: tr('Todos los sobres de una vez', 'All the envelopes at once'), to: '/conteos?nuevo=1' },
    { icon: <FileText size={24} />, title: tr('Informe del mes pasado', 'Last month’s report'), text: tr('Listo para la junta', 'Ready for the board'), to: '/informes?preset=mes' },
    { icon: <Landmark size={24} />, title: tr('Constancias de impuestos', 'Tax statements'), text: tr('Para cada miembro', 'For each member'), to: '/impuestos' },
  ]

  return (
    <div className="grid gap-5">
      <PageHeader title={title} subtitle={`${session!.org.name} · ${d.isCurrent ? date(d.ref, 'long') : d.year}`}>{picker}</PageHeader>

      {/* The four things a treasurer does most, one click away. */}
      <nav aria-label={tr('Accesos rápidos', 'Quick actions')} className="grid grid-cols-2 xl:grid-cols-4 gap-3 -mt-2 no-print">
        {actions.map((a) => {
          const inner = (<>
            <span className="size-12 rounded-[14px] grid place-items-center bg-accent-soft text-accent-ink shrink-0 group-hover:bg-accent group-hover:text-on-accent transition-colors" aria-hidden>{a.icon}</span>
            <span className="min-w-0 text-left">
              <span className="block font-semibold leading-snug">{a.title}</span>
              <span className="block text-muted text-[0.88rem]">{a.text}</span>
            </span>
          </>)
          const cls = 'group card flex items-center gap-4 p-4 hover:border-accent transition-colors'
          return a.to ? <Link key={a.title} to={a.to} className={cls}>{inner}</Link> : <button key={a.title} type="button" onClick={a.onClick} className={cls}>{inner}</button>
        })}
      </nav>

      {/* Headline figures, each with its recent trend. */}
      <section className="card grid sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-line sm:[&>*:nth-child(even)]:border-l xl:[&>*+*]:border-l [&>*+*]:border-t sm:[&>*:nth-child(2)]:border-t-0 xl:[&>*+*]:border-t-0">
        <Stat label={tr(`Recibido en ${d.year}`, `Received in ${d.year}`)} value={money(k.total, { whole: true })}
          badge={<Delta value={k.ytdChange} />} note={k.ytdChange != null ? tr(`comparado con la misma fecha de ${d.year - 1}`, `compared with the same date in ${d.year - 1}`) : undefined}
          spark={months.map((m) => m.total)} sparkLabel={tr('Total de cada mes', 'Each month’s total')} />
        <Stat label={d.isCurrent ? tr(`${monthName}, hasta hoy`, `${monthName} so far`) : monthName} value={money(k.thisMonth, { whole: true })}
          note={tr(`Mes anterior completo: ${money(k.prevMonth, { whole: true })}`, `Full previous month: ${money(k.prevMonth, { whole: true })}`)}
          spark={d.weekly.map((w) => w.total)} sparkLabel={tr('Últimas 12 semanas', 'Last 12 weeks')} />
        <Stat label={tr('Personas que ofrendaron', 'People who gave')} value={num(k.givers)}
          note={k.giversPrev ? tr(`${k.giversPrev} en todo ${d.year - 1}`, `${k.giversPrev} in all of ${d.year - 1}`) : undefined}
          spark={months.map((m) => m.givers)} sparkLabel={tr('Personas por mes', 'People per month')} />
        <Stat label={tr('Ofrenda promedio', 'Average gift')} value={money(k.average)} note={tr(`${num(k.count)} ofrendas registradas`, `${num(k.count)} offerings recorded`)}
          spark={months.map((m) => (m.count ? m.total / m.count : 0))} sparkLabel={tr('Promedio de cada mes', 'Each month’s average')} />
      </section>

      {session!.features.ai && k.count > 0 && <AiSummary year={d.year} />}

      <div className="grid xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2" title={tr('Ofrendas por mes', 'Offerings by month')} hint={tr('Compara este año con el anterior. «Acumulado» muestra cuánto se lleva reunido en el año.', 'Compare this year with last. “Year to date” shows how much has been gathered so far.')}>
          <MonthlyChart year={d.year} upTo={d.refMonth} data={d.monthly.map((m) => ({ label: labels.month(m.month), total: m.total, previous: m.previous }))} />
        </Card>
        <Card title={tr('¿A qué fondos se dio?', 'Which funds received?')} hint={tr(`Total de ${d.year}`, `${d.year} total`)}>
          <Donut empty={tr('Aún no hay ofrendas este año.', 'No offerings yet this year.')} centerLabel={tr('Total', 'Total')}
            items={d.byFund.map((f) => ({ key: f.id, label: f.name, value: f.total, color: seriesColor(f.color_slot) }))} />
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-5">
        <Card title={tr('Últimas 12 semanas', 'Last 12 weeks')} hint={tr('Lo recibido cada semana. Útil para ver domingos flojos o especiales.', 'What came in each week. Handy for spotting slow or special Sundays.')}>
          <Columns height="19rem" data={weeks} ghost={d.isCurrent ? weeks[weeks.length - 1]?.label : undefined} tipLabel={tr('Recibido', 'Received')} />
        </Card>
        <Card title={tr('Fondos mes a mes', 'Funds month by month')} hint={tr('Cómo se reparte cada mes entre los fondos.', 'How each month splits across funds.')}>
          <FundStack upTo={upTo} funds={d.byFund} months={d.monthly.map((m) => ({ label: labels.month(m.month), byFund: m.byFund }))} />
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
            ? <Ranking items={d.topMembers.slice(0, 7).map((m) => ({ key: m.id, label: m.name, value: m.total, avatar: m.avatar_file, showAvatar: true }))} />
            : <p className="text-muted py-4">{tr('Aún no hay ofrendas con nombre este año.', 'No named offerings yet this year.')}</p>)}
          {compare === 'year' && <Columns data={d.yearly.map((y) => ({ label: String(y.year), value: y.total }))} highlight={String(d.year)} />}
          {compare === 'method' && <Ranking items={d.byMethod.map((m) => ({ key: m.method, label: labels.method(m.method), value: m.total, sub: tr(`${num(m.count)} ofrendas`, `${num(m.count)} gifts`) }))} />}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 2xl:grid-cols-3 gap-5">
        <Card title={tr('¿Quiénes ofrendan?', 'Who gives?')}
          hint={tr(`Regulares: dieron en ${seg.regularMonths} meses o más este año. Nuevos: su primera ofrenda fue este año.`, `Regular: gave in ${seg.regularMonths}+ months this year. New: first gift ever was this year.`)}>
          <Donut format="number" centerLabel={tr('Personas', 'People')} empty={tr('Aún no hay ofrendas con nombre.', 'No named offerings yet.')}
            items={[
              { key: 'regular', label: tr('Regulares', 'Regular'), value: seg.regular, color: seriesColor(1) },
              { key: 'occasional', label: tr('Ocasionales', 'Occasional'), value: seg.occasional, color: seriesColor(2) },
              { key: 'new', label: tr('Nuevos', 'New'), value: seg.new, color: seriesColor(3) },
            ].filter((x) => x.value > 0)} />
        </Card>
        <Card title={tr('¿Cómo se dio?', 'How was it given?')} hint={tr(`Formas de pago en ${d.year}`, `Payment methods in ${d.year}`)}>
          <Donut centerLabel={tr('Total', 'Total')} empty={tr('Aún no hay ofrendas este año.', 'No offerings yet this year.')}
            items={METHODS.map((m, i) => ({ key: m, label: labels.method(m), value: d.byMethod.find((x) => x.method === m)?.total || 0, color: seriesColor(i + 1) })).filter((x) => x.value > 0)} />
        </Card>
        <Card className="lg:col-span-2 2xl:col-span-1" title={tr('Metas', 'Goals')} action={<Link to="/metas" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Ver todas', 'See all')}</Link>}>
          {d.goals.length === 0 ? (
            <div>
              <p className="text-muted">{tr('Pon una meta —un techo nuevo, un viaje misionero— y sigue su avance aquí.', 'Set a goal — a new roof, a mission trip — and follow its progress here.')}</p>
              <Link to="/metas" className="inline-block mt-4"><Button>{tr('Crear una meta', 'Create a goal')}</Button></Link>
            </div>
          ) : (
            <ul className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-1">
              {d.goals.map((g) => (
                <li key={g.id} className="flex items-center gap-4">
                  <Ring value={g.raised} target={g.target_amount} />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{g.name}</p>
                    <p className="text-ink-soft">{money(g.raised, { whole: true })} <span className="text-muted">{tr('de', 'of')} {money(g.target_amount, { whole: true })}</span></p>
                    <p className="text-muted text-[0.87rem]">{g.raised >= g.target_amount ? tr('¡Meta lograda!', 'Goal reached!') : `${tr('Faltan', 'To go:')} ${money(g.target_amount - g.raised, { whole: true })} · ${tr('hasta el', 'until')} ${date(g.end_date)}`}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card pad={false} title={tr('Últimas ofrendas', 'Latest offerings')}
        action={<Link to="/ofrendas" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Ver todas', 'See all')}</Link>}>
        <ul className="mt-3 border-t border-line grid lg:grid-cols-2 lg:[&>li:nth-child(odd)]:border-r [&>li]:border-line [&>li]:border-b">
          {d.recent.map((o) => (
            <li key={o.id} className="flex items-center gap-3.5 px-5 sm:px-6 py-3">
              <Avatar name={o.member_name || '·'} file={o.member_avatar} size={42} />
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
    </div>
  )
}
