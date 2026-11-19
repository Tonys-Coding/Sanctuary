import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, CircleCheck, Landmark, Lock, LockOpen, Plus, Printer, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, parseAmount, useLabels } from '../lib/labels'
import type { Batch, Member, Method, Offering } from '../lib/types'
import { Badge, Button, Card, Choice, Empty, ErrorNote, Field, Modal, Spinner, cx, useFeedback } from '../components/ui'
import { createOffering } from '../lib/offline'
import { MemberPicker } from '../components/MemberPicker'
import { OfferingTable } from '../components/OfferingTable'

const BILLS = ['100', '50', '20', '10', '5', '1']
const COINS = ['0.25', '0.10', '0.05', '0.01']

interface Parsed { member_id: string | null; member_name: string | null; unmatched_name: string | null; fund_id: string; fund_name: string; amount: number; method: Method; check_number: string | null; notes: string | null; unsure?: boolean }

export default function BatchDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { tr, money, date, num, session } = useApp()
  const labels = useLabels()
  const { toast, fail, confirm } = useFeedback()
  const { data: funds = [] } = useFunds()
  const { data: batch, isPending, error } = useQuery({ queryKey: ['batch', id], queryFn: () => api.get<Batch>(`/batches/${id}`) })
  const { data: list } = useQuery({ queryKey: ['offerings', 'batch', id], queryFn: () => api.get<{ rows: Offering[] }>(`/offerings?batchId=${id}&limit=500`) })

  // Quick-entry row
  const [memberId, setMemberId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [fundId, setFundId] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [adding, setAdding] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!fundId && funds.length) setFundId(funds[0].id) }, [funds, fundId])

  // Cash counter
  const [den, setDen] = useState<Record<string, string>>({})
  const [denDirty, setDenDirty] = useState(false)
  useEffect(() => { if (batch && !denDirty) setDen(Object.fromEntries(Object.entries(batch.denominations).map(([k, v]) => [k, String(v)]))) }, [batch, denDirty])

  // AI entry
  const [aiOpen, setAiOpen] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiRows, setAiRows] = useState<(Parsed & { ref: string })[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<unknown>(null)
  const [aiMode, setAiMode] = useState<'text' | 'photo'>('text')
  const [photoKind, setPhotoKind] = useState<'ledger' | 'check'>('ledger')
  const withRefs = (rows: Parsed[]) => rows.map((r) => ({ ...r, ref: `ai:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}` }))
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')

  if (isPending) return <Spinner />
  if (error || !batch) return <Empty title={tr('No encontramos este conteo', 'We could not find this count')} action={<Link to="/conteos"><Button>{tr('Volver a conteos', 'Back to counts')}</Button></Link>} />

  const rows = list?.rows || []
  const closed = batch.status === 'closed'
  const value = parseAmount(amount)
  const group = (key: (o: Offering) => string) => Object.entries(rows.reduce<Record<string, number>>((a, o) => ({ ...a, [key(o)]: (a[key(o)] || 0) + o.amount }), {})).sort((a, b) => b[1] - a[1])
  const counted = Math.round(Object.entries(den).reduce((a, [k, v]) => a + Number(k) * (Number(v) || 0), 0) * 100) / 100
  const hasCount = Object.values(den).some((v) => Number(v) > 0)
  const diff = Math.round((counted - batch.cash_total) * 100) / 100
  const payload = (extra: Partial<Batch> = {}) => ({
    date: batch.date, name: batch.name, attendance: batch.attendance, counted_by: batch.counted_by, notes: batch.notes, status: batch.status,
    denominations: Object.fromEntries(Object.entries(den).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])), ...extra,
  })

  const add = async () => {
    if (!(value > 0) || !fundId) return
    setAdding(true)
    try {
      const r = await createOffering({ member_id: memberId, fund_id: fundId, batch_id: batch.id, amount: value, date: batch.date, method })
      if (r.queued) toast(tr(`Sin conexión: ${money(value)} quedó guardado en esta computadora`, `Offline: ${money(value)} was kept on this computer`))
      await qc.invalidateQueries()
      setMemberId(null); setAmount('')
      setTimeout(() => document.getElementById('quick-member')?.focus(), 40)
    } catch (e) { fail(e) } finally { setAdding(false) }
  }
  const createMember = async (name: string) => {
    const [first, ...rest] = name.split(' ')
    try { const m = await api.post<Member>('/members', { first_name: first, last_name: rest.join(' ') }); await qc.invalidateQueries({ queryKey: ['members'] }); setMemberId(m.id); amountRef.current?.focus() } catch (e) { fail(e) }
  }
  const save = async (extra: Partial<Batch>, message: string) => {
    try { await api.patch(`/batches/${batch.id}`, payload(extra)); setDenDirty(false); await qc.invalidateQueries(); toast(message) } catch (e) { fail(e) }
  }
  const close = async () => {
    if (hasCount && diff !== 0) {
      const ok = await confirm({
        title: tr('El efectivo no cuadra', 'The cash does not balance'), confirm: tr('Cerrar de todos modos', 'Close anyway'),
        body: tr(`Contaste ${money(counted)} pero las ofrendas en efectivo suman ${money(batch.cash_total)}. Hay una diferencia de ${money(Math.abs(diff))}.`, `You counted ${money(counted)} but the cash offerings add up to ${money(batch.cash_total)}. There is a difference of ${money(Math.abs(diff))}.`),
      })
      if (!ok) return
    }
    save({ status: 'closed' }, tr('Conteo cerrado', 'Count closed'))
  }
  const remove = async () => {
    const ok = await confirm({ title: tr('¿Eliminar este conteo?', 'Delete this count?'), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'), body: tr('Las ofrendas que contiene NO se borran; solo dejan de estar agrupadas en este conteo.', 'The offerings in it are NOT deleted; they just stop being grouped under this count.') })
    if (!ok) return
    try { await api.del(`/batches/${batch.id}`); await qc.invalidateQueries(); nav('/conteos') } catch (e) { fail(e) }
  }
  const parse = async () => {
    setAiBusy(true); setAiError(null)
    try { setAiRows(withRefs((await api.post<{ rows: Parsed[] }>('/ai/parse-offerings', { text: aiText, date: batch.date })).rows)) } catch (e) { setAiError(e) } finally { setAiBusy(false) }
  }
  const readPhoto = async (file: File) => {
    setAiBusy(true); setAiError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', photoKind)
      setAiRows(withRefs((await api.post<{ rows: Parsed[] }>('/ai/read-image', form)).rows))
    } catch (e) { setAiError(e) } finally { setAiBusy(false) }
  }
  const reopen = async () => {
    try {
      await api.patch(`/batches/${batch.id}`, payload({ status: 'open', reopen_reason: reason.trim() } as Partial<Batch>))
      setReopening(false); setReason(''); await qc.invalidateQueries(); toast(tr('Conteo reabierto. El motivo quedó en la actividad.', 'Count reopened. The reason is in the activity log.'))
    } catch (e) { fail(e) }
  }
  const deposited = !!batch.deposit_status && batch.deposit_status !== 'pending'
  const addParsed = async () => {
    if (!aiRows) return
    setAiBusy(true)
    try {
      // Rows already saved keep their reference, so pressing the button again never duplicates them.
      for (const r of aiRows.filter((x) => x.amount > 0)) await createOffering({ member_id: r.member_id, fund_id: r.fund_id, batch_id: batch.id, amount: r.amount, date: batch.date, method: r.method, check_number: r.check_number, notes: r.notes || (r.unmatched_name ? r.unmatched_name : null), external_ref: r.ref })
      await qc.invalidateQueries()
      toast(tr(`${aiRows.length} ofrendas agregadas`, `${aiRows.length} offerings added`))
      setAiOpen(false); setAiRows(null); setAiText('')
    } catch (e) { setAiError(e) } finally { setAiBusy(false) }
  }

  const denInput = (k: string) => (
    <label key={k} className="flex items-center gap-2.5">
      <span className="w-14 text-right font-semibold">{Number(k) >= 1 ? `$${k}` : `${Math.round(Number(k) * 100)}¢`}</span>
      <span className="text-muted" aria-hidden>×</span>
      <input className="ctl !min-h-10 !w-20 text-center" inputMode="numeric" disabled={closed} value={den[k] || ''} placeholder="0" aria-label={tr(`Cantidad de ${k}`, `Count of ${k}`)}
        onChange={(e) => { setDen({ ...den, [k]: e.target.value.replace(/\D/g, '') }); setDenDirty(true) }} />
      <span className="text-muted text-[0.9rem] flex-1 text-right">{Number(den[k]) > 0 ? money(Number(k) * Number(den[k])) : ''}</span>
    </label>
  )

  return (
    <div className="grid gap-5">
      <Link to="/conteos" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink w-fit no-print"><ArrowLeft size={18} />{tr('Conteos', 'Counts')}</Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="print-only text-[1.1rem] font-bold mb-1">{session!.org.name}</p>
          <h1 className="font-display text-[1.9rem] leading-tight flex flex-wrap items-center gap-3">
            {batch.name}
            {closed ? <Badge><Lock size={13} />{tr('Cerrado', 'Closed')}</Badge> : <Badge tone="accent">{tr('Abierto', 'Open')}</Badge>}
            {batch.deposit_status && <Link to={`/depositos?d=${batch.deposit_id}`} className="no-print"><Badge tone={batch.deposit_status === 'pending' ? 'warn' : 'good'}><Landmark size={13} />{batch.deposit_status === 'pending' ? tr('En depósito por llevar', 'In a deposit to take') : batch.deposit_status === 'deposited' ? tr('Depositado', 'Deposited') : tr('Conciliado', 'Reconciled')}</Badge></Link>}
          </h1>
          <p className="text-muted mt-1 first-letter:uppercase">
            {date(batch.date, 'long')}{batch.attendance ? ` · ${tr('asistencia', 'attendance')}: ${batch.attendance}` : ''}{batch.counted_by ? ` · ${tr('cuentan', 'counted by')}: ${batch.counted_by}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 no-print">
          <Button icon={<Printer size={18} />} onClick={() => window.print()}>{tr('Imprimir hoja', 'Print sheet')}</Button>
          {closed
            ? <Button icon={<LockOpen size={18} />} disabled={deposited} title={deposited ? tr('Ya se depositó en el banco', 'Already deposited at the bank') : undefined} onClick={() => setReopening(true)}>{tr('Reabrir conteo', 'Reopen count')}</Button>
            : <Button variant="primary" icon={<Lock size={18} />} onClick={close} disabled={rows.length === 0}>{tr('Cerrar conteo', 'Close count')}</Button>}
          {!closed && <Button variant="ghost" icon={<Trash2 size={18} />} onClick={remove}>{tr('Eliminar', 'Delete')}</Button>}
        </div>
      </header>

      {closed && (
        <p className="flex items-start gap-2.5 rounded-[14px] bg-raised px-4 py-3 text-ink-soft no-print">
          <Lock size={19} className="mt-0.5 shrink-0" aria-hidden />
          {deposited
            ? tr('Este conteo está cerrado y su dinero ya se depositó. Ya no se puede cambiar.', 'This count is closed and its money is deposited. It can no longer be changed.')
            : tr(`Este conteo se cerró${batch.closed_at ? ` el ${date(batch.closed_at.slice(0, 10))}` : ''} y está protegido contra cambios. Si hay que corregir algo, usa «Reabrir conteo» y explica el motivo.`, `This count was closed${batch.closed_at ? ` on ${date(batch.closed_at.slice(0, 10))}` : ''} and is protected from changes. To correct something, use “Reopen count” and explain why.`)}
        </p>
      )}

      <Modal open={reopening} onClose={() => setReopening(false)} title={tr('Reabrir conteo', 'Reopen count')}
        footer={<>
          <Button onClick={() => setReopening(false)}>{tr('Cancelar', 'Cancel')}</Button>
          <Button variant="primary" icon={<LockOpen size={18} />} disabled={reason.trim().length < 3} onClick={reopen}>{tr('Reabrir', 'Reopen')}</Button>
        </>}>
        <Field label={tr('¿Por qué hay que reabrirlo?', 'Why does it need to be reopened?')} hint={tr('Por ejemplo: «Faltó anotar un sobre de $20». Queda guardado en la actividad con tu nombre.', 'For example: “A $20 envelope was missing”. It is kept in the activity log with your name.')}>
          {(fid) => <textarea id={fid} className="ctl !min-h-24" autoFocus value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </Modal>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="grid gap-5">
          {!closed && (
            <Card title={tr('Agregar ofrenda', 'Add an offering')} hint={tr('Escribe el nombre o el número de sobre, el monto y presiona Enter.', 'Type the name or envelope number, the amount, and press Enter.')}
              action={session!.features.ai && <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<Camera size={16} />} onClick={() => { setAiMode('photo'); setAiOpen(true); setAiRows(null); setAiError(null) }}>{tr('Leer una foto', 'Read a photo')}</Button>
                <Button size="sm" icon={<Sparkles size={16} />} onClick={() => { setAiMode('text'); setAiOpen(true); setAiRows(null); setAiError(null) }}>{tr('Dictar o pegar notas', 'Dictate or paste notes')}</Button>
              </div>}
              className="no-print">
              <form className="grid gap-3 grid-cols-2 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_auto] [&>*:first-child]:col-span-full" onSubmit={(e) => { e.preventDefault(); add() }}>
                <MemberPicker id="quick-member" value={memberId} onChange={(v) => { setMemberId(v); if (v) amountRef.current?.focus() }} onCreate={createMember} autoFocus />
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden>$</span>
                  <input ref={amountRef} className="ctl !pl-8 font-semibold" inputMode="decimal" placeholder="0.00" aria-label={tr('Monto', 'Amount')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />
                </div>
                <select className="ctl" aria-label={tr('Fondo', 'Fund')} value={fundId} onChange={(e) => setFundId(e.target.value)}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                <select className="ctl" aria-label={tr('Método', 'Method')} value={method} onChange={(e) => setMethod(e.target.value as Method)}>{METHODS.map((m) => <option key={m} value={m}>{labels.method(m)}</option>)}</select>
                <Button type="submit" variant="primary" className="max-md:col-span-full" icon={<Plus size={19} />} busy={adding} disabled={!(value > 0)}>{tr('Agregar', 'Add')}</Button>
              </form>
            </Card>
          )}
          <Card pad={false} title={tr(`Ofrendas de este conteo (${num(rows.length)})`, `Offerings in this count (${num(rows.length)})`)}>
            <div className="mt-4 border-t border-line">
              {!list ? <Spinner /> : rows.length === 0 ? <p className="text-muted p-6">{tr('Todavía no has agregado ninguna.', 'You have not added any yet.')}</p> : <OfferingTable rows={rows} hideDate />}
            </div>
          </Card>
        </div>

        <div className="grid gap-5">
          <Card title={tr('Total del conteo', 'Count total')}>
            <p className="text-[2.1rem] font-bold leading-none tracking-tight">{money(batch.total)}</p>
            <dl className="mt-5 grid gap-1.5">
              <dt className="text-muted text-[0.8rem] font-semibold uppercase tracking-wide">{tr('Por método', 'By method')}</dt>
              {group((o) => o.method).map(([k, v]) => <dd key={k} className="flex justify-between"><span>{labels.method(k)}</span><span className="font-semibold">{money(v)}</span></dd>)}
              <dt className="text-muted text-[0.8rem] font-semibold uppercase tracking-wide mt-3">{tr('Por fondo', 'By fund')}</dt>
              {group((o) => o.fund_name).map(([k, v]) => <dd key={k} className="flex justify-between"><span>{k}</span><span className="font-semibold">{money(v)}</span></dd>)}
            </dl>
          </Card>

          <Card title={tr('Cuadre de efectivo', 'Cash check')} hint={tr('Cuenta los billetes y monedas para confirmar que coinciden con lo anotado.', 'Count the bills and coins to confirm they match what was entered.')}>
            <div className="grid gap-2">{BILLS.map(denInput)}</div>
            <details className="mt-3" open={COINS.some((c) => Number(den[c]) > 0)}>
              <summary className="text-accent-ink font-semibold py-1.5 no-print">{tr('Monedas', 'Coins')}</summary>
              <div className="grid gap-2 mt-2">{COINS.map(denInput)}</div>
            </details>
            <dl className="mt-4 pt-4 border-t border-line grid gap-1.5">
              <div className="flex justify-between"><dt>{tr('Efectivo contado', 'Cash counted')}</dt><dd className="font-semibold">{money(counted)}</dd></div>
              <div className="flex justify-between"><dt>{tr('Efectivo anotado', 'Cash entered')}</dt><dd className="font-semibold">{money(batch.cash_total)}</dd></div>
            </dl>
            {hasCount && (diff === 0
              ? <p className="mt-3 flex items-center gap-2 rounded-[11px] bg-good-soft text-good px-3.5 py-2.5 font-semibold"><CircleCheck size={19} />{tr('Todo cuadra', 'Everything balances')}</p>
              : <p className="mt-3 flex items-start gap-2 rounded-[11px] bg-warn-soft text-warn px-3.5 py-2.5 font-semibold"><TriangleAlert size={19} className="mt-0.5 shrink-0" />{diff > 0 ? tr(`Sobran ${money(diff)}: ¿falta anotar alguna ofrenda?`, `${money(diff)} over: is an offering missing?`) : tr(`Faltan ${money(-diff)}: revisa los montos anotados.`, `${money(-diff)} short: check the amounts entered.`)}</p>)}
            {denDirty && !closed && <Button className="mt-3 w-full no-print" onClick={() => save({}, tr('Cuadre guardado', 'Cash check saved'))}>{tr('Guardar cuadre', 'Save cash check')}</Button>}
          </Card>
        </div>
      </div>

      {/* Only on paper: signature lines for the two counters. */}
      <div className="print-only mt-16">
        <div className="grid grid-cols-2 gap-16">
          {[1, 2].map((n) => <div key={n} className="border-t border-ink pt-2">{tr(`Firma de quien cuenta (${n})`, `Counter signature (${n})`)}</div>)}
        </div>
      </div>

      <Modal open={aiOpen} onClose={() => setAiOpen(false)} wide title={aiMode === 'photo' ? tr('Leer una foto del cuaderno o de cheques', 'Read a photo of the notebook or checks') : tr('Agregar desde tus notas', 'Add from your notes')}
        footer={aiRows ? (<>
          <Button onClick={() => setAiRows(null)}>{aiMode === 'photo' ? tr('Otra foto', 'Another photo') : tr('Volver a escribir', 'Back to notes')}</Button>
          <Button variant="primary" busy={aiBusy} onClick={addParsed} disabled={!aiRows.length || aiRows.some((r) => !(r.amount > 0))}>{tr(`Agregar ${aiRows.length} ofrendas`, `Add ${aiRows.length} offerings`)}</Button>
        </>) : (<>
          <Button onClick={() => setAiOpen(false)}>{tr('Cancelar', 'Cancel')}</Button>
          {aiMode === 'text' && <Button variant="primary" icon={<Sparkles size={18} />} busy={aiBusy} onClick={parse} disabled={aiText.trim().length < 3}>{tr('Interpretar', 'Read notes')}</Button>}
        </>)}>
        {aiRows ? (
          aiRows.length === 0 ? <p className="text-muted">{tr('No encontré ofrendas en ese texto. Intenta escribirlo de otra forma.', 'I found no offerings in that text. Try writing it differently.')}</p> : (
            <div>
              <p className="text-muted mb-3">{tr('Revisa cada fila con el papel en la mano antes de agregar. Puedes corregir los montos aquí mismo.', 'Check each row against the paper before adding. You can fix the amounts right here.')}</p>
              <ul className="divide-y divide-line border-y border-line">
                {aiRows.map((r, i) => (
                  <li key={r.ref} className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5', r.unsure && 'bg-warn-soft/60 -mx-2 px-2 rounded-lg')}>
                    <span className="flex-1 min-w-[160px] font-medium">
                      {r.member_name || labels.loose}
                      {r.unsure && <span className="block text-warn text-[0.85rem] font-semibold">{tr('Difícil de leer: compáralo con la foto.', 'Hard to read: compare it with the photo.')}</span>}
                      {r.unmatched_name && <span className="block text-warn text-[0.85rem] font-normal">{tr(`“${r.unmatched_name}” no está en miembros: se guardará como ofrenda suelta con ese nombre en la nota.`, `“${r.unmatched_name}” is not a member: it will be saved as a loose offering with the name in the note.`)}</span>}
                    </span>
                    <span className="text-ink-soft">{r.fund_name} · {labels.method(r.method)}</span>
                    <input className="ctl !min-h-10 !w-28 text-right font-semibold" inputMode="decimal" aria-label={tr('Monto', 'Amount')} defaultValue={r.amount.toFixed(2)}
                      onChange={(e) => { const v = parseAmount(e.target.value); setAiRows(aiRows.map((x, j) => (j === i ? { ...x, amount: v > 0 ? v : 0 } : x))) }} />
                    <button type="button" className="text-muted hover:text-bad p-2" aria-label={tr('Quitar', 'Remove')} onClick={() => setAiRows(aiRows.filter((_, j) => j !== i))}><Trash2 size={17} /></button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-semibold text-right">{tr('Total', 'Total')}: {money(aiRows.reduce((a, r) => a + r.amount, 0))}</p>
            </div>
          )
        ) : aiMode === 'photo' ? (
          <div className="grid gap-5">
            <Field label={tr('¿Qué hay en la foto?', 'What is in the photo?')}>
              {() => <Choice label={tr('Tipo de foto', 'Photo type')} value={photoKind} onChange={setPhotoKind} options={[{ value: 'ledger', label: tr('Página del cuaderno', 'Notebook page') }, { value: 'check', label: tr('Uno o varios cheques', 'One or more checks') }]} />}
            </Field>
            <label className={cx('grid place-items-center gap-3 p-8 rounded-[14px] border-2 border-dashed border-line-strong text-center cursor-pointer hover:bg-raised transition-colors', aiBusy && 'opacity-60 pointer-events-none')}>
              {aiBusy ? <Spinner label={tr('Leyendo la foto…', 'Reading the photo…')} /> : (<>
                <Camera size={34} className="text-accent-ink" aria-hidden />
                <span className="font-semibold">{tr('Tomar o elegir una foto', 'Take or choose a photo')}</span>
                <span className="text-muted text-[0.9rem]">{tr('Con buena luz, la hoja completa y derecha. Nada se guarda hasta que revises y confirmes.', 'Good light, the whole page, straight. Nothing is saved until you review and confirm.')}</span>
              </>)}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readPhoto(f) }} />
            </label>
          </div>
        ) : (
          <Field label={tr('Escribe o dicta las ofrendas como las dirías en voz alta', 'Type or dictate the offerings the way you would say them')}
            hint={tr('Ejemplo: “María López 50 de diezmo, Juan Pérez 20 de ofrenda con cheque 1042, y 135 de ofrenda suelta”. En el teléfono puedes usar el micrófono del teclado.', 'Example: “María López 50 tithe, Juan Pérez 20 offering by check 1042, and 135 loose offering”. On a phone you can use the keyboard microphone.')}>
            {(fid) => <textarea id={fid} className="ctl !min-h-40" autoFocus value={aiText} onChange={(e) => setAiText(e.target.value)} />}
          </Field>
        )}
        <ErrorNote error={aiError} className="mt-4" />
      </Modal>
    </div>
  )
}
