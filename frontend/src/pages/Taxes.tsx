import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, CircleCheck, Download, FileText, Landmark, ListChecks, Mail, Printer, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { Avatar, Badge, Button, Card, Empty, PageHeader, Spinner, cx } from '../components/ui'
import { EmailComposer } from '../components/EmailComposer'
import { usePdfPreview } from '../components/PdfPreview'
import { ViewTabs } from '../components/ViewTabs'

interface Row {
  id: string; name: string; avatar_file: string | null; email: string | null; emails: string[]; has_address: boolean; deductible: number; given: number; goods: number; non_deductible: number
  gifts: number; largest: number; needs_acknowledgment: boolean; quid_pro_quo: boolean; noncash: number; household: boolean; members: string[]; emailed_at: string | null
}
interface Tax {
  year: number; years: number[]; emailConfigured: boolean
  readiness: { legal_name: boolean; tax_id: boolean; address: boolean; signer: boolean }
  members: Row[]
  totals: { deductible: number; statements: number; loose: number; non_deductible: number; goods: number; total: number; missing_email: number; missing_address: number; needs_acknowledgment: number; emailed: number; quid_pro_quo: number; noncash: number; households: number }
}

export default function Taxes() {
  const { tr, money, date, num, lang, session } = useApp()
  const preview = usePdfPreview()
  const qc = useQueryClient()
  const [year, setYear] = useState(() => { const n = new Date(); return n.getMonth() < 3 ? n.getFullYear() - 1 : n.getFullYear() })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [emailing, setEmailing] = useState(false)
  const [params, setParams] = useSearchParams()
  const view = (['constancias', 'revisar', 'saber'].includes(params.get('vista') || '') ? params.get('vista') : 'constancias') as 'constancias' | 'revisar' | 'saber'
  const setView = (v: typeof view) => setParams(v === 'constancias' ? {} : { vista: v }, { replace: true })
  const { data, isPending } = useQuery({ queryKey: ['tax', year], queryFn: () => api.get<Tax>(`/reports/tax?year=${year}`) })

  const pdf = (memberId?: string, name?: string) => preview({
    title: memberId ? tr(`Constancia ${year} de ${name}`, `${year} statement for ${name}`) : tr(`Todas las constancias de ${year}`, `All ${year} statements`),
    filename: memberId ? `${name} ${year}.pdf` : tr(`constancias-${year}.pdf`, `statements-${year}.pdf`),
    load: () => api.get<Blob>(`/reports/tax/statements.pdf?year=${year}&lang=${lang}${memberId ? `&memberId=${memberId}` : ''}`),
  })
  const toggle = (id: string) => setChosen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const check = (ok: boolean, yes: string, no: string) => (
    <li className="flex items-start gap-2.5">
      {ok ? <CircleCheck size={20} className="text-good shrink-0 mt-0.5" /> : <TriangleAlert size={20} className="text-warn shrink-0 mt-0.5" />}
      <span className={ok ? '' : 'font-medium'}>{ok ? yes : no}</span>
    </li>
  )
  const r = data?.readiness
  const allReady = r && r.legal_name && r.tax_id && r.address && r.signer
  const withEmail = data?.members.filter((m) => m.emails?.length) || []
  const sendTo = chosen.size ? withEmail.filter((m) => chosen.has(m.id)) : withEmail

  return (
    <>
      <PageHeader title={tr('Impuestos', 'Taxes')} subtitle={tr('Prepara y entrega las constancias anuales de contribuciones para que cada miembro pueda deducir lo que dio.', 'Prepare and deliver the yearly contribution statements so each member can deduct what they gave.')}>
        <label className="flex items-center gap-2.5">
          <span className="text-muted">{tr('Año fiscal', 'Tax year')}</span>
          <select className="ctl !w-auto" value={year} onChange={(e) => { setYear(Number(e.target.value)); setChosen(new Set()) }}>
            {(data?.years || [year]).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
      </PageHeader>

      {isPending || !data ? <Spinner /> : (
        <div className="grid gap-6 [&>*]:min-w-0">
          <section className="card grid sm:grid-cols-2 xl:grid-cols-4 [&>*]:p-5 sm:[&>*]:p-6 [&>*]:border-line sm:[&>*:nth-child(even)]:border-l xl:[&>*+*]:border-l [&>*+*]:border-t sm:[&>*:nth-child(2)]:border-t-0 xl:[&>*+*]:border-t-0">
            <div><p className="text-muted text-[0.93rem]">{tr('Total deducible', 'Total deductible')}</p><p className="mt-1.5 text-[1.7rem] font-bold leading-none">{money(data.totals.deductible)}</p><p className="text-muted text-[0.87rem] mt-2">{tr(`en ${data.totals.statements} constancias`, `across ${data.totals.statements} statements`)}</p></div>
            <div><p className="text-muted text-[0.93rem]">{tr('Sin nombre (no deducible)', 'No name (not deductible)')}</p><p className="mt-1.5 text-[1.7rem] font-bold leading-none">{money(data.totals.loose)}</p><p className="text-muted text-[0.87rem] mt-2">{tr('ofrendas sueltas', 'loose offerings')}</p></div>
            <div><p className="text-muted text-[0.93rem]">{tr('Fondos no deducibles', 'Non-deductible funds')}</p><p className="mt-1.5 text-[1.7rem] font-bold leading-none">{money(data.totals.non_deductible)}</p><p className="text-muted text-[0.87rem] mt-2"><Link to="/configuracion?tab=fondos" className="underline underline-offset-4 hover:text-ink">{tr('Revisar fondos', 'Review funds')}</Link></p></div>
            <div><p className="text-muted text-[0.93rem]">{tr('Constancias enviadas', 'Statements sent')}</p><p className="mt-1.5 text-[1.7rem] font-bold leading-none">{data.totals.emailed} <span className="text-muted text-[1.1rem] font-normal">{tr('de', 'of')} {data.totals.statements}</span></p><p className="text-muted text-[0.87rem] mt-2">{tr('por correo desde Sanctuary', 'by e-mail from Sanctuary')}</p></div>
          </section>

          {!(allReady && !data.totals.missing_address) && (
            <button type="button" onClick={() => setView('revisar')} className="flex flex-wrap items-center gap-3 text-left rounded-[14px] border border-warn bg-warn-soft px-4 py-3 no-print">
              <TriangleAlert size={21} className="text-warn shrink-0" aria-hidden />
              <span className="flex-1 min-w-[14rem] font-semibold">{tr('Antes de entregar las constancias falta completar algunos datos.', 'Some details are missing before handing out the statements.')}</span>
              <span className="text-accent-ink font-semibold underline underline-offset-4">{tr('Ver qué falta', 'See what is missing')}</span>
            </button>
          )}
          <ViewTabs value={view} onChange={setView} label={tr('Secciones de impuestos', 'Tax sections')} options={[
            { value: 'constancias', label: tr(`Constancias (${data.totals.statements})`, `Statements (${data.totals.statements})`), icon: <FileText size={20} /> },
            { value: 'revisar', label: tr('Antes de entregar', 'Before handing out'), icon: <ListChecks size={20} /> },
            { value: 'saber', label: tr('Lo que conviene saber', 'Good to know'), icon: <BookOpen size={20} /> },
          ]} />
          {view === 'constancias' && (
            <div id="panel-constancias" role="tabpanel" aria-labelledby="tab-constancias" className="grid [&>*]:min-w-0">
          <Card pad={false} title={tr(`Constancias de ${year}`, `${year} statements`)}
                hint={tr('Una por cada miembro con contribuciones deducibles. Marca las casillas para enviar solo a algunos.', 'One for each member with deductible contributions. Tick boxes to send only to some.')}
                action={<div className="flex flex-wrap gap-2.5 justify-end">
                  <Button icon={<Printer size={18} />} onClick={() => pdf()} disabled={!data.members.length}>{tr('Descargar todas (PDF)', 'Download all (PDF)')}</Button>
                  <Button variant="primary" icon={<Mail size={18} />} onClick={() => setEmailing(true)} disabled={!sendTo.length}>
                    {chosen.size ? tr(`Enviar a ${sendTo.length} elegidos`, `E-mail ${sendTo.length} selected`) : tr(`Enviar a todos (${sendTo.length})`, `E-mail all (${sendTo.length})`)}
                  </Button>
                </div>}>
                {data.members.length === 0 ? (
                  <Empty icon={<Landmark size={28} />} title={tr(`No hay contribuciones deducibles en ${year}`, `No deductible contributions in ${year}`)}>{tr('Aparecerán aquí cuando registres ofrendas con nombre en fondos deducibles.', 'They will appear here once you record named offerings in deductible funds.')}</Empty>
                ) : (
                  <div className="mt-4 border-t border-line">
                    <label className="flex items-center gap-3 px-5 sm:px-6 py-3 border-b border-line text-ink-soft font-semibold w-full cursor-pointer">
                      <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={chosen.size === data.members.length} onChange={() => setChosen(new Set(chosen.size === data.members.length ? [] : data.members.map((m) => m.id)))} />
                      {tr('Elegir a todos', 'Select everyone')}
                    </label>
                    <ul className="divide-y divide-line">
                      {data.members.map((m) => (
                        <li key={m.id} className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 sm:px-6 py-3.5', chosen.has(m.id) && 'bg-accent-soft/40')}>
                          <input type="checkbox" className="size-5 accent-[var(--accent)] shrink-0" aria-label={m.name} checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                          <Avatar name={m.name} file={m.avatar_file} size={40} />
                          <div className="flex-1 min-w-[12rem]">
                            {m.household
                              ? <p className="font-semibold">{m.name}<span className="block text-ink-soft text-[0.88rem] font-normal">{tr('Constancia conjunta', 'Joint statement')}: {m.members.join(', ')}</span></p>
                              : <Link to={`/miembros/${m.id}`} className="font-semibold hover:underline underline-offset-4">{m.name}</Link>}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {m.emailed_at && <Badge tone="good"><CircleCheck size={13} />{tr('Enviada', 'Sent')} {date(m.emailed_at.slice(0, 10))}</Badge>}
                              {m.needs_acknowledgment && <Badge tone="accent">{tr('Donativo de $250+', '$250+ gift')}</Badge>}
                              {m.quid_pro_quo && <Badge tone="accent">{tr('Recibió algo a cambio', 'Received goods')}</Badge>}
                              {m.noncash > 0 && <Badge>{tr(`${m.noncash} en especie`, `${m.noncash} in kind`)}</Badge>}
                              {!m.email && <Badge tone="warn">{tr('Sin correo', 'No e-mail')}</Badge>}
                              {!m.has_address && <Badge tone="warn">{tr('Sin dirección', 'No address')}</Badge>}
                            </div>
                          </div>
                          <div className="text-right ml-auto">
                            <p className="font-bold text-[1.08rem] tabular-nums whitespace-nowrap">{money(m.deductible)}</p>
                            <p className="text-ink-soft text-[0.86rem] whitespace-nowrap">{m.goods > 0 ? tr(`dio ${money(m.given, { whole: true })}, recibió ${money(m.goods, { whole: true })}`, `gave ${money(m.given, { whole: true })}, received ${money(m.goods, { whole: true })}`) : tr(`${num(m.gifts)} ofrendas`, `${num(m.gifts)} gifts`)}</p>
                          </div>
                          <Button size="sm" variant="ghost" icon={<Download size={16} />} onClick={() => pdf(m.id, m.name)}>PDF</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          )}
          {view === 'revisar' && (
            <div id="panel-revisar" role="tabpanel" aria-labelledby="tab-revisar" className="max-w-3xl">
            <Card title={tr('Antes de entregar las constancias', 'Before handing out statements')} hint={allReady && !data.totals.missing_address ? tr('Todo está en orden.', 'Everything is in order.') : tr('Completa lo que falta para que las constancias sean válidas.', 'Complete what is missing so the statements are valid.')}>
              <ul className="grid gap-3">
                {check(r!.legal_name && r!.address, tr('La constancia lleva el nombre legal y la dirección de la iglesia.', 'The statement carries the church’s legal name and address.'), tr('Falta el nombre legal o la dirección de la iglesia.', 'The church’s legal name or address is missing.'))}
                {check(r!.tax_id, tr('Número de identificación fiscal (EIN) registrado.', 'Tax ID (EIN) is on file.'), tr('Falta el número de identificación fiscal (EIN) de la iglesia.', 'The church’s tax ID (EIN) is missing.'))}
                {check(r!.signer, tr('Hay una persona que firma (tesorería o pastor).', 'There is a signer (treasurer or pastor).'), tr('Falta el nombre de quien firma: tesorero o pastor.', 'The signer’s name is missing: treasurer or pastor.'))}
                {check(data.totals.missing_address === 0, tr('Todos los contribuyentes tienen dirección.', 'Every donor has an address.'), tr(`${data.totals.missing_address} contribuyentes no tienen dirección registrada.`, `${data.totals.missing_address} donors have no address on file.`))}
                {check(data.totals.missing_email === 0, tr('Todos los contribuyentes tienen correo.', 'Every donor has an e-mail.'), tr(`${data.totals.missing_email} contribuyentes no tienen correo: habrá que imprimir sus constancias.`, `${data.totals.missing_email} donors have no e-mail: their statements will need printing.`))}
              </ul>
              {!allReady && <Link to="/configuracion?tab=iglesia" className="inline-block mt-5 no-print"><Button>{tr('Completar datos de la iglesia', 'Complete church details')}</Button></Link>}
            </Card>
            </div>
          )}
          {view === 'saber' && (
            <div id="panel-saber" role="tabpanel" aria-labelledby="tab-saber" className="max-w-3xl">
            <Card title={tr('Lo que conviene saber', 'Good to know')} hint={tr('Guía general para iglesias en Estados Unidos (IRS, Publicación 1771).', 'General guidance for churches in the United States (IRS Publication 1771).')}>
              <ul className="grid gap-3 text-ink-soft [&_strong]:text-ink [&_strong]:font-semibold">
                <li><strong>{tr('Donativos de $250 o más.', 'Gifts of $250 or more.')}</strong> {tr(`Para deducir una contribución individual de $250 o más, el miembro necesita una constancia escrita de la iglesia. Este año aplica a ${data.totals.needs_acknowledgment} personas.`, `To deduct any single contribution of $250 or more, the member needs a written acknowledgment from the church. This year that applies to ${data.totals.needs_acknowledgment} people.`)}</li>
                <li><strong>{tr('Cuándo entregarlas.', 'When to deliver them.')}</strong> {tr('El miembro debe tenerla antes de presentar su declaración. La costumbre es entregarlas antes del 31 de enero.', 'The member must have it before filing their return. The usual practice is to deliver them by January 31.')}</li>
                <li><strong>{tr('Qué debe decir.', 'What it must say.')}</strong> {tr('Nombre de la iglesia, fecha y monto de cada contribución, y una declaración de que no se entregaron bienes ni servicios a cambio (salvo beneficios religiosos intangibles). Sanctuary lo incluye automáticamente.', 'The church’s name, the date and amount of each contribution, and a statement that no goods or services were given in return (other than intangible religious benefits). Sanctuary includes this automatically.')}</li>
                <li><strong>{tr('Cuando el donante recibe algo.', 'When the donor receives something.')}</strong> {tr(`Si alguien da más de $75 y recibe algo a cambio (una cena, un boleto), solo es deducible la diferencia y la constancia debe decirlo. Anota el valor en «¿Recibió algo a cambio?» al registrar la ofrenda; Sanctuary calcula el resto y añade el aviso. Este año aplica a ${data.totals.quid_pro_quo} personas.`, `If someone gives more than $75 and receives something (a dinner, a ticket), only the difference is deductible and the statement must say so. Enter the value under “Did they receive something in return?” when recording the gift; Sanctuary works out the rest and adds the notice. This year it applies to ${data.totals.quid_pro_quo} people.`)}</li>
                <li><strong>{tr('Donaciones en especie.', 'Gifts of property.')}</strong> {tr('Muebles, comida o equipo se describen en la constancia sin ponerles valor: el valor lo determina quien dona. Regístralas en la ficha del miembro.', 'Furniture, food or equipment are described on the statement without a value: the donor determines the value. Record them on the member’s page.')}</li>
                <li><strong>{tr('Familias.', 'Households.')}</strong> {tr('Los esposos pueden recibir una sola constancia conjunta. Únelos en una familia desde la ficha del miembro.', 'Spouses can receive one joint statement. Group them as a household from the member’s page.')}</li>
                <li><strong>{tr('Lo que no es deducible.', 'What is not deductible.')}</strong> {tr('Ofrendas sin nombre, compras (comida, rifas, camisetas) y pagos por los que se recibió algo a cambio. Marca esos fondos como “no deducibles” en Configuración.', 'Offerings with no name, purchases (food, raffles, T-shirts) and payments where something was received in return. Mark those funds as “not deductible” in Settings.')}</li>
              </ul>
              <p className="text-muted text-[0.87rem] mt-4">{tr('Esto es información general, no asesoría fiscal. Confirma con un contador los casos particulares.', 'This is general information, not tax advice. Check specific cases with an accountant.')}</p>
            </Card>
            </div>
          )}
        </div>
      )}

      <EmailComposer
        open={emailing} onClose={() => { setEmailing(false); qc.invalidateQueries({ queryKey: ['tax'] }) }} fixedRecipients={sendTo.length}
        title={tr(`Enviar constancias de ${year}`, `E-mail ${year} statements`)}
        intro={tr(`Cada persona recibirá su propia constancia en PDF. Se enviará a ${sendTo.length} miembros con correo registrado.`, `Each person will receive their own PDF statement. It will go to ${sendTo.length} members with an e-mail on file.`)}
        defaultSubject={tr(`Tu constancia de contribuciones ${year} · ${session!.org.name}`, `Your ${year} contribution statement · ${session!.org.name}`)}
        defaultMessage={lang === 'es'
          ? `Hola {nombre}:\n\nAdjuntamos tu constancia de contribuciones del año ${year}. Guárdala junto con tus documentos de impuestos.\n\nGracias por tu fidelidad y tu generosidad con la obra del Señor.\n\nBendiciones,\n${session!.org.treasurer_name || session!.user.full_name}\nTesorería · ${session!.org.name}`
          : `Hello {name},\n\nAttached is your contribution statement for ${year}. Please keep it with your tax records.\n\nThank you for your faithfulness and generosity.\n\nBlessings,\n${session!.org.treasurer_name || session!.user.full_name}\nTreasury · ${session!.org.name}`}
        aiContext={`Attached PDF: each member's personal ${year} tax contribution statement`}
        onSend={(m) => api.post('/reports/tax/email', { year, lang, memberIds: sendTo.map((x) => x.id), subject: m.subject, message: m.message })}
      />
    </>
  )
}
