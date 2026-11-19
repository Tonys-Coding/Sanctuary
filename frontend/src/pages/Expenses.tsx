import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, FileText, Paperclip, Pencil, Plus, Receipt, Search, Trash2, Wallet } from 'lucide-react'
import { api, fileUrl, qs } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, parseAmount, seriesColor, todayIso, useLabels } from '../lib/labels'
import { rangeFor, rangeOptions, type RangeKey } from '../lib/ranges'
import type { Expense, ExpenseCategory, Method } from '../lib/types'
import { Badge, Button, Card, Choice, Empty, ErrorNote, Field, IconButton, Modal, PageHeader, Spinner, Tabs, Td, Th, cx, useFeedback } from '../components/ui'
import { Columns } from '../components/charts'

interface Summary {
  year: number; label: string; start: string; end: string; balance: number
  years: { year: number; label: string }[]
  categories: { id: string; name: string; color_slot: number; archived_at: string | null; budget: number | null; spent: number }[]
  months: { year: number; month: number; expenses: number; income: number }[]
  totals: { budget: number; spent: number; income: number }
}

const useCategories = (all = false) => useQuery({ queryKey: ['expense-categories', all], queryFn: () => api.get<ExpenseCategory[]>(`/expenses/categories${all ? '?all=1' : ''}`) })

