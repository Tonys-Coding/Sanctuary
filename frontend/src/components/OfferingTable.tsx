import { Fragment } from 'react'
import { Lock, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { seriesColor, useLabels } from '../lib/labels'
import type { Offering } from '../lib/types'
import { Avatar, IconButton, Td, Th, useFeedback } from './ui'
import { useOfferingForm } from './OfferingForm'

/**
 * The list of offerings used on the Offerings, Member and Count screens.
 * With `groupByDay`, rows are grouped under a heading per day with that day's subtotal;
 * `more` says the list continues beyond what is loaded, so the last day may be incomplete.
 */
export function OfferingTable({ rows, hideMember, hideDate, groupByDay, more }: { rows: Offering[]; hideMember?: boolean; hideDate?: boolean; groupByDay?: boolean; more?: boolean }) {
  const { tr, money, date, num } = useApp()
  const labels = useLabels()
  const edit = useOfferingForm()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()

  // No "are you sure?" box: the offering is deleted at once and can be brought back with "Deshacer".
  const remove = async (o: Offering) => {
    try {
      await api.del(`/offerings/${o.id}`)
      await qc.invalidateQueries()
      toast(tr(`Se eliminó la ofrenda de ${money(o.amount)}`, `Deleted the ${money(o.amount)} offering`), 'good', {
        label: tr('Deshacer', 'Undo'),
        run: async () => {
          try {
            await api.post('/offerings', { member_id: o.member_id, fund_id: o.fund_id, batch_id: o.batch_id, amount: o.amount, date: o.date, method: o.method, check_number: o.check_number, notes: o.notes, goods_value: o.goods_value })
            await qc.invalidateQueries()
            toast(tr('Ofrenda recuperada', 'Offering restored'))
          } catch (e) { fail(e) }
        },
      })
    } catch (e) { fail(e) }
  }

  const cols = 4 + (hideMember ? 0 : 1) + (hideDate || groupByDay ? 0 : 1)
  return (
    <div className="@container overflow-x-auto relative">
      <table className="w-full border-collapse min-w-[440px]">
        <thead>
          <tr className="border-b border-line">
            {!hideDate && !groupByDay && <Th>{tr('Fecha', 'Date')}</Th>}
            {!hideMember && <Th>{tr('Miembro', 'Member')}</Th>}
            <Th>{tr('Fondo', 'Fund')}</Th>
            <Th className="hidden @3xl:table-cell">{tr('Método', 'Method')}</Th>
            <Th right>{tr('Monto', 'Amount')}</Th>
            <Th className="w-24 no-print"><span className="sr-only">{tr('Acciones', 'Actions')}</span></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((o, i) => (<Fragment key={o.id}>
            {groupByDay && (i === 0 || rows[i - 1].date !== o.date) && (() => {
              const day = rows.filter((x) => x.date === o.date)
              const partial = more && rows[rows.length - 1].date === o.date
              return (
                <tr className="bg-bg">
                  <td colSpan={cols} className="px-4 pt-4 pb-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-semibold first-letter:uppercase">{date(o.date, 'long')}</span>
                      <span className="text-ink-soft">
                        {tr(`${num(day.length)} ofrendas`, `${num(day.length)} offerings`)} · <span className="font-semibold text-ink">{money(day.reduce((a, x) => a + x.amount, 0))}</span>
                        {partial && <span className="text-muted"> {tr('(hay más abajo al mostrar más)', '(more below when you show more)')}</span>}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })()}
            <tr className="hover:bg-raised/50 transition-colors">
              {!hideDate && !groupByDay && <Td className="whitespace-nowrap text-ink-soft">{date(o.date)}</Td>}
              {!hideMember && (
                <Td>
                  {o.member_id ? (
                    <Link to={`/miembros/${o.member_id}`} className="flex items-center gap-3 hover:underline underline-offset-4">
                      <Avatar name={o.member_name} file={o.member_avatar} size={34} /><span className="font-medium">{o.member_name}</span>
                    </Link>
                  ) : <span className="flex items-center gap-3 text-ink-soft whitespace-nowrap"><Avatar name="·" size={34} />{labels.loose}</span>}
                </Td>
              )}
              <Td>
                <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full shrink-0" style={{ background: seriesColor(o.fund_color) }} aria-hidden />{o.fund_name}</span>
                <span className="block @3xl:hidden text-ink-soft text-[0.86rem] pl-[18px]">{labels.method(o.method)}{o.check_number ? ` #${o.check_number}` : ''}</span>
              </Td>
              <Td className="hidden @3xl:table-cell text-ink-soft whitespace-nowrap">{labels.method(o.method)}{o.check_number ? ` #${o.check_number}` : ''}</Td>
              <Td right className="font-semibold whitespace-nowrap">{money(o.amount)}</Td>
              <Td right className="no-print whitespace-nowrap !py-1">
                {o.batch_status === 'closed'
                  ? <Link to={`/conteos/${o.batch_id}?reabrir=1`} className="inline-grid place-items-center size-11 rounded-[11px] text-muted hover:bg-raised hover:text-ink transition-colors"
                      title={tr(`Está en un conteo cerrado («${o.batch_name || ''}»). Pulsa para abrir el conteo y reabrirlo.`, `It is in a closed count (“${o.batch_name || ''}”). Click to open the count and reopen it.`)}
                      aria-label={tr(`Conteo cerrado: abrir «${o.batch_name || ''}» para reabrirlo y editar`, `Closed count: open “${o.batch_name || ''}” to reopen and edit`)}>
                      <Lock size={17} aria-hidden />
                    </Link>
                  : <>
                    <IconButton label={tr('Editar', 'Edit')} onClick={() => edit({ offering: o })}><Pencil size={18} /></IconButton>
                    <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(o)}><Trash2 size={18} /></IconButton>
                  </>}
                {o.goods_value > 0 && <span className="sr-only">{tr('Incluye bienes recibidos', 'Includes goods received')}</span>}
              </Td>
            </tr>
          </Fragment>))}
        </tbody>
      </table>
    </div>
  )
}
