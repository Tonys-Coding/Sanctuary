import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { createOffering } from '../lib/offline'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, parseAmount, seriesColor, todayIso, useLabels } from '../lib/labels'
import type { Member, Method, Offering } from '../lib/types'
import { Button, Choice, ErrorNote, Field, Modal, useFeedback } from './ui'
import { MemberPicker } from './MemberPicker'

interface Draft { id?: string; member_id: string | null; fund_id: string; batch_id: string | null; amount: string; date: string; method: Method; check_number: string; notes: string; goods_value: string }
interface OpenOptions { offering?: Offering; memberId?: string; batchId?: string; date?: string }

const Ctx = createContext<(o?: OpenOptions) => void>(() => {})
/** Opens the "record an offering" window from anywhere in the app. */
export const useOfferingForm = () => useContext(Ctx)

export function OfferingFormProvider({ children }: { children: ReactNode }) {
  const { tr, money, date } = useApp()
  const labels = useLabels()
  const qc = useQueryClient()
  const { toast, confirm } = useFeedback()
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
      goods_value: f?.goods_value ? String(f.goods_value) : '',
    })
  }, [])

  // Default to the first fund once the list has loaded.
  useEffect(() => {
    if (draft && !draft.fund_id && funds.length) setDraft({ ...draft, fund_id: funds[0].id })
  }, [draft, funds])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const amount = parseAmount(draft?.amount || '')
  const goods = draft?.goods_value ? parseAmount(draft.goods_value) : 0
  const goodsError = !!draft?.goods_value && (!(goods >= 0) || goods > amount)
  const valid = !!draft && amount > 0 && !!draft.fund_id && !!draft.date && !goodsError

  // The person's most recent gift, shown under the name as a quick sanity check.
  const { data: last } = useQuery({
    queryKey: ['offerings', 'last', draft?.member_id],
    queryFn: () => api.get<{ rows: Offering[] }>(`/offerings?memberId=${draft!.member_id}&limit=1`),
    enabled: !!draft?.member_id && !draft?.id,
  })
  const lastGift = draft?.member_id && !draft.id ? last?.rows[0] : undefined
  const future = !!draft && draft.date > todayIso()

  const save = async (another: boolean) => {
    if (!draft || !valid) return
    setBusy(true); setError(null)
    try {
      // Same person, same day, same amount: very often the same envelope typed twice.
      if (!draft.id && draft.member_id && navigator.onLine) {
        const same = await api.get<{ rows: Offering[] }>(`/offerings?memberId=${draft.member_id}&from=${draft.date}&to=${draft.date}&limit=50`).catch(() => ({ rows: [] as Offering[] }))
        const dup = same.rows.find((o) => Math.abs(o.amount - amount) < 0.005)
        if (dup && !(await confirm({
          title: tr('¿Registrar otra ofrenda igual?', 'Record another identical offering?'),
          body: tr(`Ya hay una ofrenda de ${dup.member_name} por ${money(dup.amount)} (${dup.fund_name}) en esta fecha. Si es un sobre distinto, puedes guardarla; si no, cancela.`,
            `There is already a ${money(dup.amount)} offering from ${dup.member_name} (${dup.fund_name}) on this date. If it is a different envelope you can save it; otherwise cancel.`),
          confirm: tr('Sí, es otra ofrenda', 'Yes, it is another one'),
        }))) return
      }
      const body = { ...draft, amount, goods_value: goods > 0 ? goods : 0 }
      let queued = false
      if (draft.id) await api.patch(`/offerings/${draft.id}`, body)
      else queued = (await createOffering(body)).queued
      lastFund.current = draft.fund_id
      await qc.invalidateQueries()
      toast(queued
        ? tr(`Sin conexión: la ofrenda de ${money(amount)} quedó guardada en esta computadora y se enviará después`, `Offline: the ${money(amount)} offering was kept on this computer and will be sent later`)
        : draft.id ? tr('Cambios guardados', 'Changes saved') : tr(`Ofrenda de ${money(amount)} registrada`, `Offering of ${money(amount)} recorded`))
      if (another) {
        // Keep date, fund and method: counters usually enter many envelopes from the same service.
        setDraft({ ...draft, id: undefined, member_id: null, amount: '', check_number: '', notes: '', goods_value: '' })
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
            <Field label={tr('¿Quién da la ofrenda?', 'Who is giving?')} hint={lastGift
              ? tr(`Su última ofrenda: ${money(lastGift.amount)} · ${lastGift.fund_name} · ${date(lastGift.date)}`, `Their last gift: ${money(lastGift.amount)} · ${lastGift.fund_name} · ${date(lastGift.date)}`)
              : tr('Déjalo vacío para una ofrenda suelta (sin nombre).', 'Leave empty for a loose offering (no name).')}>
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
              <Field label={tr('Fecha', 'Date')} error={future ? tr('Esta fecha todavía no llega. ¿Es correcta?', 'This date has not happened yet. Is it right?') : undefined}>
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
            <details className="rounded-[11px] border border-line px-4 py-2" open={!!draft.goods_value}>
              <summary className="font-semibold text-ink-soft py-1.5 cursor-pointer">{tr('¿Recibió algo a cambio? (cena, boleto, artículo…)', 'Did they receive something in return? (dinner, ticket, item…)')}</summary>
              <div className="pt-3 pb-2">
                <Field label={tr('Valor de lo que recibió', 'Value of what they received')} optional
                  hint={tr('Solo la diferencia es deducible de impuestos. Si la ofrenda pasa de $75, la constancia incluirá el aviso que exige la ley.', 'Only the difference is tax-deductible. If the gift is over $75, the statement will include the notice the law requires.')}
                  error={goodsError ? tr('No puede ser mayor que la ofrenda.', 'It cannot be more than the gift.') : undefined}>
                  {(id) => <input id={id} className="ctl !w-48" inputMode="decimal" placeholder="0.00" value={draft.goods_value} onChange={(e) => set('goods_value', e.target.value.replace(/[^\d.,]/g, ''))} />}
                </Field>
                {goods > 0 && amount > 0 && !goodsError && <p className="text-muted text-[0.9rem] mt-2">{tr(`Deducible: ${money(amount - goods)}`, `Deductible: ${money(amount - goods)}`)}</p>}
              </div>
            </details>
            <ErrorNote error={error} />
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </Ctx.Provider>
  )
}
