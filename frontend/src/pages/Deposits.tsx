import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, FileText, Landmark, PiggyBank, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { parseAmount, todayIso } from '../lib/labels'
import type { Deposit, DepositStatus } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Spinner, Td, Th, cx, useFeedback } from '../components/ui'
import { usePdfPreview } from '../components/PdfPreview'

interface PendingCount { id: string; date: string; name: string; cash: number; checks: number }
interface DepositDetail extends Deposit {
  batches: { id: string; date: string; name: string; cash: number; checks: number }[]
  check_list: { id: string; amount: number; check_number: string | null; name: string }[]
  denominations: { value: number; count: number }[]
}

export function useStatusLabel() {
  const { tr } = useApp()
  return (s: DepositStatus) => ({ pending: tr('Por llevar al banco', 'To take to the bank'), deposited: tr('Depositado', 'Deposited'), reconciled: tr('Conciliado', 'Reconciled') })[s]
}
const tone = (s: DepositStatus) => (s === 'pending' ? 'warn' : s === 'deposited' ? 'accent' : 'good') as 'warn' | 'accent' | 'good'

/**
 * Bank deposits: closed counts are grouped into a deposit, a slip is printed to take to the bank,
 * and later the deposit is matched with the bank statement ("conciliar").
 */
export default function Deposits() {
  const { tr, money, date, num } = useApp()
  const statusLabel = useStatusLabel()
  const [params, setParams] = useSearchParams()
  const { data, isPending } = useQuery({ queryKey: ['deposits'], queryFn: () => api.get<{ deposits: Deposit[]; pending: PendingCount[] }>('/deposits') })
  const [creating, setCreating] = useState(false)
  const openId = params.get('d')
  const setOpen = (id: string | null) => setParams(id ? { d: id } : {}, { replace: true })

  if (isPending || !data) return <Spinner />
  const waiting = data.pending.reduce((a, b) => a + b.cash + b.checks, 0)
  const toBank = data.deposits.filter((d) => d.status === 'pending')
  const toReconcile = data.deposits.filter((d) => d.status === 'deposited')

  return (
    <div className="grid gap-5 [&>*]:min-w-0">
      <PageHeader title={tr('Depósitos bancarios', 'Bank deposits')}
        subtitle={tr('Junta los conteos cerrados en un depósito, imprime la hoja para el banco y luego confírmalo con el estado de cuenta.', 'Group closed counts into a deposit, print the slip for the bank, then confirm it against the bank statement.')}>
        <Button variant="primary" icon={<Plus size={20} />} onClick={() => setCreating(true)} disabled={!data.pending.length}>{tr('Nuevo depósito', 'New deposit')}</Button>
      </PageHeader>

      <ol className="grid sm:grid-cols-3 gap-3">
        {[
          { n: 1, icon: <PiggyBank size={22} />, title: tr('Conteos sin depositar', 'Counts not deposited'), value: money(waiting), sub: tr(`${num(data.pending.length)} conteos cerrados`, `${num(data.pending.length)} closed counts`) },
          { n: 2, icon: <Landmark size={22} />, title: tr('Por llevar al banco', 'To take to the bank'), value: money(toBank.reduce((a, d) => a + d.total, 0)), sub: tr(`${num(toBank.length)} depósitos`, `${num(toBank.length)} deposits`) },
          { n: 3, icon: <Scale size={22} />, title: tr('Por conciliar', 'To reconcile'), value: num(toReconcile.length), sub: tr('Compáralos con el estado de cuenta', 'Compare them with the bank statement') },
        ].map((s) => (
          <li key={s.n} className="card p-5 flex gap-4 items-start">
            <span className="size-11 rounded-[13px] grid place-items-center bg-accent-soft text-accent-ink shrink-0" aria-hidden>{s.icon}</span>
            <span>
              <span className="block text-muted">{s.n}. {s.title}</span>
              <span className="block text-[1.6rem] font-bold leading-tight">{s.value}</span>
              <span className="block text-muted text-[0.87rem]">{s.sub}</span>
            </span>
          </li>
        ))}
      </ol>

      {data.pending.length > 0 && (
        <Card title={tr('Conteos cerrados que aún no se depositan', 'Closed counts not yet deposited')}
          action={<Button size="sm" icon={<Plus size={16} />} onClick={() => setCreating(true)}>{tr('Depositar', 'Deposit')}</Button>}>
          <ul className="grid gap-1">
            {data.pending.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 border-b border-line last:border-0">
                <Link to={`/conteos/${b.id}`} className="flex-1 min-w-[12rem] font-medium hover:underline underline-offset-4">{b.name}</Link>
                <span className="text-muted">{date(b.date)}</span>
                <span className="font-semibold w-28 text-right">{money(b.cash + b.checks)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card pad={false} title={tr('Depósitos', 'Deposits')}>
        {data.deposits.length === 0 ? (
          <Empty icon={<Landmark size={28} />} title={tr('Todavía no hay depósitos', 'No deposits yet')}>
            {data.pending.length ? tr('Pulsa «Nuevo depósito» y elige los conteos que llevas al banco.', 'Press “New deposit” and choose the counts you are taking to the bank.') : tr('Cierra un conteo y aparecerá aquí para depositarlo.', 'Close a count and it will appear here to deposit.')}
          </Empty>
        ) : (
          <div className="overflow-x-auto relative mt-3 border-t border-line">
            <table className="w-full">
              <thead><tr className="border-b border-line"><Th>{tr('Fecha', 'Date')}</Th><Th>{tr('Estado', 'Status')}</Th><Th>{tr('Referencia', 'Reference')}</Th><Th right>{tr('Efectivo', 'Cash')}</Th><Th right>{tr('Cheques', 'Checks')}</Th><Th right>Total</Th><Th right>{tr('Banco', 'Bank')}</Th></tr></thead>
              <tbody>
                {data.deposits.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0 hover:bg-raised/50 cursor-pointer" onClick={() => setOpen(d.id)}>
                    <Td><button type="button" className="font-medium hover:underline underline-offset-4" onClick={(e) => { e.stopPropagation(); setOpen(d.id) }}>{date(d.date)}</button></Td>
                    <Td><Badge tone={tone(d.status)}>{statusLabel(d.status)}</Badge></Td>
                    <Td className="text-ink-soft">{[d.account, d.reference].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td right>{money(d.cash)}</Td>
                    <Td right>{money(d.checks)}{d.check_count ? <span className="text-muted text-[0.85rem]"> ({d.check_count})</span> : null}</Td>
                    <Td right className="font-semibold">{money(d.total)}</Td>
                    <Td right className={cx(d.bank_amount != null && Math.abs(d.bank_amount - d.total) >= 0.005 && 'text-bad font-semibold')}>{d.bank_amount != null ? money(d.bank_amount) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <NewDeposit pending={data.pending} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id) }} />}
      {openId && <DepositModal id={openId} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NewDeposit({ pending, onClose, onCreated }: { pending: PendingCount[]; onClose: () => void; onCreated: (id: string) => void }) {
  const { tr, money, date } = useApp()
  const qc = useQueryClient()
  const [ids, setIds] = useState<string[]>(pending.map((p) => p.id))
  const [form, setForm] = useState({ date: todayIso(), account: '', reference: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const total = pending.filter((p) => ids.includes(p.id)).reduce((a, p) => a + p.cash + p.checks, 0)
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const d = await api.post<Deposit>('/deposits', { ...form, batch_ids: ids })
      await qc.invalidateQueries()
      onCreated(d.id)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} wide title={tr('Nuevo depósito', 'New deposit')}
      footer={<><Button onClick={onClose}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} disabled={!ids.length} onClick={save}>{tr(`Crear depósito de ${money(total)}`, `Create ${money(total)} deposit`)}</Button></>}>
      <div className="grid gap-5">
        <fieldset>
          <legend className="font-semibold mb-2">{tr('¿Qué conteos llevas al banco?', 'Which counts are you taking to the bank?')}</legend>
          <ul className="grid gap-1.5">
            {pending.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-3 p-3 rounded-xl border border-line hover:bg-raised cursor-pointer">
                  <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={ids.includes(p.id)} onChange={(e) => setIds(e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id))} />
                  <span className="flex-1"><span className="font-medium">{p.name}</span> <span className="text-muted">· {date(p.date)}</span></span>
                  <span className="text-muted text-[0.9rem] hidden sm:inline">{tr('Efectivo', 'Cash')} {money(p.cash)} · {tr('Cheques', 'Checks')} {money(p.checks)}</span>
                  <span className="font-semibold">{money(p.cash + p.checks)}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-muted text-[0.88rem] mt-2">{tr('Solo cuentan el efectivo y los cheques: las tarjetas y transferencias llegan al banco por su cuenta.', 'Only cash and checks count: cards and transfers reach the bank on their own.')}</p>
        </fieldset>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={tr('Fecha del depósito', 'Deposit date')}>{(id) => <input id={id} type="date" className="ctl" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
          <Field label={tr('Cuenta', 'Account')} optional>{(id) => <input id={id} className="ctl" placeholder={tr('Ej. Cheques …1234', 'E.g. Checking …1234')} value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} />}</Field>
          <Field label={tr('Referencia', 'Reference')} optional>{(id) => <input id={id} className="ctl" placeholder={tr('N.º de bolsa o recibo', 'Bag or receipt no.')} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />}</Field>
        </div>
        <Field label={tr('Nota', 'Note')} optional>{(id) => <input id={id} className="ctl" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
        <ErrorNote error={error} />
      </div>
    </Modal>
  )
}

function DepositModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { tr, money, date, lang } = useApp()
  const statusLabel = useStatusLabel()
  const qc = useQueryClient()
  const preview = usePdfPreview()
  const { toast, fail, confirm } = useFeedback()
  const { data: d, error } = useQuery({ queryKey: ['deposit', id], queryFn: () => api.get<DepositDetail>(`/deposits/${id}`) })
  const [bank, setBank] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState<unknown>(null)
  useEffect(() => { if (d) { setBank(d.bank_amount != null ? d.bank_amount.toFixed(2) : d.total.toFixed(2)); setNote(d.reconcile_note || '') } }, [d])

  const patch = async (name: string, body: Record<string, unknown>, message: string) => {
    setBusy(name); setErr(null)
    try { await api.patch(`/deposits/${id}`, body); await qc.invalidateQueries(); toast(message) } catch (e) { setErr(e) } finally { setBusy('') }
  }
  const remove = async () => {
    if (!(await confirm({ title: tr('¿Eliminar este depósito?', 'Delete this deposit?'), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'), body: tr('Los conteos vuelven a la lista de «sin depositar». No se borra ninguna ofrenda.', 'The counts go back to the “not deposited” list. No offering is deleted.') }))) return
    try { await api.del(`/deposits/${id}`); await qc.invalidateQueries(); onClose() } catch (e) { fail(e) }
  }
  const bankValue = parseAmount(bank)
  const difference = d && bankValue >= 0 ? Math.round((bankValue - d.total) * 100) / 100 : 0

  return (
    <Modal open onClose={onClose} wide title={d ? `${tr('Depósito del', 'Deposit of')} ${date(d.date)}` : tr('Depósito', 'Deposit')}>
      {error ? <ErrorNote error={error} /> : !d ? <Spinner /> : (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={tone(d.status)}>{statusLabel(d.status)}</Badge>
            {d.account && <span className="text-ink-soft">{d.account}</span>}
            {d.reference && <span className="text-ink-soft">· {d.reference}</span>}
            <span className="flex-1" />
            <Button icon={<FileText size={18} />} onClick={() => preview({ title: tr('Hoja de depósito', 'Deposit slip'), filename: `${tr('deposito', 'deposit')}-${d.date}.pdf`, load: () => api.get<Blob>(`/deposits/${id}/slip.pdf?lang=${lang}`) })}>{tr('Hoja para el banco', 'Bank slip')}</Button>
          </div>

          <dl className="grid grid-cols-3 gap-4 p-4 rounded-[14px] bg-raised">
            <div><dt className="text-muted">{tr('Efectivo', 'Cash')}</dt><dd className="text-[1.3rem] font-bold">{money(d.cash)}</dd></div>
            <div><dt className="text-muted">{tr(`Cheques (${d.check_count})`, `Checks (${d.check_count})`)}</dt><dd className="text-[1.3rem] font-bold">{money(d.checks)}</dd></div>
            <div><dt className="text-muted">{tr('Total a depositar', 'Total deposit')}</dt><dd className="text-[1.3rem] font-bold text-accent-ink">{money(d.total)}</dd></div>
          </dl>

          <section>
            <h3 className="font-semibold mb-2">{tr('Conteos incluidos', 'Counts included')}</h3>
            <ul className="grid gap-1">
              {d.batches.map((b) => (
                <li key={b.id} className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0">
                  <Link to={`/conteos/${b.id}`} className="hover:underline underline-offset-4">{b.name} <span className="text-muted">· {date(b.date)}</span></Link>
                  <span className="font-semibold">{money(b.cash + b.checks)}</span>
                </li>
              ))}
            </ul>
          </section>

          {d.status === 'pending' && (
            <div className="flex flex-wrap gap-2.5">
              <Button variant="primary" icon={<Landmark size={18} />} busy={busy === 'dep'} onClick={() => patch('dep', { status: 'deposited' }, tr('Marcado como depositado', 'Marked as deposited'))}>{tr('Ya lo llevé al banco', 'I took it to the bank')}</Button>
              <Button variant="ghost" icon={<Trash2 size={18} />} onClick={remove}>{tr('Eliminar depósito', 'Delete deposit')}</Button>
            </div>
          )}

          {d.status !== 'pending' && (
            <section className="grid gap-4 p-4 rounded-[14px] border border-line">
              <h3 className="font-semibold flex items-center gap-2"><Scale size={19} aria-hidden />{tr('Conciliar con el banco', 'Reconcile with the bank')}</h3>
              <p className="text-muted -mt-2">{tr('Busca este depósito en el estado de cuenta y escribe la cantidad que el banco registró.', 'Find this deposit on the bank statement and enter the amount the bank recorded.')}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label={tr('Cantidad según el banco', 'Amount per the bank')}>
                  {(fid) => <input id={fid} className="ctl font-semibold" inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value.replace(/[^\d.,]/g, ''))} disabled={d.status === 'reconciled'} />}
                </Field>
                <div className="self-end pb-3">
                  {bank && (Math.abs(difference) < 0.005
                    ? <p className="flex items-center gap-2 text-good font-semibold"><CircleCheck size={19} />{tr('Coincide exactamente', 'Matches exactly')}</p>
                    : <p className="text-bad font-semibold">{tr(`Diferencia de ${money(difference)}`, `Difference of ${money(difference)}`)}</p>)}
                </div>
              </div>
              {(Math.abs(difference) >= 0.005 || d.reconcile_note) && (
                <Field label={tr('¿Por qué hay diferencia?', 'Why is there a difference?')}>
                  {(fid) => <input id={fid} className="ctl" value={note} onChange={(e) => setNote(e.target.value)} disabled={d.status === 'reconciled'} placeholder={tr('Ej. billete dañado que el banco no aceptó', 'E.g. damaged bill the bank refused')} />}
                </Field>
              )}
              <div className="flex flex-wrap gap-2.5">
                {d.status === 'deposited' ? (<>
                  <Button variant="primary" icon={<CircleCheck size={18} />} busy={busy === 'rec'} onClick={() => patch('rec', { status: 'reconciled', bank_amount: bankValue, reconcile_note: note }, tr('Depósito conciliado', 'Deposit reconciled'))}>{tr('Marcar como conciliado', 'Mark as reconciled')}</Button>
                  <Button variant="ghost" icon={<Undo2 size={18} />} busy={busy === 'undo'} onClick={() => patch('undo', { status: 'pending' }, tr('Vuelve a estar por depositar', 'Back to “to deposit”'))}>{tr('Aún no se depositó', 'Not deposited yet')}</Button>
                </>) : (
                  <Button variant="ghost" icon={<Undo2 size={18} />} busy={busy === 'undo'} onClick={() => patch('undo', { status: 'deposited' }, tr('Conciliación deshecha', 'Reconciliation undone'))}>{tr('Deshacer conciliación', 'Undo reconciliation')}</Button>
                )}
              </div>
            </section>
          )}
          <ErrorNote error={err} />
        </div>
      )}
    </Modal>
  )
}
