import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import { Cake, ChevronRight, Church, Circle, CircleCheck, Wallet, ClipboardList, LayoutDashboard, Lock, MessageSquareText, Phone, FileText, HandCoins, Landmark, PieChart, Plus, RefreshCw, Scale, Sparkles, Star, Target, TrendingDown, TrendingUp, UserPlus, Users, UserX } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { METHODS, useLabels, useErrorText } from '../lib/labels'
import type { Goal, Offering } from '../lib/types'
import { Avatar, Button, Card, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { Columns, FundStack, MonthlyChart, Ranking, Ring } from '../components/charts'
import { useOfferingForm } from '../components/OfferingForm'
import { SmsComposer } from '../components/SmsComposer'
import { ViewTabs } from '../components/ViewTabs'
import { seriesColor } from '../lib/labels'

interface Dash {
  year: number; label: string; prevLabel: string; fiscalStart: number; start: string; end: string
  isCurrent: boolean; ref: string; refMonth: number; elapsed: number; years: { year: number; label: string }[]
  kpis: { total: number; totalPrevSamePeriod: number; ytdChange: number | null; thisMonth: number; prevMonth: number; count: number; average: number; givers: number; giversPrev: number; loose: number }
  monthly: { month: number; year: number; total: number; previous: number; count: number; givers: number; byFund: Record<string, number> }[]
  weekly: { sunday: string; total: number; count: number }[]
  segments: { regular: number; occasional: number; new: number; regularMonths: number }
  celebrations: Celebration[]
  byFund: { id: string; name: string; color_slot: number; total: number }[]
  byMethod: { method: string; total: number; count: number }[]
  topMembers: { id: string; name: string; avatar_file: string | null; total: number; count: number }[]
  yearly: { year: number; total: number; label: string }[]
  today: { openCounts: number; oldestOpen: string | null; toDeposit: number; toDepositTotal: number; toBank: number; toReconcile: number }
  finance: { incomeMonth: number; expensesMonth: number; balance: number; openingBalance: number | null; openingDate: string | null; tracksExpenses: boolean }
  recent: Offering[]
  goals: Goal[]
  insights: { type: string; tone: 'good' | 'bad' | 'neutral'; data: any }[]
}

interface Celebration { member_id: string; name: string; first_name: string; avatar_file: string | null; kind: 'birthday' | 'anniversary'; date: string; in_days: number; years: number; can_text: boolean; phone: string | null }

/** Birthdays and membership anniversaries in the next 30 days, with a quick way to send greetings. */
function Celebrations({ items }: { items: Celebration[] }) {
  const { tr, lang, session } = useApp()
  const [greet, setGreet] = useState<Celebration | null>(null)
  const when = (c: Celebration) => {
    if (c.in_days === 0) return tr('¡Hoy!', 'Today!')
    if (c.in_days === 1) return tr('Mañana', 'Tomorrow')
    const [y, m, d] = c.date.split('-').map(Number)
    const day = new Date(y, m - 1, d).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')
    return `${tr(`En ${c.in_days} días`, `In ${c.in_days} days`)} · ${day}`
  }
  const church = session!.org.name
  const message = (c: Celebration) => c.kind === 'birthday'
    ? tr(`¡Feliz cumpleaños, {nombre}! Toda la familia de ${church} da gracias a Dios por tu vida.`, `Happy birthday, {name}! Everyone at ${church} thanks God for your life.`)
    : tr(`¡Hola {nombre}! Hoy cumples ${c.years} ${c.years === 1 ? 'año' : 'años'} con nosotros en ${church}. ¡Gracias por ser parte de esta familia!`, `Hi {name}! Today marks ${c.years} ${c.years === 1 ? 'year' : 'years'} with us at ${church}. Thank you for being part of this family!`)
  return (
    <Card title={<span className="flex items-center gap-2"><Cake size={19} className="text-accent-ink" aria-hidden />{tr('Celebraciones', 'Celebrations')}</span>}
      hint={tr('Cumpleaños y aniversarios en la iglesia de los próximos 30 días.', 'Birthdays and church anniversaries in the next 30 days.')}>
      {items.length === 0 ? (
        <p className="text-muted">{tr('No hay cumpleaños ni aniversarios en los próximos 30 días. Añade las fechas en el perfil de cada miembro.', 'No birthdays or anniversaries in the next 30 days. Add the dates on each member’s profile.')}</p>
      ) : (
        <ul className="grid gap-1 -mx-2 max-h-[26rem] overflow-y-auto">
          {items.map((c) => (
            <li key={`${c.member_id}-${c.kind}`} className={cx('flex items-center gap-3 px-2 py-2 rounded-xl', c.in_days === 0 && 'bg-accent-soft/60')}>
              <span className="relative shrink-0">
                <Avatar name={c.name} file={c.avatar_file} size={42} />
                <span className="absolute -bottom-1 -right-1 size-6 rounded-full grid place-items-center bg-surface border border-line text-accent-ink" aria-hidden>
                  {c.kind === 'birthday' ? <Cake size={13} /> : <Church size={13} />}
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <Link to={`/miembros/${c.member_id}`} className="block font-medium truncate hover:underline underline-offset-4">{c.name}</Link>
                <p className="text-muted text-[0.86rem]">
                  {c.kind === 'birthday' ? tr('Cumpleaños', 'Birthday') : tr(`${c.years} ${c.years === 1 ? 'año' : 'años'} en la iglesia`, `${c.years} ${c.years === 1 ? 'year' : 'years'} at church`)}
                  {' · '}<span className={cx(c.in_days === 0 && 'text-accent-ink font-semibold')}>{when(c)}</span>
                </p>
              </div>
              {session!.features.sms && c.can_text
                ? <Button size="sm" variant={c.in_days === 0 ? 'primary' : 'secondary'} icon={<MessageSquareText size={16} />} onClick={() => setGreet(c)}>{tr('Felicitar', 'Greet')}</Button>
                : c.phone ? <a href={`tel:${c.phone}`} className="shrink-0"><Button size="sm" variant="ghost" icon={<Phone size={16} />}>{tr('Llamar', 'Call')}</Button></a> : null}
            </li>
          ))}
        </ul>
      )}
      <SmsComposer open={!!greet} onClose={() => setGreet(null)} preselect={greet ? [greet.member_id] : []} template={greet ? message(greet) : ''} kind="birthday" />
    </Card>
  )
}

interface Setup { steps: { key: string; done: boolean; to: string; optional?: boolean }[]; done: number; total: number }

/** "Primeros pasos": the short list a new church works through. Hides itself when everything is done or dismissed. */
function SetupChecklist() {
  const { tr } = useApp()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('sanctuary.setup.hidden') === '1' } catch { return false } })
  const { data } = useQuery({ queryKey: ['setup'], queryFn: () => api.get<Setup>('/setup') })
  if (!data || hidden) return null
  const required = data.steps.filter((s) => !s.optional)
  if (required.every((s) => s.done)) return null
  const text: Record<string, [string, string]> = {
    church: [tr('Completa los datos de la iglesia', 'Complete the church details'), tr('Nombre legal, EIN y dirección: salen en las constancias.', 'Legal name, EIN and address: they appear on statements.')],
    timezone: [tr('Elige la zona horaria', 'Choose the time zone'), tr('Para que «hoy» sea el día correcto en la iglesia.', 'So “today” is the right day at church.')],
    signer: [tr('Indica quién firma', 'Say who signs'), tr('El nombre del tesorero o del pastor.', 'The treasurer’s or pastor’s name.')],
    logo: [tr('Sube el logotipo', 'Upload the logo'), tr('Aparece en los informes y constancias.', 'It appears on reports and statements.')],
    funds: [tr('Revisa los fondos', 'Review the funds'), tr('Diezmos, ofrendas, misiones… los que use tu iglesia.', 'Tithes, offerings, missions… the ones your church uses.')],
    members: [tr('Añade a los miembros', 'Add the members'), tr('Uno por uno o desde Excel.', 'One by one or from Excel.')],
    first_count: [tr('Haz el primer conteo', 'Do the first count'), tr('Registra las ofrendas de un culto.', 'Record one service’s offerings.')],
    team: [tr('Invita a otra persona', 'Invite someone else'), tr('Dos personas cuentan mejor que una.', 'Two people count better than one.')],
    opening_balance: [tr('Anota el saldo del banco', 'Enter the bank balance'), tr('El punto de partida del informe de tesorería.', 'The starting point of the treasurer’s report.')],
    backup: [tr('Guarda una copia de seguridad', 'Save a backup'), tr('Por si acaso: tarda un segundo.', 'Just in case: it takes a second.')],
    email: [tr('Activa el correo (opcional)', 'Turn on e-mail (optional)'), tr('Para enviar informes y constancias.', 'To send reports and statements.')],
  }
  const close = () => { try { localStorage.setItem('sanctuary.setup.hidden', '1') } catch { /* private mode */ } setHidden(true) }
  return (
    <Card title={tr('Primeros pasos', 'Getting started')} hint={tr(`${data.done} de ${data.total} listos`, `${data.done} of ${data.total} done`)}
      action={<Button size="sm" variant="ghost" onClick={close}>{tr('Ocultar', 'Hide')}</Button>}>
      <div className="h-2 rounded-full bg-raised overflow-hidden mb-4" role="progressbar" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.done} aria-label={tr('Avance', 'Progress')}>
        <div className="h-full bg-good rounded-full" style={{ width: `${(data.done / data.total) * 100}%` }} />
      </div>
      <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {data.steps.map((s) => (
          <li key={s.key}>
            <Link to={s.to} className={cx('flex gap-3 p-3 rounded-xl border border-line hover:border-accent transition-colors', s.done && 'bg-raised/40')}>
              {s.done ? <CircleCheck size={22} className="text-good shrink-0" aria-label={tr('Listo', 'Done')} /> : <Circle size={22} className="text-muted shrink-0" aria-label={tr('Pendiente', 'To do')} />}
              <span className="min-w-0">
                <span className={cx('block font-semibold leading-snug', s.done && 'line-through decoration-1 text-ink-soft')}>{text[s.key]?.[0] ?? s.key}</span>
                <span className="block text-muted text-[0.86rem]">{text[s.key]?.[1]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Money in and out this month and what the church has in the bank, for churches that track expenses. */
function FinanceStrip({ f, monthName }: { f: Dash['finance']; monthName: string }) {
  const { tr, money } = useApp()
  const net = f.incomeMonth - f.expensesMonth
  return (
    <section className="card grid sm:grid-cols-3 [&>*+*]:border-t sm:[&>*+*]:border-t-0 sm:[&>*+*]:border-l [&>*]:border-line" aria-label={tr('Finanzas', 'Finances')}>
      <Link to="/gastos" className="p-5 hover:bg-raised/50 transition-colors">
        <p className="text-muted flex items-center gap-2"><Wallet size={18} aria-hidden />{tr('Saldo estimado hoy', 'Estimated balance today')}</p>
        <p className="mt-1.5 text-[1.7rem] font-bold leading-none">{money(f.balance, { whole: true })}</p>
        {f.openingBalance == null && <p className="text-muted text-[0.86rem] mt-2">{tr('Anota el saldo inicial en Configuración para que sea exacto.', 'Enter the opening balance in Settings to make it exact.')}</p>}
      </Link>
      <div className="p-5">
        <p className="text-muted">{tr(`Entradas y salidas de ${monthName}`, `${monthName} in and out`)}</p>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-semibold"><span className="text-good">+ {money(f.incomeMonth, { whole: true })}</span><span className="text-bad">− {money(f.expensesMonth, { whole: true })}</span></p>
      </div>
      <div className="p-5">
        <p className="text-muted">{tr('Resultado del mes', 'Month result')}</p>
        <p className={cx('mt-1.5 text-[1.7rem] font-bold leading-none', net >= 0 ? 'text-good' : 'text-bad')}>{net >= 0 ? '+' : '−'} {money(Math.abs(net), { whole: true })}</p>
      </div>
    </section>
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

type View = 'resumen' | 'dinero' | 'personas' | 'metas'

/** Horizontal bars with the name, the amount and its share spelled out: easier to read than a donut. */
function ShareBars({ items, empty }: { items: { key: string; label: string; value: number; color: string }[]; empty: string }) {
  const { money } = useApp()
  const total = items.reduce((a, i) => a + i.value, 0)
  if (!total) return <p className="text-muted py-4">{empty}</p>
  return (
    <ul className="grid gap-4">
      {items.map((i) => {
        const pct = Math.round((i.value / total) * 100)
        return (
          <li key={i.key}>
            <div className="flex justify-between gap-3">
              <span>{i.label}</span>
              <span className="font-semibold tabular-nums whitespace-nowrap">{money(i.value, { whole: true })} <span className="text-muted font-normal">· {pct}%</span></span>
            </div>
            <div className="h-2.5 rounded-full bg-raised mt-1.5 overflow-hidden" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 1)}%`, background: i.color }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** The short "today" strip above the tabs: what is waiting, each a link to where it is done. */
function TodayStrip({ d }: { d: Dash }) {
  const { tr, money } = useApp()
  const t = d.today
  const today = d.celebrations.filter((c) => c.in_days === 0)
  const chips: { key: string; icon: ReactNode; text: string; to: string; warn?: boolean }[] = []
  if (t.openCounts) chips.push({ key: 'open', icon: <Lock size={19} />, warn: true, to: '/conteos', text: t.openCounts === 1 ? tr('1 conteo sin cerrar', '1 count not closed') : tr(`${t.openCounts} conteos sin cerrar`, `${t.openCounts} counts not closed`) })
  if (t.toDeposit) chips.push({ key: 'dep', icon: <Landmark size={19} />, to: '/depositos', text: tr(`Llevar ${money(t.toDepositTotal, { whole: true })} al banco`, `Take ${money(t.toDepositTotal, { whole: true })} to the bank`) })
  if (t.toBank) chips.push({ key: 'bank', icon: <Landmark size={19} />, to: '/depositos', text: t.toBank === 1 ? tr('1 depósito preparado sin llevar', '1 deposit ready to take') : tr(`${t.toBank} depósitos preparados sin llevar`, `${t.toBank} deposits ready to take`) })
  if (t.toReconcile) chips.push({ key: 'rec', icon: <Scale size={19} />, to: '/depositos', text: t.toReconcile === 1 ? tr('1 depósito por conciliar', '1 deposit to reconcile') : tr(`${t.toReconcile} depósitos por conciliar`, `${t.toReconcile} deposits to reconcile`) })
  for (const c of today.slice(0, 2)) {
    chips.push({
      key: `c-${c.member_id}-${c.kind}`, icon: c.kind === 'birthday' ? <Cake size={19} /> : <Church size={19} />, to: '/?vista=personas',
      text: c.kind === 'birthday' ? tr(`Hoy cumple años ${c.first_name}`, `${c.first_name}’s birthday is today`) : tr(`Hoy: ${c.years} años de ${c.first_name} en la iglesia`, `Today: ${c.first_name}’s ${c.years} years at church`),
    })
  }
  return (
    <section aria-label={tr('Pendiente para hoy', 'To do today')} className="flex flex-wrap items-center gap-2.5 no-print">
      {chips.length === 0
        ? <span className="inline-flex items-center gap-2.5 min-h-12 px-4 rounded-full bg-good-soft text-good font-semibold"><CircleCheck size={19} aria-hidden />{tr('Todo al día: no hay nada pendiente', 'All caught up: nothing pending')}</span>
        : chips.map((c) => (
          <Link key={c.key} to={c.to} className={cx('inline-flex items-center gap-2.5 min-h-12 px-4 rounded-full font-semibold transition-colors', c.warn ? 'bg-warn-soft text-ink hover:brightness-95' : 'bg-surface border border-line hover:border-accent')}>
            <span className={c.warn ? 'text-warn' : 'text-accent-ink'} aria-hidden>{c.icon}</span>{c.text}<ChevronRight size={17} className="text-muted -mr-1" aria-hidden />
          </Link>
        ))}
    </section>
  )
}

export default function Dashboard() {
  const { tr, money, date, num, session, lang } = useApp()
  const labels = useLabels()
  const openOffering = useOfferingForm()
  const [params, setParams] = useSearchParams()
  const view = (['resumen', 'dinero', 'personas', 'metas'].includes(params.get('vista') || '') ? params.get('vista') : 'resumen') as View
  const setView = (v: View) => setParams(v === 'resumen' ? {} : { vista: v }, { replace: true })
  const [year, setYear] = useState<number | undefined>()
  const [allNews, setAllNews] = useState(false)
  const { data: d, isPending, error } = useQuery({ queryKey: ['dashboard', year], queryFn: () => api.get<Dash>(`/reports/dashboard${year ? `?year=${year}` : ''}`), placeholderData: (p) => p })

  if (isPending) return <Spinner />
  if (error || !d) return <Empty title={tr('No se pudo cargar el inicio', 'Could not load the dashboard')} />

  const title = tr('Inicio', 'Home')
  const picker = d.years.length > 1 && (
    <label className="flex items-center gap-2.5">
      <span className="text-muted">{d.fiscalStart === 1 ? tr('Año', 'Year') : tr('Año fiscal', 'Fiscal year')}</span>
      <select className="ctl !w-auto" value={d.year} onChange={(e) => setYear(Number(e.target.value))}>
        {d.years.map((y) => <option key={y.year} value={y.year}>{y.label}</option>)}
      </select>
    </label>
  )

  if (d.yearly.length === 0) {
    return (<>
      <PageHeader title={title} />
      <SetupChecklist />
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
        text: x.pct === 0
          ? <>{tr('Este año las ofrendas van', 'This year giving is')} {b(tr('igual', 'level'))} {tr(`que a la misma fecha de ${x.year}.`, `with the same date in ${x.year}.`)}</>
          : x.pct > 0
            ? <>{tr('Este año las ofrendas van', 'This year giving is')} {b(`${Math.abs(x.pct)}% ${tr('por encima', 'ahead')}`)} {tr(`de la misma fecha de ${x.year} (${money(x.previous, { whole: true })}).`, `of the same date in ${x.year} (${money(x.previous, { whole: true })}).`)}</>
            : <>{tr('Este año las ofrendas van', 'This year giving is')} {b(`${Math.abs(x.pct)}% ${tr('por debajo', 'behind')}`)} {tr(`de la misma fecha de ${x.year} (${money(x.previous, { whole: true })}).`, `of the same date in ${x.year} (${money(x.previous, { whole: true })}).`)}</>,
      }
      case 'last30': return {
        icon: x.pct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />,
        text: <>{tr('En los últimos 30 días entraron', 'In the last 30 days')} {b(money(x.amount, { whole: true }))}{tr(',', ' came in,')} {b(`${Math.abs(Math.round(x.pct))}% ${x.pct >= 0 ? tr('más', 'more') : tr('menos', 'less')}`)} {tr('que en los 30 días anteriores.', 'than in the 30 days before.')}</>,
      }
      case 'best_month': return { icon: <Star size={20} />, text: <>{b(labels.month(x.month, 'long'))} {tr('fue el mejor mes del año, con', 'was the best month of the year, with')} {b(money(x.amount, { whole: true }))}.</> }
      case 'top_fund': return { icon: <PieChart size={20} />, text: <>{b(x.name)} {tr('representa el', 'makes up')} {b(`${x.share}%`)} {tr('de todo lo recibido este año.', 'of everything received this year.')}</> }
      case 'new_givers': return { icon: <UserPlus size={20} />, text: <>{b(x.count === 1 ? tr('1 persona dio', '1 person gave') : tr(`${x.count} personas dieron`, `${x.count} people gave`))} {tr('por primera vez en los últimos 60 días.', 'for the first time in the last 60 days.')}</> }
      case 'lapsed': return {
        icon: <UserX size={20} />, to: '/?vista=personas',
        text: <>{b(x.count === 1 ? tr('1 persona que ofrendaba con frecuencia', '1 person who used to give regularly') : tr(`${x.count} personas que ofrendaban con frecuencia`, `${x.count} people who used to give regularly`))} {tr('no lo hacen desde hace más de 60 días. Quizá agradezcan una llamada.', 'have not given in over 60 days. They might appreciate a call.')}</>,
      }
      case 'loose_share': return { icon: <HandCoins size={20} />, text: <>{tr('El', '')} {b(`${x.share}%`)} {tr('de lo recibido son ofrendas sueltas, sin nombre. Repartir sobres ayuda a que más personas reciban su constancia.', 'of what was received is loose offerings with no name. Handing out envelopes helps more people get a statement.')}</> }
      default: return { icon: <Star size={20} />, text: null }
    }
  }
  const tones = { good: 'bg-good-soft text-good', bad: 'bg-warn-soft text-warn', neutral: 'bg-raised text-ink-soft' }
  // The most useful news first: what changed recently, then who needs attention.
  const order = ['last30', 'lapsed', 'new_givers', 'ytd', 'best_month', 'top_fund', 'loose_share']
  const insights = [...d.insights].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  const shownNews = allNews ? insights : insights.slice(0, 3)

  const shortDate = (iso: string) => {
    const [y, m, dd] = iso.split('-').map(Number)
    return new Date(y, m - 1, dd).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { day: 'numeric', month: 'short' }).replace('.', '')
  }
  const upTo = d.elapsed
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
  const weeks = d.weekly.map((w, i) => ({
    label: i === d.weekly.length - 1 && d.isCurrent ? tr('Esta sem.', 'This wk') : shortDate(w.sunday),
    value: w.total,
    tip: `${tr('Semana del domingo', 'Week ending Sunday')} ${shortDate(w.sunday)} · ${tr(`${num(w.count)} ofrendas`, `${num(w.count)} gifts`)}`,
  }))
  const seg = d.segments
  const lapsed = (d.insights.find((i) => i.type === 'lapsed')?.data.members || []) as { id: string; name: string; last_date: string }[]
  const ytdNote = k.ytdChange == null ? undefined
    : k.ytdChange === 0 ? tr(`Igual que a esta fecha en ${d.prevLabel}`, `Same as this date in ${d.prevLabel}`)
      : k.ytdChange > 0 ? tr(`${Math.abs(k.ytdChange)}% más que a esta fecha en ${d.prevLabel}`, `${Math.abs(k.ytdChange)}% more than this date in ${d.prevLabel}`)
        : tr(`${Math.abs(k.ytdChange)}% menos que a esta fecha en ${d.prevLabel}`, `${Math.abs(k.ytdChange)}% less than this date in ${d.prevLabel}`)
  const actions: { icon: ReactNode; title: string; onClick?: () => void; to?: string }[] = [
    { icon: <Plus size={22} />, title: tr('Registrar una ofrenda', 'Record an offering'), onClick: () => openOffering() },
    { icon: <ClipboardList size={22} />, title: tr('Contar el culto de hoy', 'Count today’s service'), to: '/conteos?nuevo=1' },
    { icon: <FileText size={22} />, title: tr('Informe del mes pasado', 'Last month’s report'), to: '/informes?preset=mes' },
    { icon: <Landmark size={22} />, title: tr('Constancias de impuestos', 'Tax statements'), to: '/impuestos' },
  ]
  const views: { value: View; label: string; icon: ReactNode }[] = [
    { value: 'resumen', label: tr('Resumen', 'Summary'), icon: <LayoutDashboard size={21} /> },
    { value: 'dinero', label: tr('Dinero', 'Money'), icon: <Wallet size={21} /> },
    { value: 'personas', label: tr('Personas', 'People'), icon: <Users size={21} /> },
    { value: 'metas', label: tr('Metas', 'Goals'), icon: <Target size={21} /> },
  ]

  return (
    <div className="grid gap-6 max-w-[1240px] [&>*]:min-w-0">
      <PageHeader title={title} subtitle={d.isCurrent ? cap(date(d.ref, 'long')) : tr(`Viendo el año ${d.label}`, `Viewing ${d.label}`)}>{picker}</PageHeader>

      <SetupChecklist />
      <TodayStrip d={d} />
      <ViewTabs value={view} onChange={setView} options={views} label={tr('Secciones del inicio', 'Home sections')} />

      {view === 'resumen' && (
        <div id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen" className="grid gap-6 [&>*]:min-w-0">
          <nav aria-label={tr('Accesos rápidos', 'Quick actions')} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 no-print">
            {actions.map((a) => {
              const inner = (<>
                <span className="size-11 rounded-[13px] grid place-items-center bg-accent-soft text-accent-ink shrink-0 group-hover:bg-accent group-hover:text-on-accent transition-colors" aria-hidden>{a.icon}</span>
                <span className="font-semibold leading-snug text-left">{a.title}</span>
              </>)
              const cls = 'group card flex items-center gap-3.5 p-4 hover:border-accent transition-colors'
              return a.to ? <Link key={a.title} to={a.to} className={cls}>{inner}</Link> : <button key={a.title} type="button" onClick={a.onClick} className={cls}>{inner}</button>
            })}
          </nav>

          <section aria-label={tr('Cifras principales', 'Key figures')} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: tr(`Recibido en ${d.label}`, `Received in ${d.label}`), value: money(k.total, { whole: true }), note: ytdNote },
              { label: d.isCurrent ? tr(`${monthName}, hasta hoy`, `${monthName} so far`) : monthName, value: money(k.thisMonth, { whole: true }), note: tr(`El mes anterior completo: ${money(k.prevMonth, { whole: true })}`, `Full previous month: ${money(k.prevMonth, { whole: true })}`) },
              { label: tr('Personas que ofrendaron', 'People who gave'), value: num(k.givers), note: k.giversPrev ? (k.givers >= k.giversPrev ? tr(`${k.givers - k.giversPrev} más que en ${d.prevLabel}`, `${k.givers - k.giversPrev} more than in ${d.prevLabel}`) : tr(`${k.giversPrev - k.givers} menos que en ${d.prevLabel}`, `${k.giversPrev - k.givers} fewer than in ${d.prevLabel}`)) : undefined },
              { label: tr('Ofrenda promedio', 'Average gift'), value: money(k.average, { whole: true }), note: tr(`En ${num(k.count)} ofrendas`, `Across ${num(k.count)} gifts`) },
            ].map((s) => (
              <div key={s.label} className="card p-6">
                <p className="text-ink-soft font-semibold">{s.label}</p>
                <p className="mt-1 text-[2.3rem] font-bold leading-tight tracking-tight tabular-nums">{s.value}</p>
                {s.note && <p className="text-ink-soft text-[0.95rem] mt-1">{s.note}</p>}
              </div>
            ))}
          </section>

          {session!.features.ai && k.count > 0 && <AiSummary year={d.year} />}

          <Card title={tr('Ofrendas de cada mes', 'Offerings each month')} hint={tr(`Compara ${d.label} con ${d.prevLabel}. «Acumulado» muestra cuánto se lleva reunido en el año.`, `Compares ${d.label} with ${d.prevLabel}. “Year to date” shows how much has been gathered so far.`)}>
            <MonthlyChart year={d.label} prevLabel={d.prevLabel} upTo={d.elapsed} data={d.monthly.map((m) => ({ label: labels.month(m.month), total: m.total, previous: m.previous }))} />
          </Card>

          <Card title={tr('Lo más importante', 'What matters most')} hint={tr('Cambios y tendencias que vale la pena mirar.', 'Changes and trends worth a look.')}>
            {insights.length === 0 ? <p className="text-muted py-2">{tr('Cuando haya más datos, aquí aparecerán las tendencias.', 'Trends will appear here once there is more data.')}</p> : (<>
              <ul className="grid">
                {shownNews.map((i) => {
                  const t = insightText(i)
                  const row = (<>
                    <span className={cx('size-10 rounded-full grid place-items-center shrink-0', tones[i.tone])} aria-hidden>{t.icon}</span>
                    <span className="flex-1 pt-1.5 leading-snug">{t.text}</span>
                    {t.to && <ChevronRight size={20} className="text-muted mt-2 shrink-0" aria-hidden />}
                  </>)
                  return (
                    <li key={i.type} className="border-t border-line first:border-t-0 py-3.5">
                      {t.to ? <Link to={t.to} className="flex gap-3.5 -mx-2 px-2 py-1 rounded-xl hover:bg-raised transition-colors">{row}</Link> : <div className="flex gap-3.5">{row}</div>}
                    </li>
                  )
                })}
              </ul>
              {insights.length > 3 && (
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAllNews(!allNews)}>
                  {allNews ? tr('Ver menos', 'Show less') : tr(`Ver las ${insights.length} novedades`, `See all ${insights.length}`)}
                </Button>
              )}
            </>)}
          </Card>
        </div>
      )}

      {view === 'dinero' && (
        <div id="panel-dinero" role="tabpanel" aria-labelledby="tab-dinero" className="grid gap-6 [&>*]:min-w-0">
          {d.finance.tracksExpenses && <FinanceStrip f={d.finance} monthName={lang === 'es' ? monthName.toLowerCase() : monthName} />}
          <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
            <Card title={tr('¿A qué fondos se dio?', 'Which funds received?')} hint={tr(`Total de ${d.label}`, `${d.label} total`)}>
              <ShareBars empty={tr('Aún no hay ofrendas este año.', 'No offerings yet this year.')} items={d.byFund.map((f) => ({ key: f.id, label: f.name, value: f.total, color: seriesColor(f.color_slot) }))} />
            </Card>
            <Card title={tr('¿Cómo se dio?', 'How was it given?')} hint={tr(`Formas de pago en ${d.label}`, `Payment methods in ${d.label}`)}>
              <ShareBars empty={tr('Aún no hay ofrendas este año.', 'No offerings yet this year.')}
                items={METHODS.map((m, i) => ({ key: m, label: labels.method(m), value: d.byMethod.find((x) => x.method === m)?.total || 0, color: seriesColor(i + 1) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)} />
            </Card>
          </div>
          <Card title={tr('Las últimas 12 semanas', 'The last 12 weeks')} hint={tr('Lo recibido cada semana. Sirve para ver domingos flojos o especiales.', 'What came in each week. Handy for spotting slow or special Sundays.')}>
            <Columns height="17rem" data={weeks} ghost={d.isCurrent ? weeks[weeks.length - 1]?.label : undefined} tipLabel={tr('Recibido', 'Received')} />
          </Card>
          <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-6 [&>*]:min-w-0">
            <Card title={tr('Fondos mes a mes', 'Funds month by month')} hint={tr('Cómo se reparte cada mes entre los fondos.', 'How each month splits across funds.')}>
              <FundStack upTo={upTo} funds={d.byFund} months={d.monthly.map((m) => ({ label: labels.month(m.month), byFund: m.byFund }))} />
            </Card>
            <Card title={tr('Cada año', 'Each year')} hint={tr('Total recibido por año.', 'Total received per year.')}>
              <Columns data={d.yearly.map((y) => ({ label: y.label, value: y.total }))} highlight={d.label} />
            </Card>
          </div>
        </div>
      )}

      {view === 'personas' && (
        <div id="panel-personas" role="tabpanel" aria-labelledby="tab-personas" className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0 items-start">
          <div className="grid gap-6 [&>*]:min-w-0">
          <Card title={tr(`¿Quiénes ofrendan en ${d.label}?`, `Who gives in ${d.label}?`)}
            hint={tr(`Regulares: dieron en ${seg.regularMonths} meses o más. Nuevos: su primera ofrenda fue este año.`, `Regular: gave in ${seg.regularMonths}+ months. New: first gift ever was this year.`)}>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[[tr('Regulares', 'Regular'), seg.regular], [tr('Ocasionales', 'Occasional'), seg.occasional], [tr('Nuevos', 'New'), seg.new]].map(([l, v]) => (
                <div key={l as string} className="rounded-[14px] bg-raised py-4 px-2 flex flex-col">
                  <dt className="text-ink-soft order-2">{l}</dt>
                  <dd className="text-[2.1rem] font-bold leading-tight">{num(v as number)}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title={tr('Quizá agradezcan una llamada', 'They might appreciate a call')} hint={tr('Ofrendaban con frecuencia y no lo hacen desde hace más de 60 días.', 'They used to give regularly and have not in over 60 days.')}>
            {lapsed.length === 0 ? <p className="text-muted py-2">{tr('Nadie por ahora. ¡Bien!', 'No one right now. Good!')}</p> : (
              <ul className="grid">
                {lapsed.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3 border-t border-line first:border-t-0">
                    <span><Link to={`/miembros/${m.id}`} className="font-medium hover:underline underline-offset-4">{m.name}</Link><span className="block text-muted text-[0.9rem]">{tr('Última ofrenda', 'Last gift')}: {date(m.last_date)}</span></span>
                    <Link to={`/miembros/${m.id}`} className="shrink-0"><Button size="sm" icon={<Phone size={16} />}>{tr('Ver contacto', 'See contact')}</Button></Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          </div>
          <div className="grid gap-6 [&>*]:min-w-0">
          <Card title={tr('Quienes más han dado', 'Top givers')} hint={tr(`Total de ${d.label}`, `${d.label} total`)}>
            {d.topMembers.length
              ? <Ranking items={d.topMembers.slice(0, 7).map((m) => ({ key: m.id, label: m.name, value: m.total, avatar: m.avatar_file, showAvatar: true }))} />
              : <p className="text-muted py-2">{tr('Aún no hay ofrendas con nombre este año.', 'No named offerings yet this year.')}</p>}
          </Card>
          <Celebrations items={d.celebrations} />
          </div>
          <Card pad={false} className="lg:col-span-2" title={tr('Últimas ofrendas', 'Latest offerings')}
            action={<Link to="/ofrendas" className="text-accent-ink font-semibold hover:underline underline-offset-4">{tr('Ver todas', 'See all')}</Link>}>
            <ul className="mt-3 border-t border-line grid lg:grid-cols-2 lg:[&>li:nth-child(odd)]:border-r [&>li]:border-line [&>li]:border-b">
              {d.recent.map((o) => (
                <li key={o.id} className="flex items-center gap-3.5 px-5 sm:px-6 py-3">
                  <Avatar name={o.member_name || '·'} file={o.member_avatar} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{o.member_name || <span className="text-ink-soft">{labels.loose}</span>}</p>
                    <p className="text-muted text-[0.9rem]">{o.fund_name} · {labels.method(o.method)} · {date(o.date)}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{money(o.amount)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {view === 'metas' && (
        <div id="panel-metas" role="tabpanel" aria-labelledby="tab-metas" className="grid gap-6 [&>*]:min-w-0">
          {d.goals.length === 0 ? (
            <Card>
              <Empty icon={<Target size={28} />} title={tr('Todavía no hay metas', 'No goals yet')} action={<Link to="/metas"><Button variant="primary">{tr('Crear una meta', 'Create a goal')}</Button></Link>}>
                {tr('Pon una meta —un techo nuevo, un viaje misionero— y sigue su avance aquí.', 'Set a goal — a new roof, a mission trip — and follow its progress here.')}
              </Empty>
            </Card>
          ) : (<>
            <div className="grid lg:grid-cols-2 gap-6 [&>*]:min-w-0">
              {d.goals.map((g) => {
                const pct = Math.round((g.raised / (g.target_amount || 1)) * 100)
                const left = Math.max(g.target_amount - g.raised, 0)
                return (
                  <section key={g.id} className="card p-6 sm:p-7 flex items-center gap-6">
                    <Ring value={g.raised} target={g.target_amount} label={g.name} size={112} />
                    <div className="min-w-0 grid gap-1">
                      <h2 className="font-semibold text-[1.2rem] leading-snug">{g.name}</h2>
                      <p className="text-[1.8rem] font-bold leading-tight tabular-nums">{money(g.raised, { whole: true })} <span className="text-muted text-[1.05rem] font-medium">{tr('de', 'of')} {money(g.target_amount, { whole: true })}</span></p>
                      <p className="text-ink-soft">{pct >= 100 ? tr('¡Meta lograda!', 'Goal reached!') : tr(`Faltan ${money(left, { whole: true })} hasta el ${date(g.end_date)}.`, `${money(left, { whole: true })} to go until ${date(g.end_date)}.`)}</p>
                      {g.pledged > 0 && <p className="text-muted text-[0.95rem]">{tr(`${num(g.pledge_count)} compromisos por ${money(g.pledged, { whole: true })}`, `${num(g.pledge_count)} pledges for ${money(g.pledged, { whole: true })}`)}</p>}
                    </div>
                  </section>
                )
              })}
            </div>
            <div><Link to="/metas"><Button icon={<Target size={18} />}>{tr('Ver y editar todas las metas', 'See and edit all goals')}</Button></Link></div>
          </>)}
        </div>
      )}
    </div>
  )
}
