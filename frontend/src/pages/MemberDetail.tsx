import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Cake, FileText, HandCoins, Hash, Home, LayoutDashboard, Mail, MapPin, MessageSquareText, MoreHorizontal, Send, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useLabels } from '../lib/labels'
import type { Member, Offering } from '../lib/types'
import { AvatarPicker, Badge, Button, Card, Empty, Spinner, useFeedback } from '../components/ui'
import { ViewTabs } from '../components/ViewTabs'
import { Breakdown, Columns } from '../components/charts'
import { OfferingTable } from '../components/OfferingTable'
import { useOfferingForm } from '../components/OfferingForm'
import { MemberForm } from '../components/MemberForm'
import { EmailComposer } from '../components/EmailComposer'
import { SmsComposer } from '../components/SmsComposer'
import { usePdfPreview } from '../components/PdfPreview'
import { HouseholdCard, NonCashCard, PersonalLinkCard } from '../components/MemberExtras'

interface Detail {
  member: Member
  stats: { total_all: number; count: number; average: number; total_year: number; total_last_year: number; first_date: string | null; last_date: string | null; largest: number }
  monthly: { month: string; total: number }[]
  byFund: { id: string; name: string; color_slot: number; total: number }[]
  yearly: { year: number; total: number }[]
  household: { id: string; name: string; joint_statement: boolean; members: { id: string; full_name: string; avatar_file: string | null }[] } | null
}

