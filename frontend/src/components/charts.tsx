import { useState, type ReactNode } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../lib/app'
import { seriesColor } from '../lib/labels'
import { Avatar, Tabs, cx } from './ui'

// Chart conventions (kept the same everywhere): thin 2px lines, bars capped in width with 4px rounded tops,
// a 2px surface-coloured gap between touching segments, recessive grid, text never in the data colour,
// a legend whenever there are two or more series, and a tooltip on hover.

const AXIS = { fontSize: '0.78rem', fill: 'var(--muted)' } as const
const GRID = <CartesianGrid stroke="var(--chart-grid)" vertical={false} />

function TipBox({ title, rows }: { title: ReactNode; rows: { key: string; label: string; value: string; color?: string }[] }) {
  return (
    <div className="bg-surface border border-line-strong rounded-[12px] shadow-card px-3.5 py-2.5 text-[0.9rem] min-w-44">
      <p className="font-semibold mb-1">{title}</p>
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2 text-ink-soft">
          {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span><span className="font-semibold text-ink pl-4">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { key: string; label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.88rem] text-ink-soft">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2">
          <span className={cx('shrink-0', i.dashed ? 'w-5 h-[3px] rounded-full' : 'size-3 rounded-[4px]')} style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/** This year's months as a filled line with last year behind it; can switch to a running total. */
export function MonthlyChart({ data, year, prevLabel, upTo }: { data: { label: string; total: number; previous: number }[]; year: number | string; prevLabel?: string; upTo: number }) {
  const prev = prevLabel ?? String(Number(year) - 1)
  const { money, tr } = useApp()
  const [mode, setMode] = useState<'month' | 'sum'>('month')
  const runningSum = (vals: number[]) => vals.map((_, i) => vals.slice(0, i + 1).reduce((s, v) => s + v, 0))
  const sumNow = runningSum(data.map((d) => d.total))
  const sumPrev = runningSum(data.map((d) => d.previous))
  // Months that haven't happened yet are left blank rather than drawn as zero.
  const rows = data.map((d, i) => ({
    label: d.label,
    total: i < upTo ? (mode === 'month' ? d.total : sumNow[i]) : null,
    previous: mode === 'month' ? d.previous : sumPrev[i],
  }))
  const hasPrev = data.some((d) => d.previous > 0)
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Legend items={[
          { key: 'a', label: String(year), color: 'var(--chart-main)', dashed: true },
          ...(hasPrev ? [{ key: 'b', label: prev, color: 'var(--chart-ghost)', dashed: true }] : []),
        ]} />
        <Tabs value={mode} onChange={setMode} options={[{ value: 'month', label: tr('Cada mes', 'Each month') }, { value: 'sum', label: tr('Acumulado del año', 'Year to date') }]} />
      </div>
      <div className="h-[19rem]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mainFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-main)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-main)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {GRID}
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => money(v, { compact: true })} />
            <Tooltip
              cursor={{ stroke: 'var(--line-strong)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as { total: number | null; previous: number }
                return <TipBox title={mode === 'sum' ? `${tr('Hasta', 'Through')} ${label}` : label} rows={[
                  ...(p.total != null ? [{ key: 'a', label: String(year), value: money(p.total), color: 'var(--chart-main)' }] : []),
                  ...(hasPrev ? [{ key: 'b', label: prev, value: money(p.previous), color: 'var(--chart-ghost)' }] : []),
                ]} />
              }}
            />
            {hasPrev && <Line dataKey="previous" stroke="var(--chart-ghost)" strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />}
            <Area dataKey="total" stroke="var(--chart-main)" strokeWidth={2.5} fill="url(#mainFill)" dot={false}
              activeDot={{ r: 5, fill: 'var(--chart-main)', stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

const roundTop = (props: any, fill: string) => {
  const { x, y, width, height: h } = props
  if (!h || h <= 0) return <g />
  const r = Math.min(4, h, width / 2)
  return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`} fill={fill} />
}

/** Simple columns for one series (e.g. totals per year or per week). */
export function Columns({ data, height = '15rem', highlight, ghost, tipLabel }: {
  data: { label: string; value: number; tip?: string }[]
  height?: string
  highlight?: string
  ghost?: string
  tipLabel?: string
}) {
  const { money } = useApp()
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip
            cursor={{ fill: 'var(--raised)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as { value: number; tip?: string }
              return <TipBox title={p.tip || label} rows={[{ key: 'v', label: tipLabel || 'Total', value: money(p.value), color: 'var(--chart-main)' }]} />
            }}
          />
          <Bar dataKey="value" maxBarSize={28} isAnimationActive={false}
            shape={(props: any) => roundTop(props, (highlight && props.payload.label !== highlight) || props.payload.label === ghost ? 'var(--chart-ghost)' : 'var(--chart-main)')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Each month's total split by fund, so changes in what people give to are visible over time. */
export function FundStack({ months, funds, upTo }: { months: { label: string; byFund: Record<string, number> }[]; funds: { id: string; name: string; color_slot: number }[]; upTo: number }) {
  const { money, tr } = useApp()
  const rows = months.slice(0, upTo).map((m) => ({ label: m.label, ...Object.fromEntries(funds.map((f) => [f.id, m.byFund[f.id] || 0])) }))
  return (
    <div>
      <Legend items={funds.map((f) => ({ key: f.id, label: f.name, color: seriesColor(f.color_slot) }))} />
      <div className="h-[16rem] mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {GRID}
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => money(v, { compact: true })} />
            <Tooltip
              cursor={{ fill: 'var(--raised)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const total = payload.reduce((s, p) => s + Number(p.value || 0), 0)
                return <TipBox title={`${label} · ${money(total)}`} rows={[...funds].reverse().filter((f) => Number((payload[0].payload as any)[f.id]) > 0)
                  .map((f) => ({ key: f.id, label: f.name, value: money((payload[0].payload as any)[f.id]), color: seriesColor(f.color_slot) }))} />
              }}
            />
            {funds.map((f) => (
              <Bar key={f.id} dataKey={f.id} name={f.name} stackId="f" fill={seriesColor(f.color_slot)} stroke="var(--surface)" strokeWidth={2} maxBarSize={30} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">{tr('Gráfica de barras apiladas por fondo y mes.', 'Stacked bar chart by fund and month.')}</p>
    </div>
  )
}

/** Ring chart with the total in the middle and a legend that carries names, shares and amounts. */
export function Donut({ items, centerLabel, format = 'money', empty }: {
  items: { key: string; label: string; value: number; color: string }[]
  centerLabel: string
  format?: 'money' | 'number'
  empty: string
}) {
  const { money, num } = useApp()
  const fmt = (v: number) => (format === 'money' ? money(v, { whole: true }) : num(v))
  const total = items.reduce((a, i) => a + i.value, 0)
  const [hover, setHover] = useState<number | null>(null)
  if (!total) return <p className="text-muted py-6">{empty}</p>
  const shown = hover != null ? items[hover] : null
  return (
    // Beside the legend when the card is wide enough, above it when it is not.
    <div className="@container">
    <div className="grid @[30rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-6 gap-y-4 items-center">
      <div className="relative aspect-square w-full max-w-[11rem] mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%" startAngle={90} endAngle={-270}
              stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} onMouseLeave={() => setHover(null)} onMouseEnter={(_, i) => setHover(i)}>
              {items.map((i, idx) => <Cell key={i.key} fill={i.color} opacity={hover == null || hover === idx ? 1 : 0.35} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center text-center pointer-events-none px-6">
          <div>
            <p className="text-[0.75rem] text-muted leading-tight">{shown ? shown.label : centerLabel}</p>
            <p className="font-bold text-[1.05rem] leading-tight mt-0.5">{fmt(shown ? shown.value : total)}</p>
            {shown && <p className="text-[0.75rem] text-muted">{Math.round((shown.value / total) * 100)}%</p>}
          </div>
        </div>
      </div>
      <ul className="grid gap-0.5 min-w-0">
        {items.map((i, idx) => (
          <li key={i.key} onMouseEnter={() => setHover(idx)} onMouseLeave={() => setHover(null)} className={cx('flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg', hover === idx && 'bg-raised')}>
            <span className="size-3 rounded-[4px] shrink-0" style={{ background: i.color }} aria-hidden />
            <span className="flex-1 min-w-0 truncate">{i.label}</span>
            <span className="text-muted text-[0.88rem] w-10 text-right shrink-0">{Math.round((i.value / total) * 100)}%</span>
            <span className="font-semibold text-right whitespace-nowrap shrink-0 min-w-[5rem]">{fmt(i.value)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  )
}

/** One horizontal bar split into parts, with a legend that carries names, amounts and shares. */
export function Breakdown({ items, empty }: { items: { key: string; label: string; value: number; slot: number }[]; empty: string }) {
  const { money } = useApp()
  const total = items.reduce((a, i) => a + i.value, 0)
  if (!total) return <p className="text-muted py-6">{empty}</p>
  return (
    <div>
      <div className="flex gap-[2px] h-7 rounded-[6px] overflow-hidden" role="img" aria-label={items.map((i) => `${i.label}: ${money(i.value)}`).join(', ')}>
        {items.map((i) => (
          <div key={i.key} title={`${i.label} · ${money(i.value)}`} style={{ flexGrow: i.value, flexBasis: 0, minWidth: 3, background: seriesColor(i.slot) }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-0.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 py-1.5">
            <span className="size-3 rounded-[4px] shrink-0" style={{ background: seriesColor(i.slot) }} aria-hidden />
            <span className="flex-1 min-w-0 truncate">{i.label}</span>
            <span className="text-muted text-[0.9rem] w-10 text-right shrink-0">{Math.round((i.value / total) * 100)}%</span>
            <span className="font-semibold min-w-[5.5rem] text-right whitespace-nowrap shrink-0">{money(i.value, { whole: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ranked horizontal bars drawn in plain HTML so long names and photos fit comfortably. */
export function Ranking({ items }: { items: { key: string; label: string; value: number; avatar?: string | null; showAvatar?: boolean; sub?: string }[] }) {
  const { money } = useApp()
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ol className="grid gap-3">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-3">
          {i.showAvatar && <Avatar name={i.label} file={i.avatar} size={38} />}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-3 items-baseline">
              <span className="truncate">{i.label}{i.sub && <span className="text-muted text-[0.85rem]"> · {i.sub}</span>}</span>
              <span className="font-semibold whitespace-nowrap">{money(i.value)}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max((i.value / max) * 100, 1.5)}%`, background: 'var(--chart-main)' }} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

/** A tiny trend line without axes, for headline figures and member cards. */
export function Sparkline({ values, height = 36, className, label }: { values: number[]; height?: number; className?: string; label?: string }) {
  if (!values.length) return null
  // Scaled to its own range so the shape of the trend is visible; a flat series stays flat.
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min
  const w = 100
  const step = values.length > 1 ? w / (values.length - 1) : w
  const pts = values.map((v, i) => [i * step, span > 0 ? height - 3 - ((v - min) / span) * (height - 6) : max > 0 ? height / 2 : height - 3])
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cx('w-full overflow-visible', className)} style={{ height }} role="img" aria-label={label}>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill="var(--chart-main)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--chart-main)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="var(--chart-main)" stroke="var(--surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** Circular progress for goals. */
export function Ring({ value, target, size = 76, label }: { value: number; target: number; size?: number; label?: string }) {
  const pct = target > 0 ? Math.min(value / target, 1) : 0
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const done = value >= target
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `${Math.round(pct * 100)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? 'var(--good)' : 'var(--chart-main)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-bold text-[0.95rem]">{Math.round((value / (target || 1)) * 100)}%</span>
    </div>
  )
}

export function ProgressBar({ value, target, label }: { value: number; target: number; label?: string }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0
  return (
    <div className="h-2.5 rounded-full bg-raised overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `${Math.round(pct)}%`}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : 'var(--chart-main)' }} />
    </div>
  )
}
