import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Lock, Plus } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useBatches } from '../lib/data'
import { todayIso } from '../lib/labels'
import type { Batch } from '../lib/types'
import { Badge, Button, Card, Choice, Empty, ErrorNote, Field, Modal, PageHeader, Spinner } from '../components/ui'

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
      <PageHeader title={tr('Conteos', 'Counts')} subtitle={tr('Un conteo reúne todas las ofrendas de un culto. Úsalo al terminar el servicio para anotar los sobres, cuadrar el efectivo e imprimir la hoja firmada.', 'A count gathers all the offerings from one service. Use it after the service to enter the envelopes, balance the cash and print the signed sheet.')}>
        <Button variant="primary" icon={<Plus size={20} />} onClick={start}>{tr('Nuevo conteo', 'New count')}</Button>
      </PageHeader>
      <Card pad={false}>
        {isPending ? <Spinner /> : !batches?.length ? (
          <Empty icon={<ClipboardList size={28} />} title={tr('Aún no hay conteos', 'No counts yet')} action={<Button variant="primary" onClick={start}>{tr('Empezar el primer conteo', 'Start the first count')}</Button>}>
            {tr('Empieza uno después del próximo culto: es la forma más rápida de registrar muchas ofrendas seguidas.', 'Start one after the next service: it is the fastest way to record many offerings in a row.')}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {batches.map((b) => (
              <li key={b.id}>
                <Link to={`/conteos/${b.id}`} className="flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-raised/60 transition-colors">
                  <div className="w-14 text-center shrink-0">
                    <p className="text-[1.5rem] font-bold leading-none">{Number(b.date.slice(8))}</p>
                    <p className="text-muted text-[0.8rem] uppercase mt-1">{date(b.date, 'month').slice(0, 3)} {b.date.slice(2, 4)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{b.name}</p>
                    <p className="text-muted text-[0.88rem] truncate">
                      {tr(`${num(b.offering_count)} ofrendas`, `${num(b.offering_count)} offerings`)}{b.attendance ? ` · ${tr('asistencia', 'attendance')} ${b.attendance}` : ''}{b.counted_by ? ` · ${b.counted_by}` : ''}
                    </p>
                  </div>
                  {b.status === 'closed' ? <Badge><Lock size={13} />{tr('Cerrado', 'Closed')}</Badge> : <Badge tone="accent">{tr('Abierto', 'Open')}</Badge>}
                  <p className="font-bold text-[1.1rem] w-32 text-right">{money(b.total)}</p>
                  <ChevronRight size={20} className="text-muted shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
