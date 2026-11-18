import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Cake, FileText, Hash, Mail, MapPin, Send, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { api, download } from '../lib/api'
import { useApp } from '../lib/app'
import { useLabels } from '../lib/labels'
import type { Member, Offering } from '../lib/types'
import { AvatarPicker, Badge, Button, Card, Delta, Empty, Spinner, useFeedback } from '../components/ui'
import { Breakdown, Columns } from '../components/charts'
import { OfferingTable } from '../components/OfferingTable'
import { useOfferingForm } from '../components/OfferingForm'
import { MemberForm } from '../components/MemberForm'
import { EmailComposer } from '../components/EmailComposer'

interface Detail {
  member: Member
  stats: { total_all: number; count: number; average: number; total_year: number; total_last_year: number; first_date: string | null; last_date: string | null; largest: number }
  monthly: { month: string; total: number }[]
  byFund: { id: string; name: string; color_slot: number; total: number }[]
  yearly: { year: number; total: number }[]
}

export default function MemberDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { tr, money, date, num } = useApp()
  const labels = useLabels()
  const { confirm, toast, fail } = useFeedback()
  const openOffering = useOfferingForm()
  const [editing, setEditing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const { data, isPending, error } = useQuery({ queryKey: ['member', id], queryFn: () => api.get<Detail>(`/members/${id}`) })
  const { data: offerings } = useQuery({ queryKey: ['offerings', 'member', id], queryFn: () => api.get<{ rows: Offering[]; count: number }>(`/offerings?memberId=${id}&limit=100`) })

  if (isPending) return <Spinner />
  if (error || !data) return <Empty title={tr('No encontramos a este miembro', 'We could not find this member')} action={<Link to="/miembros"><Button>{tr('Volver a miembros', 'Back to members')}</Button></Link>} />
  const { member: m, stats: s } = data
  const year = new Date().getFullYear()

  const pick = async (file: File) => {
    setUploading(true)
    try { await api.upload(`/members/${m.id}/avatar`, file); await qc.invalidateQueries(); toast(tr('Foto actualizada', 'Photo updated')) } catch (e) { fail(e) } finally { setUploading(false) }
  }
  const remove = async () => {
    const ok = await confirm({
      title: tr(`¿Eliminar a ${m.full_name}?`, `Delete ${m.full_name}?`), danger: true, confirm: tr('Sí, eliminar', 'Yes, delete'),
      body: s.count > 0
        ? tr('Sus ofrendas ya registradas se conservan en los totales e informes, pero dejará de aparecer en el directorio.', 'Their recorded offerings stay in totals and reports, but they will no longer appear in the directory.')
        : tr('Esta persona no tiene ofrendas registradas. Se eliminará por completo.', 'This person has no recorded offerings. They will be removed completely.'),
    })
    if (!ok) return
    try { await api.del(`/members/${m.id}`); await qc.invalidateQueries(); toast(tr('Miembro eliminado', 'Member deleted')); nav('/miembros') } catch (e) { fail(e) }
  }
  const statement = () => download('/reports/pdf', `${m.full_name} ${year}.pdf`, { type: 'member', memberId: m.id, from: `${year}-01-01`, to: `${year}-12-31` }).catch(fail)
  const change = s.total_last_year > 0 ? Math.round(((s.total_year - s.total_last_year) / s.total_last_year) * 1000) / 10 : null
  const contact = [
    m.phone && { icon: <Phone size={17} />, text: m.phone },
    m.email && { icon: <Mail size={17} />, text: m.email },
    (m.address || m.city) && { icon: <MapPin size={17} />, text: [m.address, m.city, m.state, m.postal_code].filter(Boolean).join(', ') },
    m.envelope_number && { icon: <Hash size={17} />, text: `${tr('Sobre', 'Envelope')} ${m.envelope_number}` },
    m.birth_date && { icon: <Cake size={17} />, text: date(m.birth_date) },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[]

  return (
    <div className="grid gap-5">
      <Link to="/miembros" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink w-fit no-print"><ArrowLeft size={18} />{tr('Miembros', 'Members')}</Link>

      <section className="card p-5 sm:p-7 flex flex-wrap gap-6 items-start">
        <AvatarPicker name={m.full_name} file={m.avatar_file} onPick={pick} busy={uploading} />
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-[1.9rem] leading-tight">{m.full_name}</h1>
          <p className="flex flex-wrap gap-2 mt-2">
            <Badge tone={m.status === 'active' ? 'good' : m.status === 'visitor' ? 'accent' : 'neutral'}>{labels.status(m.status)}</Badge>
            <Badge>{labels.role(m.church_role)}</Badge>
            {m.joined_date && <Badge>{tr('Desde', 'Since')} {date(m.joined_date)}</Badge>}
          </p>
          {contact.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-ink-soft">
              {contact.map((c, i) => <li key={i} className="flex items-center gap-2"><span className="text-muted" aria-hidden>{c.icon}</span>{c.text}</li>)}
            </ul>
          )}
          {m.notes && <p className="mt-4 text-ink-soft max-w-[65ch] whitespace-pre-line">{m.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2.5 no-print">
          <Button variant="primary" icon={<Plus size={19} />} onClick={() => openOffering({ memberId: m.id })}>{tr('Registrar ofrenda', 'Record offering')}</Button>
          <Button icon={<Pencil size={18} />} onClick={() => setEditing(true)}>{tr('Editar', 'Edit')}</Button>
          <Button icon={<FileText size={18} />} onClick={statement} disabled={s.count === 0}>{tr(`Estado ${year} (PDF)`, `${year} statement (PDF)`)}</Button>
          {m.email && <Button icon={<Send size={18} />} onClick={() => setEmailing(true)} disabled={s.count === 0}>{tr('Enviar por correo', 'E-mail it')}</Button>}
          <Button variant="ghost" icon={<Trash2 size={18} />} onClick={remove}>{tr('Eliminar', 'Delete')}</Button>
        </div>
      </section>

      {s.count === 0 ? (
        <Card><Empty title={tr('Todavía no tiene ofrendas registradas', 'No offerings recorded yet')} action={<Button variant="primary" onClick={() => openOffering({ memberId: m.id })}>{tr('Registrar la primera', 'Record the first one')}</Button>} /></Card>
      ) : (<>
        <section className="card grid grid-cols-2 lg:grid-cols-4 [&>*]:p-5 sm:[&>*]:p-6 [&>*]:border-line [&>*:nth-child(even)]:border-l lg:[&>*+*]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(n+3)]:border-t-0">
          <div><p className="text-muted text-[0.93rem]">{tr(`Dado en ${year}`, `Given in ${year}`)}</p><p className="mt-1.5 flex flex-wrap items-center gap-2"><span className="text-[1.6rem] font-bold leading-none">{money(s.total_year)}</span><Delta value={change} /></p></div>
          <div><p className="text-muted text-[0.93rem]">{tr('Total histórico', 'All-time total')}</p><p className="mt-1.5 text-[1.6rem] font-bold leading-none">{money(s.total_all)}</p></div>
          <div><p className="text-muted text-[0.93rem]">{tr('Ofrenda promedio', 'Average gift')}</p><p className="mt-1.5 text-[1.6rem] font-bold leading-none">{money(s.average)}</p><p className="text-muted text-[0.87rem] mt-2">{tr(`${num(s.count)} ofrendas`, `${num(s.count)} gifts`)}</p></div>
          <div><p className="text-muted text-[0.93rem]">{tr('Última ofrenda', 'Last gift')}</p><p className="mt-1.5 text-[1.6rem] font-bold leading-none">{date(s.last_date)}</p><p className="text-muted text-[0.87rem] mt-2">{tr('Primera:', 'First:')} {date(s.first_date)}</p></div>
        </section>
        <div className="grid xl:grid-cols-3 gap-5">
          <Card className="xl:col-span-2" title={tr('Últimos 12 meses', 'Last 12 months')}>
            <Columns data={data.monthly.map((x) => ({ label: labels.month(Number(x.month.slice(5))), value: x.total }))} />
          </Card>
          <Card title={tr('Por fondo', 'By fund')} hint={tr('Todo el historial', 'All time')}>
            <Breakdown empty="" items={data.byFund.map((f) => ({ key: f.id, label: f.name, value: f.total, slot: f.color_slot }))} />
          </Card>
        </div>
        <Card pad={false} title={tr('Sus ofrendas', 'Their offerings')} hint={offerings && offerings.count > 100 ? tr('Se muestran las 100 más recientes.', 'Showing the 100 most recent.') : undefined}>
          <div className="mt-4 border-t border-line">{offerings ? <OfferingTable rows={offerings.rows} hideMember /> : <Spinner />}</div>
        </Card>
      </>)}
      <MemberForm open={editing} member={m} onClose={() => setEditing(false)} />
      {m.email && (
        <EmailComposer open={emailing} onClose={() => setEmailing(false)} fixedRecipients={1}
          title={tr(`Enviar a ${m.first_name} su estado de ofrendas`, `E-mail ${m.first_name} their giving statement`)}
          intro={tr(`Se enviará a ${m.email} el estado de ${year} en PDF.`, `The ${year} statement will be sent as a PDF to ${m.email}.`)}
          defaultSubject={tr(`Tu estado de ofrendas ${year}`, `Your ${year} giving statement`)}
          defaultMessage={tr(`Hola {nombre}:\n\nTe compartimos el resumen de tus ofrendas de ${year}.\n\nGracias por tu fidelidad y tu generosidad.\n\nBendiciones.`, `Hello {name},\n\nHere is the summary of your ${year} giving.\n\nThank you for your faithfulness and generosity.\n\nBlessings.`)}
          aiContext={`Attached PDF: ${m.first_name}'s ${year} giving statement`}
          onSend={(msg) => api.post('/reports/email', { spec: { type: 'member', from: `${year}-01-01`, to: `${year}-12-31` }, memberIds: [m.id], subject: msg.subject, message: msg.message })} />
      )}
    </div>
  )
}