export default function MemberDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { tr, money, date, num, session } = useApp()
  const labels = useLabels()
  const { confirm, toast, fail } = useFeedback()
  const openOffering = useOfferingForm()
  const preview = usePdfPreview()
  const [editing, setEditing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [texting, setTexting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState(false)
  const [params, setParams] = useSearchParams()
  const view = (['resumen', 'ofrendas', 'familia'].includes(params.get('vista') || '') ? params.get('vista') : 'resumen') as 'resumen' | 'ofrendas' | 'familia'
  const setView = (v: typeof view) => setParams(v === 'resumen' ? {} : { vista: v }, { replace: true })
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
  const statement = () => preview({ title: tr(`Estado de ofrendas ${year} · ${m.full_name}`, `${year} giving statement · ${m.full_name}`), filename: `${m.full_name} ${year}.pdf`, load: () => api.post<Blob>('/reports/pdf', { type: 'member', memberId: m.id, from: `${year}-01-01`, to: `${year}-12-31` }) })
  const change = s.total_last_year > 0 ? Math.round(((s.total_year - s.total_last_year) / s.total_last_year) * 1000) / 10 : null
  const contact = [
    m.phone && { icon: <Phone size={17} />, text: m.phone },
    m.email && { icon: <Mail size={17} />, text: m.email },
    (m.address || m.city) && { icon: <MapPin size={17} />, text: [m.address, m.city, m.state, m.postal_code].filter(Boolean).join(', ') },
    m.envelope_number && { icon: <Hash size={17} />, text: `${tr('Sobre', 'Envelope')} ${m.envelope_number}` },
    m.birth_date && { icon: <Cake size={17} />, text: date(m.birth_date) },
  ].filter(Boolean) as { icon: React.ReactNode; text: string }[]

  const giftsLabel = s.count === 1 ? tr('1 ofrenda', '1 gift') : tr(`${num(s.count)} ofrendas`, `${num(s.count)} gifts`)
  const yearLabel = session!.org.fiscal_year_start === 1 ? tr(`en ${year}`, `in ${year}`) : tr('este año fiscal', 'this fiscal year')
  const pctText = change == null ? 0 : Math.round(Math.abs(change))
  const changeText = change == null ? '' : pctText === 0 ? tr(', igual que el año pasado', ', the same as last year')
    : change > 0 ? tr(`, un ${pctText}% más que el año pasado`, `, ${pctText}% more than last year`)
      : tr(`, un ${pctText}% menos que el año pasado`, `, ${pctText}% less than last year`)

  return (
    <div className="grid gap-6 max-w-[1240px] [&>*]:min-w-0">
      <Link to="/miembros" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink w-fit no-print"><ArrowLeft size={18} />{tr('Miembros', 'Members')}</Link>

      <section className="card p-5 sm:p-7 grid gap-6">
        <div className="flex flex-wrap gap-6 items-start">
          <AvatarPicker name={m.full_name} file={m.avatar_file} onPick={pick} busy={uploading} />
          <div className="flex-1 min-w-[240px]">
            <h1 className="font-display text-[2rem] leading-tight">{m.full_name}</h1>
            <p className="flex flex-wrap gap-2 mt-2">
              <Badge tone={m.status === 'active' ? 'good' : m.status === 'visitor' ? 'accent' : 'neutral'}>{labels.status(m.status)}</Badge>
              <Badge>{labels.role(m.church_role)}</Badge>
              {m.sms_opt_in && <Badge tone="accent">{tr('Acepta SMS', 'Agrees to texts')}</Badge>}
              {m.joined_date && <Badge>{tr('Desde', 'Since')} {date(m.joined_date)}</Badge>}
            </p>
            {contact.length > 0 && (
              <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-ink-soft">
                {contact.map((c, i) => <li key={i} className="flex items-center gap-2 min-w-0"><span className="text-muted shrink-0" aria-hidden>{c.icon}</span><span className="truncate">{c.text}</span></li>)}
              </ul>
            )}
            {m.notes && <p className="mt-4 text-ink-soft max-w-[65ch] whitespace-pre-line">{m.notes}</p>}
          </div>
        </div>
        {s.count > 0 && (
          <p className="text-[1.12rem] leading-relaxed max-w-[70ch]">
            {tr('Ha dado', 'Has given')} <strong>{money(s.total_year, { whole: true })}</strong> {yearLabel}{changeText}.{' '}
            {tr(`En total lleva ${giftsLabel}; la última fue el`, `In all, ${giftsLabel}; the last one on`)} <strong>{date(s.last_date)}</strong>.
          </p>
        )}
        <div className="flex flex-wrap gap-2.5 no-print">
          <Button variant="primary" icon={<Plus size={19} />} onClick={() => openOffering({ memberId: m.id })}>{tr('Registrar ofrenda', 'Record offering')}</Button>
          <Button icon={<FileText size={18} />} onClick={statement} disabled={s.count === 0}>{tr(`Estado ${year} (PDF)`, `${year} statement (PDF)`)}</Button>
          <Button icon={<Pencil size={18} />} onClick={() => setEditing(true)}>{tr('Editar datos', 'Edit details')}</Button>
          <Button variant="ghost" icon={<MoreHorizontal size={18} />} aria-expanded={more} onClick={() => setMore(!more)}>{more ? tr('Menos', 'Less') : tr('Más acciones', 'More actions')}</Button>
        </div>
        {more && (
          <div className="flex flex-wrap gap-2.5 -mt-3 pt-4 border-t border-line no-print">
            {m.email && <Button icon={<Send size={18} />} onClick={() => setEmailing(true)} disabled={s.count === 0}>{tr('Enviar su estado por correo', 'E-mail their statement')}</Button>}
            {session!.features.sms && m.sms_opt_in && m.phone && <Button icon={<MessageSquareText size={18} />} onClick={() => setTexting(true)}>{tr('Enviar un SMS', 'Send a text')}</Button>}
            <Button variant="danger" icon={<Trash2 size={18} />} onClick={remove}>{tr('Eliminar miembro', 'Delete member')}</Button>
          </div>
        )}
      </section>

      <ViewTabs value={view} onChange={setView} label={tr('Secciones del miembro', 'Member sections')} options={[
        { value: 'resumen', label: tr('Resumen', 'Summary'), icon: <LayoutDashboard size={21} /> },
        { value: 'ofrendas', label: tr(`Ofrendas (${num(s.count)})`, `Gifts (${num(s.count)})`), icon: <HandCoins size={21} /> },
        { value: 'familia', label: tr('Familia y constancia', 'Household & statement'), icon: <Home size={21} /> },
      ]} />

      {view === 'resumen' && (
        <div id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen" className="grid gap-6 [&>*]:min-w-0">
          {s.count === 0 ? (
            <Card><Empty title={tr('Todavía no tiene ofrendas registradas', 'No offerings recorded yet')} action={<Button variant="primary" onClick={() => openOffering({ memberId: m.id })}>{tr('Registrar la primera', 'Record the first one')}</Button>} /></Card>
          ) : (<>
            <section aria-label={tr('Cifras', 'Figures')} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: session!.org.fiscal_year_start === 1 ? tr(`Dado en ${year}`, `Given in ${year}`) : tr('Dado este año fiscal', 'Given this fiscal year'), value: money(s.total_year, { whole: true }), note: s.total_last_year > 0 ? tr(`El año pasado: ${money(s.total_last_year, { whole: true })}`, `Last year: ${money(s.total_last_year, { whole: true })}`) : undefined },
                { label: tr('Total de siempre', 'All-time total'), value: money(s.total_all, { whole: true }), note: s.first_date ? tr(`Desde el ${date(s.first_date)}`, `Since ${date(s.first_date)}`) : undefined },
                { label: tr('Ofrenda promedio', 'Average gift'), value: money(s.average, { whole: true }), note: tr(`En ${giftsLabel}`, `Across ${giftsLabel}`) },
                { label: tr('Última ofrenda', 'Last gift'), value: date(s.last_date), note: tr(`La más grande: ${money(s.largest, { whole: true })}`, `Largest: ${money(s.largest, { whole: true })}`) },
              ].map((x) => (
                <div key={x.label} className="card p-6">
                  <p className="text-ink-soft font-semibold">{x.label}</p>
                  <p className="mt-1 text-[1.9rem] font-bold leading-tight tabular-nums">{x.value}</p>
                  {x.note && <p className="text-ink-soft text-[0.95rem] mt-1">{x.note}</p>}
                </div>
              ))}
            </section>
            <div className="grid xl:grid-cols-3 gap-6 [&>*]:min-w-0">
              <Card className="xl:col-span-2" title={tr('Los últimos 12 meses', 'The last 12 months')} hint={tr('Lo que dio cada mes.', 'What they gave each month.')}>
                <Columns data={data.monthly.map((x) => ({ label: labels.month(Number(x.month.slice(5))), value: x.total }))} />
              </Card>
              <Card title={tr('¿A qué fondos dio?', 'Which funds?')} hint={tr('Todo el historial', 'All time')}>
                <Breakdown empty="" items={data.byFund.map((f) => ({ key: f.id, label: f.name, value: f.total, slot: f.color_slot }))} />
              </Card>
            </div>
          </>)}
        </div>
      )}

      {view === 'ofrendas' && (
        <div id="panel-ofrendas" role="tabpanel" aria-labelledby="tab-ofrendas">
          <Card pad={false} title={tr('Sus ofrendas', 'Their offerings')} hint={offerings && offerings.count > 100 ? tr('Se muestran las 100 más recientes.', 'Showing the 100 most recent.') : undefined}
            action={<Button size="sm" variant="primary" icon={<Plus size={17} />} onClick={() => openOffering({ memberId: m.id })}>{tr('Registrar', 'Record')}</Button>}>
            <div className="mt-4 border-t border-line">
              {!offerings ? <Spinner /> : offerings.rows.length === 0 ? <p className="text-muted p-6">{tr('Todavía no tiene ofrendas registradas.', 'No offerings recorded yet.')}</p> : <OfferingTable rows={offerings.rows} hideMember />}
            </div>
          </Card>
        </div>
      )}

      {view === 'familia' && (
        <div id="panel-familia" role="tabpanel" aria-labelledby="tab-familia" className="grid lg:grid-cols-2 gap-6 items-start [&>*]:min-w-0">
          <HouseholdCard member={m} household={data.household} />
          <PersonalLinkCard member={m} />
          <NonCashCard member={m} />
        </div>
      )}

      <MemberForm open={editing} member={m} onClose={() => setEditing(false)} />
      <SmsComposer open={texting} onClose={() => setTexting(false)} preselect={[m.id]} />
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
