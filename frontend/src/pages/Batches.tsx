import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Landmark, Lock, LockOpen, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useBatches } from '../lib/data'
import { todayIso } from '../lib/labels'
import type { Batch } from '../lib/types'
import { Badge, Button, Card, Choice, Empty, ErrorNote, Field, Modal, PageHeader, Spinner } from '../components/ui'
import { ViewTabs } from '../components/ViewTabs'

export default function Batches() {
  const { tr, money, date, num, session } = useApp()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: batches, isPending } = useBatches()
  const [open, setOpen] = useState(false)
  const presets = [tr('Culto dominical', 'Sunday service'), tr('Culto de oración', 'Prayer service'), tr('Culto de jóvenes', 'Youth service'), tr('Evento especial', 'Special event')]
  const [f, setF] = useState({ date: todayIso(), name: presets[0], attendance: '', counted_by: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const start = () => { setF({ date: todayIso(), name: presets[0], attendance: '', counted_by: session!.user.full_name }); setError(null); setOpen(true) }
  const [params, setParams] = useSearchParams()
  const openOnes = (batches || []).filter((b) => b.status === 'open')
  const closedOnes = (batches || []).filter((b) => b.status === 'closed')
  const waiting = closedOnes.filter((b) => !b.deposit_id).length
  const view = (params.get('vista') === 'cerrados' || params.get('vista') === 'abiertos' ? params.get('vista') : openOnes.length ? 'abiertos' : 'cerrados') as 'abiertos' | 'cerrados'
  const setView = (v: typeof view) => setParams({ vista: v }, { replace: true })
  const shown = view === 'abiertos' ? openOnes : closedOnes
  useEffect(() => {
    if (params.get('nuevo')) { start(); setParams({}, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const create = async () => {
    setBusy(true); setError(null)
    try { const b = await api.post<Batch>('/batches', f); await qc.invalidateQueries({ queryKey: ['batches'] }); nav(`/conteos/${b.id}`) } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={tr('Conteos', 'Counts')} subtitle={tr('Un conteo reúne todas las ofrendas de un culto.', 'A count gathers all the offerings from one service.')}>
        <Button variant="primary" icon={<Plus size={20} />} onClick={start}>{tr('Nuevo conteo', 'New count')}</Button>
      </PageHeader>

      <div className="grid gap-6 [&>*]:min-w-0">
        <ol aria-label={tr('Cómo funciona', 'How it works')} className="grid sm:grid-cols-3 gap-3">
          {[
            [tr('Anotar los sobres', 'Enter the envelopes'), tr('Nombre o número de sobre, monto y Enter.', 'Name or envelope number, amount and Enter.')],
            [tr('Contar el efectivo', 'Count the cash'), tr('Billetes y monedas: Sanctuary dice si cuadra.', 'Bills and coins: Sanctuary says if it balances.')],
            [tr('Cerrar y llevar al banco', 'Close and take to the bank'), tr('Imprime la hoja, ciérralo y prepara el depósito.', 'Print the sheet, close it and prepare the deposit.')],
          ].map(([t, d], i) => (
            <li key={t} className="card p-4 flex gap-3.5 items-start">
              <span className="size-9 rounded-full bg-ink text-bg grid place-items-center font-bold shrink-0" aria-hidden>{i + 1}</span>
              <span><span className="block font-semibold leading-snug">{t}</span><span className="block text-ink-soft text-[0.93rem]">{d}</span></span>
            </li>
          ))}
        </ol>

        {waiting > 0 && (
          <Link to="/depositos" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-accent transition-colors no-print">
            <Landmark size={21} className="text-accent-ink shrink-0" aria-hidden />
            <span className="flex-1 min-w-[14rem] font-semibold">{waiting === 1 ? tr('1 conteo cerrado espera ir al banco', '1 closed count is waiting to go to the bank') : tr(`${waiting} conteos cerrados esperan ir al banco`, `${waiting} closed counts are waiting to go to the bank`)}</span>
            <span className="text-accent-ink font-semibold inline-flex items-center gap-1">{tr('Preparar depósito', 'Prepare deposit')}<ChevronRight size={18} aria-hidden /></span>
          </Link>
        )}

        {isPending ? <Spinner /> : !batches?.length ? (
          <Card>
            <Empty icon={<ClipboardList size={28} />} title={tr('Aún no hay conteos', 'No counts yet')} action={<Button variant="primary" onClick={start}>{tr('Empezar el primer conteo', 'Start the first count')}</Button>}>
              {tr('Empieza uno después del próximo culto: es la forma más rápida de registrar muchas ofrendas seguidas.', 'Start one after the next service: it is the fastest way to record many offerings in a row.')}
            </Empty>
          </Card>
        ) : (<>
          <ViewTabs value={view} onChange={setView} label={tr('Conteos', 'Counts')} options={[
            { value: 'abiertos', label: tr(`Por terminar (${openOnes.length})`, `To finish (${openOnes.length})`), icon: <LockOpen size={20} /> },
            { value: 'cerrados', label: tr(`Cerrados (${closedOnes.length})`, `Closed (${closedOnes.length})`), icon: <Lock size={20} /> },
          ]} />
          <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`}>
            <Card pad={false}>
              {shown.length === 0 ? (
                <p className="text-ink-soft p-6">{view === 'abiertos' ? tr('No hay conteos abiertos. ¡Todo está cerrado!', 'No open counts. Everything is closed!') : tr('Todavía no hay conteos cerrados.', 'No closed counts yet.')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {shown.map((b) => (
                    <li key={b.id}>
                      <Link to={`/conteos/${b.id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-5 sm:px-6 py-4 hover:bg-raised/60 transition-colors">
                        <div className="w-14 text-center shrink-0">
                          <p className="text-[1.5rem] font-bold leading-none">{Number(b.date.slice(8))}</p>
                          <p className="text-muted text-[0.8rem] uppercase mt-1">{date(b.date, 'month').slice(0, 3)} {b.date.slice(2, 4)}</p>
                        </div>
                        <div className="flex-1 min-w-[12rem]">
                          <p className="font-semibold truncate">{b.name}</p>
                          <p className="text-ink-soft text-[0.92rem] truncate">
                            {tr(`${num(b.offering_count)} ofrendas`, `${num(b.offering_count)} offerings`)}{b.attendance ? ` · ${tr('asistencia', 'attendance')} ${b.attendance}` : ''}{b.counted_by ? ` · ${b.counted_by}` : ''}
                          </p>
                        </div>
                        {b.status === 'closed'
                          ? b.deposit_status === 'reconciled' ? <Badge tone="good">{tr('Conciliado', 'Reconciled')}</Badge>
                            : b.deposit_status === 'deposited' ? <Badge tone="good">{tr('Depositado', 'Deposited')}</Badge>
                              : b.deposit_status === 'pending' ? <Badge tone="warn">{tr('En depósito por llevar', 'In a deposit to take')}</Badge>
                                : <Badge tone="warn">{tr('Por depositar', 'To deposit')}</Badge>
                          : <Badge tone="accent">{tr('Abierto', 'Open')}</Badge>}
                        <p className="font-bold text-[1.1rem] sm:w-32 text-right ml-auto">{money(b.total, { whole: true })}</p>
                        <ChevronRight size={20} className="text-muted shrink-0 hidden sm:block" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>)}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={tr('Nuevo conteo', 'New count')}
        footer={<><Button onClick={() => setOpen(false)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} onClick={create} disabled={!f.name.trim()}>{tr('Empezar a contar', 'Start counting')}</Button></>}>
        <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); create() }}>
          <Field label={tr('¿Qué culto fue?', 'Which service was it?')}>
            {(id) => (<div className="grid gap-3">
              <Choice value={f.name} onChange={(v) => setF({ ...f, name: v })} options={presets.map((p) => ({ value: p, label: p }))} />
              <input id={id} className="ctl" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>)}
          </Field>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label={tr('Fecha', 'Date')}>{(id) => <input id={id} type="date" className="ctl" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />}</Field>
            <Field label={tr('Asistencia', 'Attendance')} optional>{(id) => <input id={id} className="ctl" inputMode="numeric" value={f.attendance} onChange={(e) => setF({ ...f, attendance: e.target.value.replace(/\D/g, '') })} />}</Field>
          </div>
          <Field label={tr('¿Quiénes cuentan?', 'Who is counting?')} hint={tr('Lo recomendable es que siempre cuenten dos personas.', 'It is best practice for two people to count together.')}>
            {(id) => <input id={id} className="ctl" value={f.counted_by} onChange={(e) => setF({ ...f, counted_by: e.target.value })} />}
          </Field>
          <ErrorNote error={error} />
          <button type="submit" hidden />
        </form>
      </Modal>
    </>
  )
}
