import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CircleCheck, Upload } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import type { Method } from '../lib/types'
import { Badge, Button, Choice, ErrorNote, Field, Modal, cx } from './ui'
import { MemberPicker } from './MemberPicker'

type Source = 'auto' | 'zelle' | 'bank' | 'tithely' | 'square' | 'paypal'
interface Row {
  line: number; date: string; name: string | null; email: string | null; amount: number; fee: number | null; reference: string | null
  memo: string | null; fund: string | null; external_ref: string; member_id: string | null; member_name: string | null
  matched_by: 'email' | 'name' | 'similar' | null; fund_id: string | null; duplicate: boolean
}
interface Preview { source: Exclude<Source, 'auto'> | 'other'; method: Method; rows: Row[]; skipped: { line: number; reason: string }[]; skippedCount: number }

/**
 * Brings in gifts made online (Zelle in the bank statement, Tithe.ly, Square, PayPal…) from the file
 * those services let you download. Every gift is matched to a member and shown for review first;
 * gifts already in Sanctuary are recognised and skipped, so the same file can be uploaded twice safely.
 */
export function OnlineImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { tr, money, date } = useApp()
  const qc = useQueryClient()
  const { data: funds = [] } = useFunds()
  const [source, setSource] = useState<Source>('auto')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [rows, setRows] = useState<(Row & { include: boolean })[]>([])
  const [defaultFund, setDefaultFund] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<{ created: number; duplicates: number } | null>(null)

  const reset = () => { setPreview(null); setRows([]); setDone(null); setError(null) }
  const close = () => { reset(); onClose() }
  const read = async (file: File) => {
    setBusy(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (source !== 'auto') form.append('source', source)
      const p = await api.post<Preview>('/data/import/online/preview', form)
      setPreview(p)
      setRows(p.rows.map((r) => ({ ...r, include: !r.duplicate })))
      setDefaultFund(funds.find((f) => /ofrenda|offering/i.test(f.name))?.id || funds[0]?.id || '')
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const chosen = rows.filter((r) => r.include)
  const commit = async () => {
    if (!preview) return
    setBusy(true); setError(null)
    try {
      const r = await api.post<{ created: number; duplicates: number }>('/data/import/online/commit', {
        source: preview.source,
        rows: chosen.map((x) => ({ date: x.date, member_id: x.member_id, fund_id: x.fund_id || defaultFund, amount: x.amount, method: preview.method, external_ref: x.external_ref, memo: [x.name && !x.member_id ? x.name : null, x.memo].filter(Boolean).join(' · ').slice(0, 300) || null, fee: x.fee })),
      })
      setDone(r)
      await qc.invalidateQueries()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }
  const setRow = (i: number, patch: Partial<Row & { include: boolean }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const sourceName: Record<string, string> = { zelle: 'Zelle', bank: tr('Estado de cuenta del banco', 'Bank statement'), tithely: 'Tithe.ly', square: 'Square', paypal: 'PayPal', other: tr('Otro archivo', 'Other file') }
  const unmatched = chosen.filter((r) => !r.member_id).length

  return (
    <Modal open={open} onClose={close} wide="xl" title={tr('Importar donaciones en línea', 'Import online giving')}
      footer={done ? <Button variant="primary" onClick={close}>{tr('Listo', 'Done')}</Button> : preview ? (<>
        <Button onClick={reset}>{tr('Otro archivo', 'Another file')}</Button>
        <Button variant="primary" busy={busy} disabled={!chosen.length || !defaultFund} onClick={commit}>{tr(`Importar ${chosen.length} donaciones (${money(chosen.reduce((a, r) => a + r.amount, 0))})`, `Import ${chosen.length} gifts (${money(chosen.reduce((a, r) => a + r.amount, 0))})`)}</Button>
      </>) : <Button onClick={close}>{tr('Cancelar', 'Cancel')}</Button>}>
      {done ? (
        <div className="rounded-[14px] bg-good-soft text-good p-5">
          <p className="font-semibold flex items-center gap-2 text-[1.1rem]"><CircleCheck size={22} />{tr(`Se importaron ${done.created} donaciones.`, `${done.created} gifts were imported.`)}</p>
          {done.duplicates > 0 && <p className="mt-1">{tr(`${done.duplicates} ya estaban en Sanctuary y no se repitieron.`, `${done.duplicates} were already in Sanctuary and were not repeated.`)}</p>}
        </div>
      ) : !preview ? (
        <div className="grid gap-5">
          <p className="text-ink-soft">{tr('Descarga el archivo CSV de tu banco o del servicio de ofrendas en línea (busca «Exportar» o «Descargar actividad») y súbelo aquí. Nada se guarda hasta que lo revises.', 'Download the CSV file from your bank or online giving service (look for “Export” or “Download activity”) and upload it here. Nothing is saved until you review it.')}</p>
          <Field label={tr('¿De dónde viene el archivo?', 'Where does the file come from?')}>
            {() => <Choice label={tr('Origen', 'Source')} value={source} onChange={setSource} options={[
              { value: 'auto', label: tr('Detectar solo', 'Detect it') }, { value: 'zelle', label: tr('Zelle (banco)', 'Zelle (bank)') }, { value: 'bank', label: tr('Banco', 'Bank') },
              { value: 'tithely', label: 'Tithe.ly' }, { value: 'square', label: 'Square' }, { value: 'paypal', label: 'PayPal' },
            ]} />}
          </Field>
          <label className={cx('grid place-items-center gap-2 p-8 rounded-[14px] border-2 border-dashed border-line-strong text-center cursor-pointer hover:bg-raised', busy && 'opacity-60 pointer-events-none')}>
            <Upload size={30} className="text-accent-ink" aria-hidden />
            <span className="font-semibold">{busy ? tr('Leyendo…', 'Reading…') : tr('Elegir archivo CSV', 'Choose CSV file')}</span>
            <span className="text-muted text-[0.9rem]">{tr('Del banco solo se toman los depósitos (los pagos y retiros se ignoran).', 'From a bank file only deposits are used (payments and withdrawals are ignored).')}</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) read(f) }} />
          </label>
          <ErrorNote error={error} />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <p className="flex-1 min-w-[16rem]">
              <Badge tone="accent">{sourceName[preview.source]}</Badge>{' '}
              {tr(`${preview.rows.length} donaciones encontradas`, `${preview.rows.length} gifts found`)}
              {preview.skippedCount > 0 && <span className="text-muted"> · {tr(`${preview.skippedCount} filas ignoradas (retiros, reembolsos o pagos fallidos)`, `${preview.skippedCount} rows ignored (withdrawals, refunds or failed payments)`)}</span>}
            </p>
            <Field label={tr('Fondo para las que no indican fondo', 'Fund when none is given')}>
              {(id) => <select id={id} className="ctl !w-auto" value={defaultFund} onChange={(e) => setDefaultFund(e.target.value)}>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
            </Field>
          </div>
          {unmatched > 0 && <p className="rounded-[11px] bg-warn-soft px-4 py-2.5">{tr(`${unmatched} donaciones no se pudieron unir a un miembro. Elígelo en la lista, o déjalas como ofrenda sin nombre (el nombre del archivo queda en la nota).`, `${unmatched} gifts could not be matched to a member. Choose them in the list, or leave them unnamed (the name from the file goes in the note).`)}</p>}
          <div className="overflow-x-auto relative border border-line rounded-[14px]">
            <table className="w-full min-w-[56rem]">
              <thead className="bg-raised"><tr>
                <th className="w-12 px-3 py-2"><span className="sr-only">{tr('Incluir', 'Include')}</span></th>
                <th className="px-3 py-2 text-left text-[0.82rem] uppercase text-muted">{tr('Fecha', 'Date')}</th>
                <th className="px-3 py-2 text-left text-[0.82rem] uppercase text-muted">{tr('En el archivo', 'In the file')}</th>
                <th className="px-3 py-2 text-left text-[0.82rem] uppercase text-muted">{tr('Miembro', 'Member')}</th>
                <th className="px-3 py-2 text-left text-[0.82rem] uppercase text-muted">{tr('Fondo', 'Fund')}</th>
                <th className="px-3 py-2 text-right text-[0.82rem] uppercase text-muted">{tr('Monto', 'Amount')}</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.external_ref} className={cx('border-t border-line align-top', !r.include && 'opacity-55')}>
                    <td className="px-3 py-2.5"><input type="checkbox" className="size-5 mt-2 accent-[var(--accent)]" checked={r.include} onChange={(e) => setRow(i, { include: e.target.checked })} aria-label={tr('Incluir esta donación', 'Include this gift')} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap pt-4">{date(r.date)}</td>
                    <td className="px-3 py-2.5 max-w-[16rem]">
                      <span className="block font-medium truncate">{r.name || r.email || '—'}</span>
                      {r.memo && <span className="block text-muted text-[0.85rem] truncate" title={r.memo}>{r.memo}</span>}
                      {r.duplicate && <Badge tone="warn">{tr('Ya importada', 'Already imported')}</Badge>}
                      {r.matched_by === 'similar' && <Badge tone="warn">{tr('Parecido: revisa', 'Similar: check')}</Badge>}
                    </td>
                    <td className="px-3 py-2 min-w-[15rem]"><MemberPicker value={r.member_id} allowLoose={false} placeholder={tr('Sin nombre', 'No name')} onChange={(v) => setRow(i, { member_id: v, matched_by: null })} /></td>
                    <td className="px-3 py-2">
                      <select className="ctl" aria-label={tr('Fondo', 'Fund')} value={r.fund_id || ''} onChange={(e) => setRow(i, { fund_id: e.target.value || null })}>
                        <option value="">{tr('El de arriba', 'The one above')}</option>
                        {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap pt-4">{money(r.amount)}{r.fee ? <span className="block text-muted text-[0.8rem] font-normal">{tr('comisión', 'fee')} {money(r.fee)}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ErrorNote error={error} />
        </div>
      )}
    </Modal>
  )
}
