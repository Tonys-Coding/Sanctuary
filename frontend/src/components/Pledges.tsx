import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { parseAmount } from '../lib/labels'
import type { Goal } from '../lib/types'
import { Avatar, Button, ErrorNote, Field, IconButton, Modal, useFeedback } from './ui'
import { MemberPicker } from './MemberPicker'
import { ProgressBar } from './charts'

interface Pledge { id: string; member_id: string; member_name: string; avatar_file: string | null; amount: number; notes: string | null; given: number }

/** Commitments ("compromisos de fe") toward a goal: who promised what, and how far along each person is. */
export function PledgesModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { tr, money } = useApp()
  const qc = useQueryClient()
  const { fail } = useFeedback()
  const { data: pledges = [] } = useQuery({ queryKey: ['pledges', goal.id], queryFn: () => api.get<Pledge[]>(`/goals/${goal.id}/pledges`) })
  const [memberId, setMemberId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<unknown>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['pledges', goal.id] }), qc.invalidateQueries({ queryKey: ['goals'] })])
  const add = async () => {
    setError(null)
    try { await api.put(`/goals/${goal.id}/pledges`, { member_id: memberId, amount: parseAmount(amount), notes }); setMemberId(null); setAmount(''); setNotes(''); await refresh() } catch (e) { setError(e) }
  }
  const remove = async (p: Pledge) => { try { await api.del(`/goals/${goal.id}/pledges/${p.id}`); await refresh() } catch (e) { fail(e) } }
  const pledged = pledges.reduce((a, p) => a + p.amount, 0)
  const given = pledges.reduce((a, p) => a + Math.min(p.given, p.amount), 0)

  return (
    <Modal open onClose={onClose} wide title={tr(`Compromisos · ${goal.name}`, `Pledges · ${goal.name}`)}>
      <div className="grid gap-5">
        <dl className="grid grid-cols-3 gap-4 p-4 rounded-[14px] bg-raised">
          <div><dt className="text-muted">{tr('Meta', 'Goal')}</dt><dd className="text-[1.25rem] font-bold">{money(goal.target_amount, { whole: true })}</dd></div>
          <div><dt className="text-muted">{tr('Prometido', 'Pledged')}</dt><dd className="text-[1.25rem] font-bold">{money(pledged, { whole: true })}</dd></div>
          <div><dt className="text-muted">{tr('Cumplido', 'Fulfilled')}</dt><dd className="text-[1.25rem] font-bold text-good">{money(given, { whole: true })}</dd></div>
        </dl>
        <form className="grid sm:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1fr)_auto] gap-3 items-end" onSubmit={(e) => { e.preventDefault(); if (memberId && parseAmount(amount) > 0) add() }}>
          <Field label={tr('Persona', 'Person')}>{() => <MemberPicker value={memberId} onChange={setMemberId} allowLoose={false} />}</Field>
          <Field label={tr('Promete dar', 'Promises to give')}>{(id) => <input id={id} className="ctl" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} />}</Field>
          <Field label={tr('Nota', 'Note')} optional>{(id) => <input id={id} className="ctl" placeholder={tr('Ej. $100 al mes', 'E.g. $100 a month')} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <Button type="submit" variant="primary" icon={<Plus size={18} />} disabled={!memberId || !(parseAmount(amount) > 0)}>{tr('Agregar', 'Add')}</Button>
        </form>
        <ErrorNote error={error} />
        {pledges.length === 0 ? <p className="text-muted">{tr('Todavía no hay compromisos. Anota aquí lo que cada persona prometió dar para esta meta.', 'No pledges yet. Record here what each person promised to give toward this goal.')}</p> : (
          <ul className="grid gap-3">
            {pledges.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2 border-b border-line last:border-0">
                <Link to={`/miembros/${p.member_id}`} className="flex items-center gap-3 min-w-[12rem] flex-1 hover:underline underline-offset-4"><Avatar name={p.member_name} file={p.avatar_file} size={36} />{p.member_name}</Link>
                <div className="w-full sm:w-64">
                  <ProgressBar value={p.given} target={p.amount} label={p.member_name} />
                  <p className="text-[0.86rem] text-muted mt-1">{money(p.given)} {tr('de', 'of')} {money(p.amount)}{p.notes ? ` · ${p.notes}` : ''}</p>
                </div>
                <IconButton label={tr('Quitar compromiso', 'Remove pledge')} onClick={() => remove(p)}><Trash2 size={17} /></IconButton>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted text-[0.88rem]">{tr('«Cumplido» cuenta las ofrendas de cada persona al fondo y en las fechas de la meta.', '“Fulfilled” counts each person’s gifts to the goal’s fund within its dates.')}</p>
      </div>
    </Modal>
  )
}
