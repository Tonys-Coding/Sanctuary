import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ReactNode } from 'react'
import { useApp } from '../lib/app'
import { seriesColor } from '../lib/labels'
import { Avatar } from './ui'

const AXIS = { fontSize: 13, fill: 'var(--muted)' }

function TipBox({ title, rows }: { title: ReactNode; rows: { key: string; label: string; value: string; swatch: ReactNode }[] }) {
  return (
    <div className="bg-surface border border-line-strong rounded-[12px] shadow-card px-3.5 py-2.5 text-[0.9rem]">
      <p className="font-semibold mb-1">{title}</p>
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2 text-ink-soft">
          {r.swatch}<span className="flex-1">{r.label}</span><span className="font-semibold text-ink pl-4">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

/** This year's months as a filled line, with last year as a quiet reference line behind it. */
export function MonthlyChart({ data, year, upTo }: { data: { label: string; total: number; previous: number }[]; year: number; upTo: number }) {
  const { money } = useApp()
  // Months that haven't happened yet are left blank rather than drawn as zero.
  const rows = data.map((d, i) => ({ ...d, total: i < upTo ? d.total : null }))
  const hasPrev = data.some((d) => d.previous > 0)
  return (
    <div>
      {hasPrev && (
        <div className="flex gap-5 text-[0.88rem] text-ink-soft mb-2" aria-hidden>
          <span className="flex items-center gap-2"><span className="w-5 h-[3px] rounded-full" style={{ background: 'var(--chart-main)' }} />{year}</span>
          <span className="flex items-center gap-2"><span className="w-5 h-[3px] rounded-full" style={{ background: 'var(--chart-ghost)' }} />{year - 1}</span>
        </div>
      )}
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mainFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-main)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-main)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => money(v, { compact: true })} />
            <Tooltip
              cursor={{ stroke: 'var(--line-strong)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as { total: number | null; previous: number }
                return <TipBox title={label} rows={[
                  ...(p.total != null ? [{ key: 'a', label: String(year), value: money(p.total), swatch: <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-main)' }} /> }] : []),
                  ...(hasPrev ? [{ key: 'b', label: String(year - 1), value: money(p.previous), swatch: <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-ghost)' }} /> }] : []),
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

/** Simple columns for one series (e.g. totals per year or per month). */
export function Columns({ data, height = 240, highlight }: { data: { label: string; value: number }[]; height?: number; highlight?: string }) {
  const { money } = useApp()
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={62} tickFormatter={(v) => money(v, { compact: true })} />
          <Tooltip
            cursor={{ fill: 'var(--raised)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? <TipBox title={label} rows={[{ key: 'v', label: 'Total', value: money(payload[0].value as number), swatch: <span className="size-2.5 rounded-full" style={{ background: 'var(--chart-main)' }} /> }]} /> : null}
          />
          <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}
            shape={(props: any) => {
              const { x, y, width, height: h, payload } = props
              const fill = highlight && payload.label !== highlight ? 'var(--chart-ghost)' : 'var(--chart-main)'
              const r = Math.min(4, h)
              return <path d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + h} Z`} fill={fill} />
            }}
          />
        </BarChart>
      </ResponsiveContainer>
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
          {i.showAvatar && <Avatar name={i.label} file={i.avatar} size={36} />}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-3 items-baseline">
              <span className="truncate">{i.label}{i.sub && <span className="text-muted text-[0.85rem]"> · {i.sub}</span>}</span>
              <span className="font-semibold">{money(i.value)}</span>
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

export function ProgressBar({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? Math.min((value / target) * 100, 100) : 0
  return (
    <div className="h-2.5 rounded-full bg-raised overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--good)' : 'var(--chart-main)' }} />
    </div>
  )
}
