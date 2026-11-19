import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HandHeart, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { PledgesModal } from '../components/Pledges'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds, useGoals } from '../lib/data'
import { parseAmount, seriesColor, todayIso } from '../lib/labels'
import type { Goal } from '../lib/types'
import { Badge, Button, Card, Empty, ErrorNote, Field, IconButton, Modal, PageHeader, Spinner, useFeedback } from '../components/ui'
import { ProgressBar } from '../components/charts'

const blank = () => ({ id: '', name: '', description: '', fund_id: '', target_amount: '', start_date: todayIso(), end_date: `${new Date().getFullYear()}-12-31` })

export default function Goals() {
  const { tr, money, date, num } = useApp()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const { data: goals, isPending } = useGoals()
  const { data: funds = [] } = useFunds()
  const [f, setF] = useState<ReturnType<typeof blank> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pledging, setPledging] = useState<Goal | null>(null)
  const today = todayIso()

  const edit = (g?: Goal) => { setError(null); setF(g ? { id: g.id, name: g.name, description: g.description || '', fund_id: g.fund_id || '', target_amount: String(g.target_amount), start_date: g.start_date, end_date: g.end_date } : blank()) }
  const save = async () => {
    if (!f) return
    setBusy(true); setError(null)
    try {
      const body = { ...f, target_amount: parseAmount(f.target_amount) }
      if (f.id) await api.patch(`/goals/${f.id}`, body); else await api.post('/goals', body)
      await qc.invalidateQueries(); toast(tr('Meta guardada', 'Goal saved')); setF(null)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const remove = async (g: Goal) => {
    if (!(await confirm({ title: tr(`¿Eliminar la meta “${g.name}”?`, `Delete the goal “${g.name}”?`), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'), body: tr('Las ofrendas no se borran; solo se elimina la meta.', 'No offerings are deleted; only the goal is removed.') }))) return
    try { await api.del(`/goals/${g.id}`); await qc.invalidateQueries() } catch (e) { fail(e) }
  }

  return (
    <>
      <PageHeader title={tr('Metas', 'Goals')} subtitle={tr('Proyectos y campañas de la iglesia. El avance se calcula solo con las ofrendas del fondo y las fechas que elijas.', 'Church projects and campaigns. Progress is worked out automatically from offerings in the fund and dates you choose.')}>
        <Button variant="primary" icon={<Plus size={20} />} onClick={() => edit()}>{tr('Nueva meta', 'New goal')}</Button>
      </PageHeader>

      {isPending ? <Spinner /> : !goals?.length ? (
        <Card><Empty icon={<Target size={28} />} title={tr('Aún no hay metas', 'No goals yet')} action={<Button variant="primary" onClick={() => edit()}>{tr('Crear la primera meta', 'Create the first goal')}</Button>}>
          {tr('Por ejemplo: “Techo nuevo del templo”, con el fondo de Construcción y una fecha límite.', 'For example: “New roof for the church”, tied to the Building fund with a deadline.')}
        </Empty></Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-5">
          {goals.map((g) => {
            const pct = Math.round((g.raised / g.target_amount) * 100)
            const days = Math.ceil((new Date(g.end_date).getTime() - new Date(today).getTime()) / 864e5)
            const left = Math.max(g.target_amount - g.raised, 0)
            return (
              <Card key={g.id}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-[1.15rem] leading-snug">{g.name}</h2>
                    <p className="text-muted text-[0.9rem] mt-0.5 flex flex-wrap items-center gap-x-2">
                      {g.fund_name ? <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: seriesColor(g.fund_color) }} />{g.fund_name}</span> : tr('Todos los fondos', 'All funds')}
                      <span>· {date(g.start_date)} – {date(g.end_date)}</span>
                    </p>
                  </div>
                  <IconButton label={tr('Editar', 'Edit')} onClick={() => edit(g)}><Pencil size={18} /></IconButton>
                  <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(g)}><Trash2 size={18} /></IconButton>
                </div>
                {g.description && <p className="text-ink-soft mt-3">{g.description}</p>}
                <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[1.8rem] font-bold leading-none">{money(g.raised, { whole: true })}</span>
                  <span className="text-muted">{tr('de', 'of')} {money(g.target_amount, { whole: true })}</span>
                  <span className="ml-auto">{pct >= 100 ? <Badge tone="good">{tr('¡Meta lograda!', 'Goal reached!')}</Badge> : <span className="font-semibold">{pct}%</span>}</span>
                </p>
                <div className="mt-3"><ProgressBar value={g.raised} target={g.target_amount} label={g.name} /></div>
                <p className="text-muted text-[0.9rem] mt-3">
                  {g.pledge_count > 0 && <>{tr(`${num(g.pledge_count)} compromisos por ${money(g.pledged, { whole: true })}`, `${num(g.pledge_count)} pledges for ${money(g.pledged, { whole: true })}`)} · </>}
                  {tr(`${num(g.givers)} personas han aportado`, `${num(g.givers)} people have contributed`)}
                  {pct < 100 && (days >= 0
                    ? tr(` · faltan ${money(left, { whole: true })} y ${days} días`, ` · ${money(left, { whole: true })} and ${days} days to go`)
                    : tr(` · terminó faltando ${money(left, { whole: true })}`, ` · ended ${money(left, { whole: true })} short`))}
                </p>
                <div className="mt-4"><Button size="sm" icon={<HandHeart size={16} />} onClick={() => setPledging(g)}>{tr('Compromisos', 'Pledges')}</Button></div>
              </Card>
            )
          })}
        </div>
      )}

      {pledging && <PledgesModal goal={goals?.find((x) => x.id === pledging.id) || pledging} onClose={() => setPledging(null)} />}
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? tr('Editar meta', 'Edit goal') : tr('Nueva meta', 'New goal')}
        footer={<><Button onClick={() => setF(null)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" busy={busy} onClick={save} disabled={!f?.name.trim() || !(parseAmount(f?.target_amount || '') > 0)}>{tr('Guardar', 'Save')}</Button></>}>
        {f && (
          <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
            <Field label={tr('Nombre de la meta', 'Goal name')}>{(id) => <input id={id} className="ctl" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label={tr('¿Cuánto quieren reunir?', 'How much do you want to raise?')}>
                {(id) => <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">$</span><input id={id} className="ctl !pl-8" inputMode="decimal" value={f.target_amount} onChange={(e) => setF({ ...f, target_amount: e.target.value.replace(/[^\d.,]/g, '') })} /></div>}
              </Field>
              <Field label={tr('Fondo que cuenta', 'Fund that counts')}>
                {(id) => <select id={id} className="ctl" value={f.fund_id} onChange={(e) => setF({ ...f, fund_id: e.target.value })}><option value="">{tr('Todos los fondos', 'All funds')}</option>{funds.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
              </Field>
              <Field label={tr('Empieza', 'Starts')}>{(id) => <input id={id} type="date" className="ctl" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />}</Field>
              <Field label={tr('Termina', 'Ends')}>{(id) => <input id={id} type="date" className="ctl" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />}</Field>
            </div>
            <Field label={tr('Descripción', 'Description')} optional>{(id) => <textarea id={id} className="ctl" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />}</Field>
            <ErrorNote error={error} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  )
}
