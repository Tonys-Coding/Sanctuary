import { todayIso } from './labels'

export type RangeKey = 'this_month' | 'last_month' | 'last_90' | 'this_year' | 'last_year' | 'fiscal_year' | 'last_fiscal_year' | 'all' | 'custom'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Turns a named period ("this month") into concrete dates. */
/** fys = month the church's fiscal year starts (1 = January). */
export function rangeFor(key: RangeKey, fys = 1): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (key) {
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: todayIso() }
    case 'last_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'last_90': return { from: iso(new Date(y, m, now.getDate() - 89)), to: todayIso() }
    case 'this_year': return { from: `${y}-01-01`, to: todayIso() }
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'fiscal_year': {
      const start = m + 1 >= fys ? y : y - 1
      return { from: iso(new Date(start, fys - 1, 1)), to: todayIso() }
    }
    case 'last_fiscal_year': {
      const start = (m + 1 >= fys ? y : y - 1) - 1
      return { from: iso(new Date(start, fys - 1, 1)), to: iso(new Date(start + 1, fys - 1, 0)) }
    }
    default: return { from: '', to: '' }
  }
}

export const rangeOptions = (tr: (es: string, en: string) => string, withAll = true, fys = 1): { value: RangeKey; label: string }[] => [
  { value: 'this_month', label: tr('Este mes', 'This month') },
  { value: 'last_month', label: tr('El mes pasado', 'Last month') },
  { value: 'last_90', label: tr('Últimos 90 días', 'Last 90 days') },
  { value: 'this_year', label: tr('Este año', 'This year') },
  { value: 'last_year', label: tr('El año pasado', 'Last year') },
  ...(fys !== 1 ? [
    { value: 'fiscal_year' as RangeKey, label: tr('Este año fiscal', 'This fiscal year') },
    { value: 'last_fiscal_year' as RangeKey, label: tr('El año fiscal pasado', 'Last fiscal year') },
  ] : []),
  ...(withAll ? [{ value: 'all' as RangeKey, label: tr('Todo el historial', 'All time') }] : []),
  { value: 'custom', label: tr('Elegir fechas…', 'Choose dates…') },
]
