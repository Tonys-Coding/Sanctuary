import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useLabels } from '../lib/labels'
import type { Member } from '../lib/types'
import { Button, ErrorNote, Field, Modal, useFeedback } from './ui'

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', address: '', city: '', state: '', postal_code: '', birth_date: '', joined_date: '', status: 'active', church_role: 'member', envelope_number: '', notes: '' }
type Form = typeof EMPTY

export function MemberForm({ open, member, onClose, onSaved }: { open: boolean; member?: Member | null; onClose: () => void; onSaved?: (m: Member) => void }) {
  const { tr } = useApp()
  const labels = useLabels()
  const qc = useQueryClient()
  const { toast } = useFeedback()
  const [f, setF] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setF(member ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (member as any)[k] ?? ''])) as Form) : EMPTY)
  }, [open, member])

  const bind = (k: keyof Form) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value })) })
  const save = async () => {
    setBusy(true); setError(null)
    try {
      const saved = member ? await api.patch<Member>(`/members/${member.id}`, f) : await api.post<Member>('/members', f)
      await qc.invalidateQueries()
      toast(member ? tr('Cambios guardados', 'Changes saved') : tr(`${f.first_name} se agregó a los miembros`, `${f.first_name} was added to members`))
      onSaved?.(saved); onClose()
    } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={member ? tr('Editar miembro', 'Edit member') : tr('Nuevo miembro', 'New member')}
      footer={<>
        <Button onClick={onClose}>{tr('Cancelar', 'Cancel')}</Button>
        <Button variant="primary" onClick={save} busy={busy} disabled={!f.first_name.trim()}>{tr('Guardar', 'Save')}</Button>
      </>}>
      <form className="grid sm:grid-cols-2 gap-x-5 gap-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <Field label={tr('Nombre', 'First name')}>{(id) => <input id={id} className="ctl" autoFocus required {...bind('first_name')} />}</Field>
        <Field label={tr('Apellidos', 'Last name')}>{(id) => <input id={id} className="ctl" {...bind('last_name')} />}</Field>
        <Field label={tr('Estado', 'Status')}>
          {(id) => <select id={id} className="ctl" {...bind('status')}>{['active', 'visitor', 'inactive'].map((s) => <option key={s} value={s}>{labels.status(s)}</option>)}</select>}
        </Field>
        <Field label={tr('Función en la iglesia', 'Role in the church')}>
          {(id) => <select id={id} className="ctl" {...bind('church_role')}>{['member', 'leader', 'pastor', 'visitor'].map((s) => <option key={s} value={s}>{labels.role(s)}</option>)}</select>}
        </Field>
        <Field label={tr('Número de sobre', 'Envelope number')} optional hint={tr('Sirve para encontrarlo rápido al contar.', 'Helps find them quickly when counting.')}>
          {(id) => <input id={id} className="ctl" inputMode="numeric" {...bind('envelope_number')} />}
        </Field>
        <Field label={tr('Teléfono', 'Phone')} optional>{(id) => <input id={id} className="ctl" type="tel" {...bind('phone')} />}</Field>
        <Field label={tr('Correo electrónico', 'E-mail')} optional hint={tr('Para enviarle sus constancias e informes.', 'Used to send statements and reports.')} className="sm:col-span-2">
          {(id) => <input id={id} className="ctl" type="email" {...bind('email')} />}
        </Field>
        <Field label={tr('Dirección', 'Address')} optional hint={tr('Aparece en la constancia para impuestos.', 'Shown on the tax statement.')} className="sm:col-span-2">
          {(id) => <input id={id} className="ctl" {...bind('address')} />}
        </Field>
        <Field label={tr('Ciudad', 'City')} optional>{(id) => <input id={id} className="ctl" {...bind('city')} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={tr('Estado', 'State')} optional>{(id) => <input id={id} className="ctl" {...bind('state')} />}</Field>
          <Field label={tr('Código postal', 'Zip code')} optional>{(id) => <input id={id} className="ctl" {...bind('postal_code')} />}</Field>
        </div>
        <Field label={tr('Fecha de nacimiento', 'Date of birth')} optional>{(id) => <input id={id} className="ctl" type="date" {...bind('birth_date')} />}</Field>
        <Field label={tr('Miembro desde', 'Member since')} optional>{(id) => <input id={id} className="ctl" type="date" {...bind('joined_date')} />}</Field>
        <Field label={tr('Notas', 'Notes')} optional className="sm:col-span-2">{(id) => <textarea id={id} className="ctl" {...bind('notes')} />}</Field>
        <ErrorNote error={error} className="sm:col-span-2" />
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
