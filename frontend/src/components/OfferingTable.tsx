import { Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { seriesColor, useLabels } from '../lib/labels'
import type { Offering } from '../lib/types'
import { Avatar, IconButton, Td, Th, useFeedback } from './ui'
import { useOfferingForm } from './OfferingForm'

/** The list of offerings used on the Offerings, Member and Count screens. */
export function OfferingTable({ rows, hideMember, hideDate }: { rows: Offering[]; hideMember?: boolean; hideDate?: boolean }) {
  const { tr, money, date } = useApp()
  const labels = useLabels()
  const edit = useOfferingForm()
  const qc = useQueryClient()
  const { confirm, toast, fail } = useFeedback()

  const remove = async (o: Offering) => {
    const ok = await confirm({
      title: tr('¿Eliminar esta ofrenda?', 'Delete this offering?'), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'),
      body: tr(`${o.member_name || labels.loose} · ${money(o.amount)} · ${date(o.date)}. Quedará anotado en Actividad.`, `${o.member_name || labels.loose} · ${money(o.amount)} · ${date(o.date)}. It will be noted in Activity.`),
    })
    if (!ok) return
    try { await api.del(`/offerings/${o.id}`); await qc.invalidateQueries(); toast(tr('Ofrenda eliminada', 'Offering deleted')) } catch (e) { fail(e) }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[560px]">
        <thead>
          <tr className="border-b border-line">
            {!hideDate && <Th>{tr('Fecha', 'Date')}</Th>}
            {!hideMember && <Th>{tr('Miembro', 'Member')}</Th>}
            <Th>{tr('Fondo', 'Fund')}</Th>
            <Th>{tr('Método', 'Method')}</Th>
            <Th right>{tr('Monto', 'Amount')}</Th>
            <Th className="w-24 no-print" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-raised/50 transition-colors">
              {!hideDate && <Td className="whitespace-nowrap text-ink-soft">{date(o.date)}</Td>}
              {!hideMember && (
                <Td>
                  {o.member_id ? (
                    <Link to={`/miembros/${o.member_id}`} className="flex items-center gap-3 hover:underline underline-offset-4">
                      <Avatar name={o.member_name} file={o.member_avatar} size={34} /><span className="font-medium whitespace-nowrap">{o.member_name}</span>
                    </Link>
                  ) : <span className="flex items-center gap-3 text-ink-soft whitespace-nowrap"><Avatar name="·" size={34} />{labels.loose}</span>}
                </Td>
              )}
              <Td><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full shrink-0" style={{ background: seriesColor(o.fund_color) }} aria-hidden />{o.fund_name}</span></Td>
              <Td className="text-ink-soft whitespace-nowrap">{labels.method(o.method)}{o.check_number ? ` #${o.check_number}` : ''}</Td>
              <Td right className="font-semibold whitespace-nowrap">{money(o.amount)}</Td>
              <Td right className="no-print whitespace-nowrap !py-1">
                <IconButton label={tr('Editar', 'Edit')} onClick={() => edit({ offering: o })}><Pencil size={18} /></IconButton>
                <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(o)}><Trash2 size={18} /></IconButton>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