/** What the church pays out: each expense with its receipt, the yearly budget, and how much is left. */
export default function Expenses() {
  const { tr } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as 'gastos' | 'presupuesto' | 'categorias') || 'gastos'
  const [year, setYear] = useState<number | undefined>()
  const { data: sum } = useQuery({ queryKey: ['expenses-summary', year], queryFn: () => api.get<Summary>(`/expenses/summary${qs({ year })}`), placeholderData: (p) => p })
  const [editing, setEditing] = useState<Partial<Expense> | null>(null)

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <PageHeader title={tr('Gastos y presupuesto', 'Expenses & budget')} subtitle={tr('Registra lo que paga la iglesia, guarda los recibos y compara con el presupuesto del año.', 'Record what the church pays, keep the receipts and compare with the year’s budget.')}>
        <Button variant="primary" icon={<Plus size={20} />} onClick={() => setEditing({})}>{tr('Registrar gasto', 'Record expense')}</Button>
      </PageHeader>

      {sum && <SummaryStrip sum={sum} year={year} setYear={setYear} />}

      <Tabs value={tab} onChange={(v) => setParams(v === 'gastos' ? {} : { tab: v }, { replace: true })} options={[
        { value: 'gastos', label: tr('Gastos', 'Expenses') },
        { value: 'presupuesto', label: tr('Presupuesto', 'Budget') },
        { value: 'categorias', label: tr('Categorías', 'Categories') },
      ]} />

      {tab === 'gastos' && <ExpenseList onEdit={setEditing} initialSearch={params.get('q') || ''} />}
      {tab === 'presupuesto' && sum && <Budget sum={sum} />}
      {tab === 'categorias' && <Categories />}

      {editing && <ExpenseForm expense={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SummaryStrip({ sum, year, setYear }: { sum: Summary; year?: number; setYear: (y: number) => void }) {
  const { tr, money } = useApp()
  const labels = useLabels()
  const used = sum.totals.budget > 0 ? Math.round((sum.totals.spent / sum.totals.budget) * 100) : null
  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-5">
      <section className="card grid grid-cols-2 [&>*]:p-5 [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t [&>*]:border-line" aria-label={tr('Resumen', 'Summary')}>
        <div>
          <p className="text-muted flex items-center gap-2"><Wallet size={18} aria-hidden />{tr('Saldo estimado hoy', 'Estimated balance today')}</p>
          <p className="text-[clamp(1.2rem,5vw,1.7rem)] font-bold leading-tight break-all">{money(sum.balance, { whole: true })}</p>
          <Link to="/configuracion?tab=finanzas" className="text-accent-ink text-[0.86rem] font-semibold hover:underline underline-offset-4">{tr('Saldo inicial', 'Opening balance')}</Link>
        </div>
        <div>
          <label className="text-muted flex items-center gap-2">{tr('Año', 'Year')}
            <select className="ctl !w-auto !min-h-9 !py-0" value={year ?? sum.year} onChange={(e) => setYear(Number(e.target.value))}>
              {sum.years.map((y) => <option key={y.year} value={y.year}>{y.label}</option>)}
            </select>
          </label>
          <p className="text-[clamp(1.2rem,5vw,1.7rem)] font-bold leading-tight mt-1 break-all">{money(sum.totals.spent, { whole: true })}</p>
          <p className="text-muted text-[0.86rem]">{tr('gastado', 'spent')}</p>
        </div>
        <div>
          <p className="text-muted">{tr('Ingresos del año', 'Income this year')}</p>
          <p className="text-[1.4rem] font-bold leading-tight text-good">{money(sum.totals.income, { whole: true })}</p>
        </div>
        <div>
          <p className="text-muted">{tr('Presupuesto usado', 'Budget used')}</p>
          <p className={cx('text-[1.4rem] font-bold leading-tight', used != null && used > 100 && 'text-bad')}>{used != null ? `${used}%` : '—'}</p>
          {used == null && <p className="text-muted text-[0.86rem]">{tr('Sin presupuesto', 'No budget yet')}</p>}
        </div>
      </section>
      <Card title={tr('Entradas y salidas por mes', 'In and out by month')}>
        <Columns height="12rem" tipLabel={tr('Gastos', 'Expenses')}
          data={sum.months.map((m) => ({ label: labels.month(m.month), value: m.expenses, tip: `${tr('Ingresos', 'Income')} ${money(m.income, { whole: true })} · ${tr('Gastos', 'Expenses')} ${money(m.expenses, { whole: true })}` }))} />
      </Card>
    </div>
  )
}

function ExpenseList({ onEdit, initialSearch }: { onEdit: (e: Expense) => void; initialSearch: string }) {
  const { tr, money, date, session } = useApp()
  const labels = useLabels()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const { data: cats = [] } = useCategories(true)
  const fys = session!.org.fiscal_year_start || 1
  const [range, setRange] = useState<RangeKey>(initialSearch ? 'all' : fys === 1 ? 'this_year' : 'fiscal_year')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState(initialSearch)
  const dates = range === 'custom' ? { from: '', to: '' } : rangeFor(range, fys)
  const { data: rows, isPending } = useQuery({ queryKey: ['expenses', dates, category, search], queryFn: () => api.get<Expense[]>(`/expenses${qs({ ...dates, category, q: search.trim() })}`), placeholderData: (p) => p })
  const total = (rows || []).reduce((a, e) => a + e.amount, 0)

  const remove = async (e: Expense) => {
    if (!(await confirm({ title: tr('¿Eliminar este gasto?', 'Delete this expense?'), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'), body: `${e.payee} · ${money(e.amount)} · ${date(e.date)}` }))) return
    try { await api.del(`/expenses/${e.id}`); await qc.invalidateQueries(); toast(tr('Gasto eliminado', 'Expense deleted')) } catch (err) { fail(err) }
  }

  return (<>
    <div className="grid gap-3 sm:grid-cols-3 no-print">
      <div className="relative">
        <Search size={19} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
        <input className="ctl !pl-11" placeholder={tr('Buscar por pagado a, referencia o nota', 'Search by payee, reference or note')} aria-label={tr('Buscar', 'Search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <select className="ctl" aria-label={tr('Periodo', 'Period')} value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
        {rangeOptions(tr, true, fys).filter((o) => o.value !== 'custom').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="ctl" aria-label={tr('Categoría', 'Category')} value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">{tr('Todas las categorías', 'All categories')}</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
    <Card pad={false}>
      {isPending ? <Spinner /> : !rows?.length ? (
        <Empty icon={<Receipt size={28} />} title={tr('No hay gastos en este periodo', 'No expenses in this period')}>
          {tr('Registra cada pago de la iglesia —luz, renta, honorarios— y guarda la foto del recibo.', 'Record every church payment — utilities, rent, honoraria — and keep a photo of the receipt.')}
        </Empty>
      ) : (<>
        <p className="px-5 sm:px-6 py-4 border-b border-line"><span className="text-[1.35rem] font-bold">{money(total)}</span> <span className="text-muted">{tr(`en ${rows.length} gastos`, `across ${rows.length} expenses`)}</span></p>
        <div className="overflow-x-auto relative">
          <table className="w-full">
            <thead><tr className="border-b border-line"><Th>{tr('Fecha', 'Date')}</Th><Th>{tr('Pagado a', 'Paid to')}</Th><Th>{tr('Categoría', 'Category')}</Th><Th>{tr('Método', 'Method')}</Th><Th right>{tr('Monto', 'Amount')}</Th><Th right><span className="sr-only">{tr('Acciones', 'Actions')}</span></Th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <Td className="whitespace-nowrap">{date(e.date)}</Td>
                  <Td><span className="font-medium">{e.payee}</span>{e.notes && <span className="block text-muted text-[0.85rem] truncate max-w-[22rem]">{e.notes}</span>}</Td>
                  <Td><span className="inline-flex items-center gap-2 whitespace-nowrap"><span className="size-2.5 rounded-full" style={{ background: seriesColor(e.color_slot) }} aria-hidden />{e.category}</span></Td>
                  <Td className="text-ink-soft whitespace-nowrap">{labels.method(e.method)}{e.reference ? ` #${e.reference}` : ''}</Td>
                  <Td right className="font-semibold whitespace-nowrap">{money(e.amount)}</Td>
                  <Td right className="whitespace-nowrap !py-1">
                    {e.receipt_file && <a href={fileUrl(e.receipt_file)} target="_blank" rel="noreferrer" className="inline-grid place-items-center size-11 rounded-[11px] text-ink-soft hover:bg-raised" title={tr('Ver recibo', 'View receipt')} aria-label={tr('Ver recibo', 'View receipt')}><Paperclip size={18} /></a>}
                    <IconButton label={tr('Editar', 'Edit')} onClick={() => onEdit(e)}><Pencil size={18} /></IconButton>
                    <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(e)}><Trash2 size={18} /></IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </Card>
  </>)
}

function ExpenseForm({ expense, onClose }: { expense: Partial<Expense>; onClose: () => void }) {
  const { tr, money } = useApp()
  const labels = useLabels()
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const { data: cats = [] } = useCategories()
  const { data: funds = [] } = useFunds()
  const { data: payees = [] } = useQuery({ queryKey: ['payees'], queryFn: () => api.get<{ payee: string; category_id: string }[]>('/expenses/payees') })
  const [f, setF] = useState({
    date: expense.date || todayIso(), category_id: expense.category_id || '', fund_id: expense.fund_id || '', payee: expense.payee || '',
    amount: expense.amount ? expense.amount.toFixed(2) : '', method: (expense.method || 'check') as Method, reference: expense.reference || '', notes: expense.notes || '',
  })
  const [file, setFile] = useState<File | null>(null)
  const [savedId, setSavedId] = useState<string | undefined>(expense.id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => { if (!f.category_id && cats.length) setF((x) => ({ ...x, category_id: cats[0].id })) }, [cats, f.category_id])
  const amount = parseAmount(f.amount)
  const valid = amount > 0 && f.payee.trim() && f.category_id && f.date

  const save = async () => {
    setBusy(true); setError(null)
    try {
      const body = { ...f, amount }
      const saved = savedId ? await api.patch<Expense>(`/expenses/${savedId}`, body) : await api.post<Expense>('/expenses', body)
      setSavedId(saved.id)
      if (file) {
        try { await api.upload(`/expenses/${saved.id}/receipt`, file) } catch (e) {
          // The expense is saved; only the receipt failed. Pressing Save again updates it instead of adding another.
          await qc.invalidateQueries(); setFile(null); setError(e); return
        }
      }
      await qc.invalidateQueries()
      toast(expense.id ? tr('Gasto actualizado', 'Expense updated') : tr(`Gasto de ${money(amount)} registrado`, `${money(amount)} expense recorded`))
      onClose()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const removeReceipt = async () => {
    try { await api.del(`/expenses/${expense.id}/receipt`); await qc.invalidateQueries(); onClose() } catch (e) { setError(e) }
  }

  return (
    <Modal open onClose={onClose} title={expense.id ? tr('Editar gasto', 'Edit expense') : tr('Registrar gasto', 'Record expense')}
      footer={<><Button onClick={onClose}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} disabled={!valid} onClick={save}>{tr('Guardar', 'Save')}</Button></>}>
      <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); if (valid) save() }}>
        <Field label={tr('¿A quién se pagó?', 'Who was paid?')}>
          {(id) => (<>
            <input id={id} className="ctl" list="payees" autoFocus value={f.payee} onChange={(e) => {
              const payee = e.target.value
              const known = payees.find((p) => p.payee.toLowerCase() === payee.toLowerCase())
              setF({ ...f, payee, category_id: known && !expense.id ? known.category_id : f.category_id })
            }} />
            <datalist id="payees">{payees.map((p) => <option key={p.payee} value={p.payee} />)}</datalist>
          </>)}
        </Field>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label={tr('Monto', 'Amount')}>
            {(id) => <input id={id} className="ctl text-[1.3rem] font-semibold" inputMode="decimal" placeholder="0.00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, '') })} />}
          </Field>
          <Field label={tr('Fecha', 'Date')}>{(id) => <input id={id} type="date" className="ctl" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
        </div>
        <Field label={tr('Categoría', 'Category')}>
          {(id) => <select id={id} className="ctl" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        </Field>
        <Field label={tr('Forma de pago', 'Payment method')}>
          {() => <Choice label={tr('Forma de pago', 'Payment method')} value={f.method} onChange={(v) => setF({ ...f, method: v })} options={METHODS.map((m) => ({ value: m, label: labels.method(m) }))} />}
        </Field>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label={f.method === 'check' ? tr('Número de cheque', 'Check number') : tr('Referencia', 'Reference')} optional>
            {(id) => <input id={id} className="ctl" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />}
          </Field>
          <Field label={tr('Pagado del fondo', 'Paid from fund')} optional hint={tr('Por ejemplo, Misiones o Construcción.', 'For example, Missions or Building.')}>
            {(id) => <select id={id} className="ctl" value={f.fund_id} onChange={(e) => setF({ ...f, fund_id: e.target.value })}><option value="">{tr('General', 'General')}</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
          </Field>
        </div>
        <Field label={tr('Nota', 'Note')} optional>{(id) => <input id={id} className="ctl" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />}</Field>
        <Field label={tr('Recibo o factura', 'Receipt or invoice')} optional hint={tr('Una foto o un PDF. Se guarda junto al gasto.', 'A photo or a PDF. It is kept with the expense.')}>
          {(id) => (
            <div className="flex flex-wrap items-center gap-3">
              {expense.receipt_file && !file && (<>
                <a href={fileUrl(expense.receipt_file)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-accent-ink font-semibold hover:underline underline-offset-4"><FileText size={18} />{tr('Ver recibo actual', 'View current receipt')}</a>
                <Button size="sm" variant="ghost" onClick={removeReceipt}>{tr('Quitar', 'Remove')}</Button>
              </>)}
              <label className="inline-flex items-center gap-2 min-h-11 px-4 rounded-[11px] border-[1.5px] border-line-strong cursor-pointer hover:bg-raised font-medium">
                <Paperclip size={17} aria-hidden />{file ? file.name : expense.receipt_file ? tr('Cambiar recibo', 'Replace receipt') : tr('Tomar foto o elegir archivo', 'Take a photo or choose a file')}
                <input id={id} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          )}
        </Field>
        <ErrorNote error={error} />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

function Budget({ sum }: { sum: Summary }) {
  const { tr, money } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { setValues(Object.fromEntries(sum.categories.map((c) => [c.id, c.budget != null ? String(c.budget) : '']))) }, [sum])
  const dirty = useMemo(() => sum.categories.some((c) => (values[c.id] ?? '') !== (c.budget != null ? String(c.budget) : '')), [values, sum])
  const save = async () => {
    setBusy(true)
    try {
      await api.put('/expenses/budget', { year: sum.year, amounts: sum.categories.map((c) => ({ category_id: c.id, amount: values[c.id] ? parseAmount(values[c.id]) : null })) })
      await qc.invalidateQueries(); toast(tr('Presupuesto guardado', 'Budget saved'))
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const totalBudget = sum.categories.reduce((a, c) => a + (parseAmount(values[c.id] || '') || 0), 0)
  return (
    <Card title={tr(`Presupuesto ${sum.label}`, `${sum.label} budget`)} hint={tr('Escribe cuánto planea gastar la iglesia en cada categoría este año. Las barras muestran cuánto se ha usado.', 'Enter how much the church plans to spend in each category this year. The bars show how much has been used.')}
      action={<Button variant="primary" busy={busy} disabled={!dirty} onClick={save}>{tr('Guardar presupuesto', 'Save budget')}</Button>}>
      <ul className="grid gap-3">
        {sum.categories.map((c) => {
          const b = parseAmount(values[c.id] || '') || 0
          const pct = b > 0 ? Math.round((c.spent / b) * 100) : null
          return (
            <li key={c.id} className="grid sm:grid-cols-[minmax(0,1fr)_10rem_minmax(0,1.3fr)] items-center gap-x-5 gap-y-2 py-2 border-b border-line last:border-0">
              <span className="flex items-center gap-2.5 font-medium"><span className="size-3 rounded-full shrink-0" style={{ background: seriesColor(c.color_slot) }} aria-hidden />{c.name}{c.archived_at && <Badge>{tr('Archivada', 'Archived')}</Badge>}</span>
              <label className="relative">
                <span className="sr-only">{tr(`Presupuesto de ${c.name}`, `${c.name} budget`)}</span>
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden>$</span>
                <input className="ctl !pl-7 !min-h-11 text-right" inputMode="decimal" placeholder="0" value={values[c.id] ?? ''} onChange={(e) => setValues({ ...values, [c.id]: e.target.value.replace(/[^\d.,]/g, '') })} />
              </label>
              <div>
                <div className="h-3 rounded-full bg-raised overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct ?? 0, 100)} aria-label={c.name}>
                  <div className={cx('h-full rounded-full', pct != null && pct > 100 ? 'bg-bad' : pct != null && pct > 85 ? 'bg-warn' : 'bg-good')} style={{ width: `${Math.min(pct ?? (c.spent > 0 ? 100 : 0), 100)}%` }} />
                </div>
                <p className="text-[0.86rem] text-muted mt-1">
                  {tr('Gastado', 'Spent')} {money(c.spent)}{pct != null && ` · ${pct}%`}{b > 0 && ` · ${c.spent <= b ? tr(`quedan ${money(b - c.spent)}`, `${money(b - c.spent)} left`) : tr(`pasado por ${money(c.spent - b)}`, `over by ${money(c.spent - b)}`)}`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 pt-4 border-t border-line flex flex-wrap justify-between gap-2 font-semibold">
        <span>{tr('Total presupuestado', 'Total budget')}: {money(totalBudget)}</span>
        <span>{tr('Gastado', 'Spent')}: {money(sum.totals.spent)}</span>
      </p>
    </Card>
  )
}

function Categories() {
  const { tr } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const { data: cats = [], isPending } = useCategories(true)
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null)
  const add = async () => {
    try { await api.post('/expenses/categories', { name, color_slot: (cats.length % 8) + 1 }); setName(''); await qc.invalidateQueries(); toast(tr('Categoría agregada', 'Category added')) } catch (e) { fail(e) }
  }
  const update = async (c: ExpenseCategory, patch: Partial<{ name: string; archived: boolean }>) => {
    try { await api.patch(`/expenses/categories/${c.id}`, { name: c.name, color_slot: c.color_slot, ...patch }); await qc.invalidateQueries(); setEdit(null) } catch (e) { fail(e) }
  }
  const remove = async (c: ExpenseCategory) => {
    try { await api.del(`/expenses/categories/${c.id}`); await qc.invalidateQueries(); toast(tr('Categoría eliminada', 'Category deleted')) } catch (e) { fail(e) }
  }
  if (isPending) return <Spinner />
  return (
    <Card title={tr('Categorías de gasto', 'Expense categories')} hint={tr('Puedes renombrarlas, agregar nuevas o archivar las que no uses. Una categoría con gastos no se elimina: se archiva.', 'Rename them, add new ones or archive those you do not use. A category with expenses is archived, not deleted.')}>
      <form className="flex flex-wrap gap-3 mb-5" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add() }}>
        <input className="ctl flex-1 min-w-[14rem]" placeholder={tr('Nueva categoría, ej. «Escuela dominical»', 'New category, e.g. “Sunday school”')} aria-label={tr('Nueva categoría', 'New category')} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" icon={<Plus size={18} />} disabled={!name.trim()}>{tr('Agregar', 'Add')}</Button>
      </form>
      <ul className="grid gap-1">
        {cats.map((c) => (
          <li key={c.id} className={cx('flex items-center gap-3 py-2 border-b border-line last:border-0', c.archived_at && 'opacity-60')}>
            <span className="size-3 rounded-full shrink-0" style={{ background: seriesColor(c.color_slot) }} aria-hidden />
            {edit?.id === c.id ? (
              <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); update(c, { name: edit.name }) }}>
                <input className="ctl !min-h-10" autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label={tr('Nombre', 'Name')} />
                <Button size="sm" type="submit" variant="primary">{tr('Guardar', 'Save')}</Button>
              </form>
            ) : <span className="flex-1">{c.name}{c.archived_at && <span className="text-muted"> · {tr('archivada', 'archived')}</span>}</span>}
            <IconButton label={tr('Renombrar', 'Rename')} onClick={() => setEdit({ id: c.id, name: c.name })}><Pencil size={17} /></IconButton>
            <IconButton label={c.archived_at ? tr('Recuperar', 'Restore') : tr('Archivar', 'Archive')} onClick={() => update(c, { archived: !c.archived_at })}>{c.archived_at ? <ArchiveRestore size={17} /> : <Archive size={17} />}</IconButton>
            <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(c)}><Trash2 size={17} /></IconButton>
          </li>
        ))}
      </ul>
    </Card>
  )
}
