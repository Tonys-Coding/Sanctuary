import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, Globe, HandCoins, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { OnlineImport } from '../components/OnlineImport'
import { api, download, qs } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, useLabels } from '../lib/labels'
import { rangeFor, rangeOptions, type RangeKey } from '../lib/ranges'
import type { Offering } from '../lib/types'
import { Button, Card, Empty, PageHeader, Spinner, useFeedback } from '../components/ui'
import { OfferingTable } from '../components/OfferingTable'
import { useOfferingForm } from '../components/OfferingForm'

const PAGE = 100

export default function Offerings() {
  const { tr, money, num, session } = useApp()
  const fys = session!.org.fiscal_year_start || 1
  const [params] = useSearchParams()
  const labels = useLabels()
  const open = useOfferingForm()
  const { fail } = useFeedback()
  const { data: funds = [] } = useFunds(true)
  const [range, setRange] = useState<RangeKey>(params.get('q') ? 'all' : 'this_year')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [fundId, setFundId] = useState('')
  const [method, setMethod] = useState('')
  const [search, setSearch] = useState(params.get('q') || '')
  const [limit, setLimit] = useState(PAGE)
  const [importing, setImporting] = useState(false)
  const [moreFilters, setMoreFilters] = useState(false)

  const dates = range === 'custom' ? custom : rangeFor(range, fys)
  const filters = { ...dates, fundId, method, q: search.trim() }
  const { data, isPending } = useQuery({
    queryKey: ['offerings', filters, limit],
    queryFn: () => api.get<{ rows: Offering[]; count: number; total: number }>(`/offerings${qs({ ...filters, limit })}`),
    placeholderData: (p) => p,
  })
  const reset = () => setLimit(PAGE)

  return (
    <>
      <PageHeader title={tr('Ofrendas', 'Offerings')} subtitle={tr('Todos los diezmos y ofrendas registrados. Busca por nombre o elige un periodo.', 'Every tithe and offering on record. Search by name or choose a period.')}>
        <Button icon={<Globe size={19} />} onClick={() => setImporting(true)}>{tr('Importar en línea / Zelle', 'Import online / Zelle')}</Button>
        <Button variant="ghost" icon={<Download size={19} />} onClick={() => download(`/offerings/export.csv${qs(filters)}`, tr('ofrendas.csv', 'offerings.csv')).catch(fail)}>{tr('Descargar Excel', 'Download Excel')}</Button>
        <Button variant="primary" icon={<Plus size={20} />} onClick={() => open()}>{tr('Registrar ofrenda', 'Record offering')}</Button>
      </PageHeader>

      <div className="flex flex-wrap items-end gap-3 mb-4 no-print">
        <div className="relative flex-[2_1_18rem] max-w-xl">
          <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
          <input className="ctl !pl-11" placeholder={tr('Buscar por nombre, nota o n.º de cheque', 'Search by name, note or check no.')} aria-label={tr('Buscar', 'Search')} value={search} onChange={(e) => { setSearch(e.target.value); reset() }} />
        </div>
        <label className="flex-[1_1_12rem] max-w-xs grid gap-1">
          <span className="text-ink-soft text-[0.9rem]">{tr('Periodo', 'Period')}</span>
          <select className="ctl" value={range} onChange={(e) => { setRange(e.target.value as RangeKey); reset() }}>
            {rangeOptions(tr, true, fys).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <Button variant={moreFilters || fundId || method ? 'secondary' : 'ghost'} icon={<SlidersHorizontal size={18} />} aria-expanded={moreFilters} onClick={() => setMoreFilters(!moreFilters)}>
          {tr('Fondo y forma de pago', 'Fund and payment method')}{fundId || method ? ` (${[fundId, method].filter(Boolean).length})` : ''}
        </Button>
      </div>
      {(moreFilters || range === 'custom') && (
        <div className="flex flex-wrap items-end gap-3 mb-4 no-print">
          {moreFilters && (<>
            <label className="flex-[1_1_12rem] max-w-xs grid gap-1">
              <span className="text-ink-soft text-[0.9rem]">{tr('Fondo', 'Fund')}</span>
              <select className="ctl" value={fundId} onChange={(e) => { setFundId(e.target.value); reset() }}>
                <option value="">{tr('Todos los fondos', 'All funds')}</option>
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <label className="flex-[1_1_12rem] max-w-xs grid gap-1">
              <span className="text-ink-soft text-[0.9rem]">{tr('Forma de pago', 'Payment method')}</span>
              <select className="ctl" value={method} onChange={(e) => { setMethod(e.target.value); reset() }}>
                <option value="">{tr('Todas', 'All')}</option>
                {METHODS.map((m) => <option key={m} value={m}>{labels.method(m)}</option>)}
              </select>
            </label>
          </>)}
          {range === 'custom' && (<>
            <label className="grid gap-1"><span className="text-ink-soft text-[0.9rem]">{tr('Desde', 'From')}</span><input type="date" className="ctl !w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label className="grid gap-1"><span className="text-ink-soft text-[0.9rem]">{tr('Hasta', 'To')}</span><input type="date" className="ctl !w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </>)}
        </div>
      )}

      <OnlineImport open={importing} onClose={() => setImporting(false)} />
      <Card pad={false}>
        {isPending ? <Spinner /> : !data || data.count === 0 ? (
          <Empty icon={<HandCoins size={28} />} title={tr('No hay ofrendas con estos filtros', 'No offerings match these filters')}
            action={<Button variant="primary" onClick={() => open()}>{tr('Registrar ofrenda', 'Record offering')}</Button>}>
            {tr('Prueba con otro periodo o quita algún filtro.', 'Try another period or remove a filter.')}
          </Empty>
        ) : (<>
          <p className="px-5 sm:px-6 py-4 border-b border-line flex flex-wrap items-baseline gap-x-2">
            <span className="text-[1.45rem] font-bold">{money(data.total, { whole: true })}</span>
            <span className="text-ink-soft">{tr(`en ${num(data.count)} ofrendas${fundId || method || search.trim() ? ' que coinciden' : ''}`, `across ${num(data.count)} offerings${fundId || method || search.trim() ? ' that match' : ''}`)}</span>
          </p>
          <OfferingTable rows={data.rows} groupByDay more={data.rows.length < data.count} />
          {data.rows.length < data.count && (
            <div className="p-4 text-center border-t border-line no-print">
              <Button onClick={() => setLimit((l) => l + PAGE)}>{tr(`Mostrar más (${num(data.count - data.rows.length)} restantes)`, `Show more (${num(data.count - data.rows.length)} left)`)}</Button>
            </div>
          )}
        </>)}
      </Card>
    </>
  )
}
