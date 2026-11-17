import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, seriesColor, todayIso, useLabels } from '../lib/labels'
import type { Member, Method, Offering } from '../lib/types'
import { Button, Choice, ErrorNote, Field, Modal, useFeedback } from './ui'
import { MemberPicker } from './MemberPicker'

interface Draft { id?: string; member_id: string | null; fund_id: string; batch_id: string | null; amount: string; date: string; method: Method; check_number: string; notes: string }
interface OpenOptions { offering?: Offering; memberId?: string; batchId?: string; date?: string }

const Ctx = createContext<(o?: OpenOptions) => void>(() => {})
/** Opens the "record an offering" window from anywhere in the app. */
export const useOfferingForm = () => useContext(Ctx)

export function OfferingFormProvider({ children }: { children: ReactNode }) {
  const { tr, money } = useApp()
  const labels = useLabels()
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const { data: funds = [] } = useFunds()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const lastFund = useRef<string | null>(null)

  const open = useCallback((o: OpenOptions = {}) => {
    setError(null)
    const f = o.offering
    setDraft({
      id: f?.id, member_id: f?.member_id ?? o.memberId ?? null, fund_id: f?.fund_id ?? lastFund.current ?? '', batch_id: f?.batch_id ?? o.batchId ?? null,
      amount: f ? String(f.amount) : '', date: f?.date ?? o.date ?? todayIso(), method: f?.method ?? 'cash', check_number: f?.check_number ?? '', notes: f?.notes ?? '',
    })
  }, [])

  // Default to the first fund once the list has loaded.
  useEffect(() => {
    if (draft && !draft.fund_id && funds.length) setDraft({ ...draft, fund_id: funds[0].id })
  }, [draft, funds])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const amount = Number(draft?.amount.replace(',', '.'))
  const valid = !!draft && amount > 0 && !!draft.fund_id && !!draft.date

  const save = async (another: boolean) => {
    if (!draft || !valid) return
    setBusy(true); setError(null)
    try {
      const body = { ...draft, amount }
      if (draft.id) await api.patch(`/offerings/${draft.id}`, body)
      else await api.post('/offerings', body)
      lastFund.current = draft.fund_id
      await qc.invalidateQueries()
      toast(draft.id ? tr('Cambios guardados', 'Changes saved') : tr(`Ofrenda de ${money(amount)} registrada`, `Offering of ${money(amount)} recorded`))
      if (another) {
        // Keep date, fund and method: counters usually enter many envelopes from the same service.
        setDraft({ ...draft, id: undefined, member_id: null, amount: '', check_number: '', notes: '' })
        setTimeout(() => document.getElementById('offering-member')?.focus(), 50)
      } else setDraft(null)
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  const createMember = async (name: string) => {
    const [first, ...rest] = name.split(' ')
    try {
      const m = await api.post<Member>('/members', { first_name: first, last_name: rest.join(' ') })
      await qc.invalidateQueries({ queryKey: ['members'] })
      set('member_id', m.id)
      toast(tr(`${name} se agregó a los miembros`, `${name} was added to members`))
    } catch (e) { setError(e) }
  }

  return (
    <Ctx.Provider value={open}>
      {children}
      <Modal
        open={!!draft} onClose={() => setDraft(null)}
        title={draft?.id ? tr('Editar ofrenda', 'Edit offering') : tr('Registrar ofrenda', 'Record an offering')}
        footer={<>
          <Button onClick={() => setDraft(null)}>{tr('Cancelar', 'Cancel')}</Button>
          {!draft?.id && <Button onClick={() => save(true)} disabled={!valid} busy={busy}>{tr('Guardar y registrar otra', 'Save and add another')}</Button>}
          <Button variant="primary" onClick={() => save(false)} disabled={!valid} busy={busy}>{tr('Guardar', 'Save')}</Button>
        </>}
      >
        {draft && (
          <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(!draft.id) }}>
            <Field label={tr('¿Quién da la ofrenda?', 'Who is giving?')} hint={tr('Déjalo vacío para una ofrenda suelta (sin nombre).', 'Leave empty for a loose offering (no name).')}>
              {() => <MemberPicker id="offering-member" value={draft.member_id} onChange={(v) => { set('member_id', v); if (v) amountRef.current?.focus() }} onCreate={createMember} autoFocus={!draft.id && !draft.member_id} />}
            </Field>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label={tr('Monto', 'Amount')}>
                {(id) => (
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-[1.3rem]" aria-hidden>$</span>
                    <input ref={amountRef} id={id} className="ctl !pl-9 !min-h-14 text-[1.5rem] font-semibold" inputMode="decimal" placeholder="0.00" value={draft.amount}
                      onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))} />
                  </div>
                )}
              </Field>
              <Field label={tr('Fecha', 'Date')}>
                {(id) => <input id={id} type="date" className="ctl !min-h-14" value={draft.date} max="2100-12-31" onChange={(e) => set('date', e.target.value)} />}
              </Field>
            </div>
            <Field label={tr('Fondo', 'Fund')}>
              {() => <Choice label={tr('Fondo', 'Fund')} value={draft.fund_id} onChange={(v) => set('fund_id', v)} options={funds.map((f) => ({ value: f.id, label: f.name, dot: seriesColor(f.color_slot) }))} />}
            </Field>
            <Field label={tr('Forma de pago', 'Payment method')}>
              {() => <Choice label={tr('Forma de pago', 'Payment method')} value={draft.method} onChange={(v) => set('method', v)} options={METHODS.map((m) => ({ value: m, label: labels.method(m) }))} />}
            </Field>
            <div className="grid sm:grid-cols-2 gap-5">
              {draft.method === 'check' && (
                <Field label={tr('Número de cheque', 'Check number')} optional>
                  {(id) => <input id={id} className="ctl" inputMode="numeric" value={draft.check_number} onChange={(e) => set('check_number', e.target.value)} />}
                </Field>
              )}
              <Field label={tr('Nota', 'Note')} optional className={draft.method === 'check' ? '' : 'sm:col-span-2'}>
                {(id) => <input id={id} className="ctl" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />}
              </Field>
            </div>
            <ErrorNote error={error} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
