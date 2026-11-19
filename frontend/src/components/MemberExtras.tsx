import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Gift, Home, Link2, Mail, MessageSquareText, Plus, Trash2, Unlink, Users } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { todayIso } from '../lib/labels'
import type { Household, Member } from '../lib/types'
import { Avatar, Badge, Button, Card, Choice, ErrorNote, Field, IconButton, Modal, useFeedback } from './ui'
import { MemberPicker } from './MemberPicker'

interface HouseholdInfo { id: string; name: string; joint_statement: boolean; members: { id: string; full_name: string; avatar_file: string | null }[] }

/** The member's family: who else is in it and whether they get one joint tax statement. */
export function HouseholdCard({ member, household }: { member: Member; household: HouseholdInfo | null }) {
  const { tr } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const [open, setOpen] = useState(false)
  const { data: all = [] } = useQuery({ queryKey: ['households'], queryFn: () => api.get<Household[]>('/households'), enabled: open })
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState(`${tr('Familia', 'The')} ${member.last_name.split(' ')[0]}${tr('', ' family')}`.trim())
  const [joint, setJoint] = useState(true)
  const [others, setOthers] = useState<string[]>([])
  const [existing, setExisting] = useState('')
  const [error, setError] = useState<unknown>(null)

  const save = async () => {
    setError(null)
    try {
      if (mode === 'new') await api.post('/households', { name, joint_statement: joint, member_ids: [member.id, ...others] })
      else {
        const h = all.find((x) => x.id === existing)!
        await api.patch(`/households/${h.id}`, { name: h.name, joint_statement: h.joint_statement, member_ids: [...h.members.map((x) => x.id), member.id] })
      }
      await qc.invalidateQueries(); setOpen(false); toast(tr('Familia guardada', 'Household saved'))
    } catch (e) { setError(e) }
  }
  const leave = async () => {
    if (!household) return
    try {
      await api.patch(`/households/${household.id}`, { name: household.name, joint_statement: household.joint_statement, member_ids: household.members.map((x) => x.id) })
      await qc.invalidateQueries(); toast(tr('Ya no pertenece a esa familia', 'No longer in that household'))
    } catch (e) { fail(e) }
  }
  const toggleJoint = async () => {
    if (!household) return
    try { await api.patch(`/households/${household.id}`, { name: household.name, joint_statement: !household.joint_statement }); await qc.invalidateQueries() } catch (e) { fail(e) }
  }

  return (
    <Card title={<span className="flex items-center gap-2"><Home size={19} className="text-accent-ink" aria-hidden />{tr('Familia', 'Household')}</span>}
      action={!household && <Button size="sm" icon={<Plus size={16} />} onClick={() => { setError(null); setOpen(true) }}>{tr('Agregar a una familia', 'Add to a household')}</Button>}>
      {!household ? (
        <p className="text-muted">{tr('Une a esposos o familiares para darles una sola constancia de impuestos conjunta.', 'Group spouses or relatives to give them one joint tax statement.')}</p>
      ) : (
        <div className="grid gap-3">
          <p className="font-semibold text-[1.05rem]">{household.name}</p>
          <ul className="flex flex-wrap gap-3">
            {household.members.map((x) => (
              <li key={x.id}><Link to={`/miembros/${x.id}`} className="flex items-center gap-2 hover:underline underline-offset-4"><Avatar name={x.full_name} file={x.avatar_file} size={32} />{x.full_name}</Link></li>
            ))}
            {household.members.length === 0 && <li className="text-muted">{tr('Nadie más todavía.', 'No one else yet.')}</li>}
          </ul>
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={household.joint_statement} onChange={toggleJoint} />
            {tr('Una sola constancia de impuestos para toda la familia', 'One tax statement for the whole household')}
          </label>
          <div><Button size="sm" variant="ghost" icon={<Unlink size={16} />} onClick={leave}>{tr('Quitar de esta familia', 'Remove from this household')}</Button></div>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={tr('Agregar a una familia', 'Add to a household')}
        footer={<><Button onClick={() => setOpen(false)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" onClick={save} disabled={mode === 'new' ? !name.trim() : !existing}>{tr('Guardar', 'Save')}</Button></>}>
        <div className="grid gap-5">
          <Choice value={mode} onChange={setMode} options={[{ value: 'new', label: tr('Nueva familia', 'New household') }, { value: 'existing', label: tr('Familia existente', 'Existing household') }]} />
          {mode === 'new' ? (<>
            <Field label={tr('Nombre en la constancia', 'Name on the statement')} hint={tr('Por ejemplo «Juan y María García».', 'For example “John and Mary Garcia”.')}>
              {(id) => <input id={id} className="ctl" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label={tr('Otros miembros de la familia', 'Other household members')} optional>
              {() => (
                <div className="grid gap-2">
                  {others.map((o) => <OtherRow key={o} id={o} onRemove={() => setOthers(others.filter((x) => x !== o))} />)}
                  <MemberPicker value={null} allowLoose={false} placeholder={tr('Buscar y agregar…', 'Find and add…')} onChange={(v) => v && v !== member.id && !others.includes(v) && setOthers([...others, v])} />
                </div>
              )}
            </Field>
            <label className="flex items-center gap-3 cursor-pointer w-fit">
              <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={joint} onChange={(e) => setJoint(e.target.checked)} />
              {tr('Una sola constancia de impuestos conjunta', 'One joint tax statement')}
            </label>
          </>) : (
            <Field label={tr('Familia', 'Household')}>
              {(id) => <select id={id} className="ctl" value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">{tr('Elige…', 'Choose…')}</option>
                {all.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.members.map((x) => x.name.split(' ')[0]).join(', ')})</option>)}
              </select>}
            </Field>
          )}
          <ErrorNote error={error} />
        </div>
      </Modal>
    </Card>
  )
}

function OtherRow({ id, onRemove }: { id: string; onRemove: () => void }) {
  const { tr } = useApp()
  const qc = useQueryClient()
  const m = (qc.getQueryData<Member[]>(['members']) || []).find((x) => x.id === id)
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl border border-line">
      <Avatar name={m?.full_name} file={m?.avatar_file} size={30} /><span className="flex-1">{m?.full_name}</span>
      <IconButton label={tr('Quitar', 'Remove')} onClick={onRemove}><Trash2 size={17} /></IconButton>
    </div>
  )
}

/** A private link the member opens to see their own giving and download their statement. */
export function PersonalLinkCard({ member }: { member: Member }) {
  const { tr, date, session, lang } = useApp()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const { data: link } = useQuery({ queryKey: ['member-link', member.id], queryFn: () => api.get<{ id: string; expires_at: string; last_viewed_at: string | null } | null>(`/links/${member.id}`) })
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const create = async (send: 'none' | 'email' | 'sms') => {
    if (link && !(await confirm({ title: tr('¿Crear un enlace nuevo?', 'Create a new link?'), confirm: tr('Sí, crear uno nuevo', 'Yes, create a new one'), body: tr('El enlace anterior dejará de funcionar.', 'The previous link will stop working.') }))) return
    setBusy(send)
    try {
      const r = await api.post<{ url: string; sent: boolean }>(`/links/${member.id}`, { send, lang })
      setUrl(r.url); await qc.invalidateQueries({ queryKey: ['member-link', member.id] })
      if (send !== 'none') toast(r.sent ? tr('Enlace enviado', 'Link sent') : tr('No se pudo enviar; copia el enlace y compártelo tú.', 'Could not send it; copy the link and share it yourself.'), r.sent ? 'good' : 'bad')
    } catch (e) { fail(e) } finally { setBusy('') }
  }
  const revoke = async () => {
    if (!(await confirm({ title: tr('¿Desactivar el enlace?', 'Turn off the link?'), danger: true, confirm: tr('Desactivar', 'Turn off'), body: tr(`${member.first_name} ya no podrá ver sus ofrendas con ese enlace.`, `${member.first_name} will no longer be able to see their giving with that link.`) }))) return
    try { await api.del(`/links/${member.id}`); setUrl(null); await qc.invalidateQueries({ queryKey: ['member-link', member.id] }); toast(tr('Enlace desactivado', 'Link turned off')) } catch (e) { fail(e) }
  }
  const copy = async () => { if (url) { try { await navigator.clipboard.writeText(url); toast(tr('Enlace copiado', 'Link copied')) } catch { /* the field can be copied by hand */ } } }
  return (
    <Card title={<span className="flex items-center gap-2"><Link2 size={19} className="text-accent-ink" aria-hidden />{tr('Enlace personal', 'Personal link')}</span>}
      hint={tr(`Un enlace privado para que ${member.first_name} vea sus ofrendas y descargue su constancia desde el teléfono, sin cuenta ni contraseña.`, `A private link so ${member.first_name} can see their giving and download their statement from a phone, with no account or password.`)}>
      {url && (
        <div className="flex gap-2 mb-4">
          <input className="ctl" readOnly value={url} aria-label={tr('Enlace', 'Link')} onFocus={(e) => e.target.select()} />
          <Button icon={<Copy size={17} />} onClick={copy}>{tr('Copiar', 'Copy')}</Button>
        </div>
      )}
      {link ? (
        <p className="text-ink-soft mb-4">
          <Badge tone="good">{tr('Activo', 'Active')}</Badge>{' '}
          {tr(`Vence el ${date(link.expires_at.slice(0, 10))}.`, `Expires ${date(link.expires_at.slice(0, 10))}.`)}{' '}
          {link.last_viewed_at ? tr(`Lo abrió por última vez el ${date(link.last_viewed_at.slice(0, 10))}.`, `Last opened ${date(link.last_viewed_at.slice(0, 10))}.`) : tr('Aún no lo ha abierto.', 'Not opened yet.')}
          {!url && <span className="block text-muted text-[0.88rem] mt-1">{tr('Por seguridad, el enlace solo se muestra al crearlo. Crea uno nuevo si hace falta.', 'For safety, the link is only shown when created. Create a new one if needed.')}</span>}
        </p>
      ) : !url && <p className="text-muted mb-4">{tr('No tiene un enlace activo.', 'No active link.')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Link2 size={16} />} busy={busy === 'none'} onClick={() => create('none')}>{link ? tr('Crear enlace nuevo', 'Create a new link') : tr('Crear enlace', 'Create link')}</Button>
        {session!.features.email && member.email && <Button size="sm" icon={<Mail size={16} />} busy={busy === 'email'} onClick={() => create('email')}>{tr('Enviar por correo', 'Send by e-mail')}</Button>}
        {session!.features.sms && member.sms_opt_in && member.phone && <Button size="sm" icon={<MessageSquareText size={16} />} busy={busy === 'sms'} onClick={() => create('sms')}>{tr('Enviar por SMS', 'Send by text')}</Button>}
        {link && <Button size="sm" variant="ghost" icon={<Unlink size={16} />} onClick={revoke}>{tr('Desactivar', 'Turn off')}</Button>}
      </div>
    </Card>
  )
}

interface NonCash { id: string; date: string; description: string; notes: string | null }

/** Gifts of goods (furniture, food, equipment): described on the tax statement, never valued by the church. */
export function NonCashCard({ member }: { member: Member }) {
  const { tr, date } = useApp()
  const qc = useQueryClient()
  const { toast, fail } = useFeedback()
  const { data: gifts = [] } = useQuery({ queryKey: ['noncash', member.id], queryFn: () => api.get<NonCash[]>(`/noncash?member=${member.id}`) })
  const [form, setForm] = useState<{ date: string; description: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const save = async () => {
    setError(null)
    try { await api.post('/noncash', { member_id: member.id, ...form }); await qc.invalidateQueries(); setForm(null); toast(tr('Donación registrada', 'Gift recorded')) } catch (e) { setError(e) }
  }
  const remove = async (g: NonCash) => { try { await api.del(`/noncash/${g.id}`); await qc.invalidateQueries() } catch (e) { fail(e) } }
  return (
    <Card title={<span className="flex items-center gap-2"><Gift size={19} className="text-accent-ink" aria-hidden />{tr('Donaciones en especie', 'Gifts of property')}</span>}
      action={<Button size="sm" icon={<Plus size={16} />} onClick={() => { setError(null); setForm({ date: todayIso(), description: '' }) }}>{tr('Registrar', 'Record')}</Button>}>
      {gifts.length === 0 ? <p className="text-muted">{tr('Muebles, comida, equipo… Aparecen en su constancia con la descripción, sin valor (el valor lo pone quien dona).', 'Furniture, food, equipment… They appear on the statement with the description and no value (the donor sets the value).')}</p> : (
        <ul className="grid gap-1">
          {gifts.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-1.5 border-b border-line last:border-0">
              <span className="flex-1"><span className="block">{g.description}</span><span className="text-muted text-[0.86rem]">{date(g.date)}</span></span>
              <IconButton label={tr('Eliminar', 'Delete')} onClick={() => remove(g)}><Trash2 size={17} /></IconButton>
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={tr('Donación en especie', 'Gift of property')}
        footer={<><Button onClick={() => setForm(null)}>{tr('Cancelar', 'Cancel')}</Button><Button variant="primary" disabled={(form?.description.trim().length || 0) < 2} onClick={save}>{tr('Guardar', 'Save')}</Button></>}>
        {form && (
          <div className="grid gap-5">
            <Field label={tr('¿Qué donó?', 'What was given?')} hint={tr('Describe el artículo y su estado, por ejemplo «Refrigerador usado, en buen estado».', 'Describe the item and its condition, e.g. “Used refrigerator, good condition”.')}>
              {(id) => <textarea id={id} className="ctl !min-h-20" autoFocus value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
            </Field>
            <Field label={tr('Fecha', 'Date')}>{(id) => <input id={id} type="date" className="ctl !w-auto" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}</Field>
            <ErrorNote error={error} />
          </div>
        )}
      </Modal>
    </Card>
  )
}

interface DupPerson { id: string; full_name: string; email: string | null; phone: string | null; envelope_number: string | null; avatar_file: string | null; offering_count: number; total_all: number; created_at: string }
interface Dup { a: DupPerson; b: DupPerson; reasons: ('name' | 'email' | 'phone' | 'envelope')[] }

/** Finds people entered twice and lets the treasurer merge them (gifts move to the one kept) or mark them as different. */
export function DuplicatesBanner() {
  const { tr, money, num } = useApp()
  const qc = useQueryClient()
  const { toast, fail, confirm } = useFeedback()
  const { data: dups = [] } = useQuery({ queryKey: ['duplicates'], queryFn: () => api.get<Dup[]>('/members/duplicates') })
  const [open, setOpen] = useState(false)
  if (!dups.length) return null
  const reason = (r: Dup['reasons'][number]) => ({ name: tr('mismo nombre', 'same name'), email: tr('mismo correo', 'same e-mail'), phone: tr('mismo teléfono', 'same phone'), envelope: tr('mismo sobre', 'same envelope') })[r]
  const merge = async (keep: DupPerson, other: DupPerson) => {
    if (!(await confirm({
      title: tr(`¿Unir a ${other.full_name} con ${keep.full_name}?`, `Merge ${other.full_name} into ${keep.full_name}?`), confirm: tr('Sí, unir', 'Yes, merge'),
      body: tr(`Las ${num(other.offering_count)} ofrendas de ${other.full_name} pasarán a ${keep.full_name}, se completarán los datos que falten y el registro repetido se eliminará.`, `${other.full_name}’s ${num(other.offering_count)} offerings will move to ${keep.full_name}, missing details will be filled in and the repeated record removed.`),
    }))) return
    try { await api.post(`/members/${keep.id}/merge`, { other_id: other.id }); await qc.invalidateQueries(); toast(tr('Registros unidos', 'Records merged')) } catch (e) { fail(e) }
  }
  const different = async (d: Dup) => {
    try { await api.post('/members/duplicates/dismiss', { a: d.a.id, b: d.b.id }); await qc.invalidateQueries({ queryKey: ['duplicates'] }) } catch (e) { fail(e) }
  }
  const person = (p: DupPerson, other: DupPerson) => (
    <div className="flex-1 min-w-[15rem] rounded-xl border border-line p-3 grid gap-2">
      <div className="flex items-center gap-3"><Avatar name={p.full_name} file={p.avatar_file} size={40} /><Link to={`/miembros/${p.id}`} className="font-semibold hover:underline underline-offset-4">{p.full_name}</Link></div>
      <p className="text-muted text-[0.88rem]">{[p.email, p.phone, p.envelope_number && `${tr('Sobre', 'Env.')} ${p.envelope_number}`].filter(Boolean).join(' · ') || tr('Sin datos de contacto', 'No contact details')}</p>
      <p className="text-[0.9rem]">{tr(`${num(p.offering_count)} ofrendas · ${money(p.total_all)}`, `${num(p.offering_count)} gifts · ${money(p.total_all)}`)}</p>
      <Button size="sm" onClick={() => merge(p, other)}>{tr('Quedarse con este', 'Keep this one')}</Button>
    </div>
  )
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-warn bg-warn-soft px-4 py-3 mb-5">
        <Users size={21} className="text-warn shrink-0" aria-hidden />
        <p className="flex-1 min-w-[14rem]">{tr(`Parece que ${dups.length === 1 ? 'hay 1 persona registrada' : `hay ${dups.length} personas registradas`} dos veces.`, `It looks like ${dups.length === 1 ? '1 person is' : `${dups.length} people are`} entered twice.`)}</p>
        <Button size="sm" onClick={() => setOpen(true)}>{tr('Revisar', 'Review')}</Button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} wide title={tr('Posibles duplicados', 'Possible duplicates')}>
        <ul className="grid gap-5">
          {dups.map((d) => (
            <li key={`${d.a.id}-${d.b.id}`} className="grid gap-3 pb-5 border-b border-line last:border-0">
              <p className="text-muted">{tr('Coinciden en', 'They share')}: {d.reasons.map(reason).join(', ')}</p>
              <div className="flex flex-wrap gap-3">{person(d.a, d.b)}{person(d.b, d.a)}</div>
              <div><Button size="sm" variant="ghost" onClick={() => different(d)}>{tr('Son personas distintas', 'They are different people')}</Button></div>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
