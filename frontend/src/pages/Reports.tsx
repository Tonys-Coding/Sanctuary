import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import { CalendarCheck, CalendarDays, ClipboardList, Download, FileSpreadsheet, HandCoins, Layers, List, Mail, Printer, Receipt, Scale, SlidersHorizontal, Sparkles, UserRound, Users, Wallet, X } from 'lucide-react'
import { api, download } from '../lib/api'
import { useApp } from '../lib/app'
import { useFunds } from '../lib/data'
import { METHODS, useLabels } from '../lib/labels'
import { rangeFor, rangeOptions, type RangeKey } from '../lib/ranges'
import type { Lang, Report, ReportColumn } from '../lib/types'
import { Button, Card, Empty, ErrorNote, Field, PageHeader, Spinner, cx, useFeedback } from '../components/ui'
import { MemberPicker } from '../components/MemberPicker'
import { EmailComposer } from '../components/EmailComposer'
import { usePdfPreview } from '../components/PdfPreview'
import { ViewTabs } from '../components/ViewTabs'

type Type = 'summary' | 'by_member' | 'by_fund' | 'by_month' | 'by_method' | 'transactions' | 'member' | 'batches' | 'treasurer' | 'expenses'

export function ReportView({ report, note }: { report: Report; note?: string | null }) {
  const { tr, money, date, num, session } = useApp()
  const cell = (v: unknown, kind: ReportColumn['kind']) =>
    v == null || v === '' ? '' : kind === 'money' ? money(Number(v)) : kind === 'date' && /^\d{4}-/.test(String(v)) ? date(String(v)) : kind === 'percent' ? `${v}%` : kind === 'number' ? num(Number(v)) : String(v)
  const right = (k: ReportColumn['kind']) => k === 'money' || k === 'number' || k === 'percent'
  return (
    <article>
      <header className="mb-6">
        <p className="print-only font-bold text-[1.15rem] mb-3">{session!.org.name}</p>
        <h2 className="font-display text-[1.6rem] leading-tight">{report.title}</h2>
        <p className="text-muted mt-1">{report.subtitle}</p>
      </header>
      {report.highlights.length > 0 && (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4 mb-7 pb-6 border-b border-line">
          {report.highlights.map((h, i) => (
            <div key={h.label}>
              <dt className="text-muted text-[0.9rem]">{h.label}</dt>
              <dd className={cx('text-[1.5rem] font-bold leading-tight mt-0.5', i === 0 && 'text-accent-ink')}>{cell(h.value, h.kind)}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && (
        <div className="mb-7 rounded-[14px] bg-accent-soft/50 p-5 avoid-break">
          <p className="flex items-center gap-2 font-semibold mb-2"><Sparkles size={18} className="text-accent-ink" />{tr('Explicación', 'Explanation')}</p>
          <div className="prose-ai"><Markdown>{note}</Markdown></div>
        </div>
      )}
      {report.sections.map((s, si) => (
        <section key={si} className="mb-8 last:mb-0">
          {s.title && <h3 className="font-semibold text-[1.08rem] mb-2">{s.title}</h3>}
          {s.rows.length === 0 ? <p className="text-muted py-3">{tr('No hay registros en este periodo.', 'No records in this period.')}</p> : (
            <div className="overflow-x-auto relative">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-line-strong">
                    {s.columns.map((c) => <th key={c.key} className={cx('py-2.5 px-3 first:pl-0 last:pr-0 text-[0.82rem] font-semibold text-muted uppercase tracking-wide whitespace-nowrap', right(c.kind) ? 'text-right' : 'text-left')}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-line">
                      {s.columns.map((c) => <td key={c.key} className={cx('py-2.5 px-3 first:pl-0 last:pr-0', right(c.kind) && 'text-right whitespace-nowrap', c.kind === 'date' && 'whitespace-nowrap', c.key === 'total' && 'font-semibold')}>{cell(r[c.key], c.kind)}</td>)}
                    </tr>
                  ))}
                </tbody>
                {s.total && (
                  <tfoot>
                    <tr className="font-bold">
                      {s.columns.map((c) => <td key={c.key} className={cx('py-3 px-3 first:pl-0 last:pr-0', right(c.kind) && 'text-right whitespace-nowrap')}>{cell(s.total![c.key], c.kind === 'date' ? 'text' : c.kind)}</td>)}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </section>
      ))}
    </article>
  )
}

export default function Reports() {
  const { tr, lang, session } = useApp()
  const fys = session!.org.fiscal_year_start || 1
  const labels = useLabels()
  const { fail } = useFeedback()
  const preview = usePdfPreview()
  const { data: funds = [] } = useFunds(true)
  const [params] = useSearchParams()
  const preset = params.get('preset')
  const [type, setType] = useState<Type>(preset === 'tesoreria' ? 'treasurer' : preset === 'gastos' ? 'expenses' : 'summary')
  const [range, setRange] = useState<RangeKey>(preset === 'mes' || preset === 'tesoreria' ? 'last_month' : 'this_year')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [fundId, setFundId] = useState('')
  const [method, setMethod] = useState('')
  const [memberId, setMemberId] = useState<string | null>(null)
  const [reportLang, setReportLang] = useState<Lang>(lang)
  const [note, setNote] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [busy, setBusy] = useState('')
  const [mode, setMode] = useState<'listos' | 'medida'>('listos')

  const types: { value: Type; icon: ReactNode; label: string; text: string }[] = [
    { value: 'summary', icon: <Layers size={22} />, label: tr('Resumen general', 'Overall summary'), text: tr('Lo esencial en una hoja: por fondo, mes y método.', 'The essentials on one page: by fund, month and method.') },
    { value: 'by_month', icon: <CalendarDays size={22} />, label: tr('Por mes', 'By month'), text: tr('Cuánto entró cada mes.', 'How much came in each month.') },
    { value: 'by_member', icon: <Users size={22} />, label: tr('Por miembro', 'By member'), text: tr('Total de cada persona.', 'Each person’s total.') },
    { value: 'by_fund', icon: <Wallet size={22} />, label: tr('Por fondo', 'By fund'), text: tr('Diezmos, ofrendas, misiones…', 'Tithes, offerings, missions…') },
    { value: 'by_method', icon: <HandCoins size={22} />, label: tr('Por método', 'By method'), text: tr('Efectivo, cheque, transferencia…', 'Cash, check, transfer…') },
    { value: 'transactions', icon: <List size={22} />, label: tr('Detalle', 'Detail'), text: tr('Cada ofrenda, una por línea.', 'Every offering, one per line.') },
    { value: 'member', icon: <UserRound size={22} />, label: tr('Estado de un miembro', 'One member’s statement'), text: tr('Todo lo que dio una persona.', 'Everything one person gave.') },
    { value: 'batches', icon: <ClipboardList size={22} />, label: tr('Conteos', 'Counts'), text: tr('Lista de cultos contados.', 'List of counted services.') },
    { value: 'treasurer', icon: <Scale size={22} />, label: tr('Informe de tesorería', 'Treasurer’s report'), text: tr('Saldo, ingresos, gastos, presupuesto y depósitos.', 'Balance, income, expenses, budget and deposits.') },
    { value: 'expenses', icon: <Receipt size={22} />, label: tr('Gastos', 'Expenses'), text: tr('Cada gasto pagado, uno por línea.', 'Every expense paid, one per line.') },
  ]
  const noFilters = type === 'batches' || type === 'treasurer' || type === 'expenses'
  const byValue = (v: Type) => types.find((t) => t.value === v)!
  const groups = [
    { title: tr('Ofrendas', 'Offerings'), items: (['summary', 'by_month', 'by_fund', 'by_method', 'transactions'] as Type[]).map(byValue) },
    { title: tr('Personas', 'People'), items: (['by_member', 'member'] as Type[]).map(byValue) },
    { title: tr('Tesorería', 'Treasury'), items: (['treasurer', 'expenses', 'batches'] as Type[]).map(byValue) },
  ]
  const yearRange: RangeKey = fys === 1 ? 'this_year' : 'fiscal_year'
  const ready_made: { icon: ReactNode; title: string; text: string; t: Type; r: RangeKey }[] = [
    { icon: <Scale size={24} />, title: tr('Tesorería del mes pasado', 'Last month’s treasury'), text: tr('Saldo, ingresos, gastos y depósitos. Para la junta.', 'Balance, income, expenses and deposits. For the board.'), t: 'treasurer', r: 'last_month' },
    { icon: <CalendarCheck size={24} />, title: tr('Ofrendas del mes pasado', 'Last month’s giving'), text: tr('Por fondo, por semana y por forma de pago.', 'By fund, by week and by payment method.'), t: 'summary', r: 'last_month' },
    { icon: <Layers size={24} />, title: tr('Resumen del año', 'Year summary'), text: tr('Todo lo recibido este año, mes por mes.', 'Everything received this year, month by month.'), t: 'summary', r: yearRange },
    { icon: <Users size={24} />, title: tr('Lo que dio cada miembro', 'What each member gave'), text: tr('Este año, persona por persona.', 'This year, person by person.'), t: 'by_member', r: yearRange },
    { icon: <Receipt size={24} />, title: tr('Gastos del mes pasado', 'Last month’s expenses'), text: tr('Cada pago, con su categoría.', 'Every payment, with its category.'), t: 'expenses', r: 'last_month' },
    { icon: <ClipboardList size={24} />, title: tr('Conteos del mes pasado', 'Last month’s counts'), text: tr('Cada culto contado y su total.', 'Each counted service and its total.'), t: 'batches', r: 'last_month' },
  ]
  const pickPreset = (t: Type, r: RangeKey) => { setType(t); setRange(r); setFundId(''); setMethod(''); setMemberId(null) }

  const dates = range === 'custom' ? custom : rangeFor(range, fys)
  const ready = !!dates.from && !!dates.to && (type !== 'member' || !!memberId)
  const spec = { type, ...dates, fundId: noFilters ? '' : fundId, method: noFilters ? '' : method, memberId: type === 'member' ? memberId : null, lang: reportLang }
  const { data: report, isFetching, error } = useQuery({
    queryKey: ['report', spec], queryFn: () => api.post<Report>('/reports/run', spec), enabled: ready, placeholderData: (p) => p,
  })
  // A new report invalidates the previous explanation.
  const [noteFor, setNoteFor] = useState('')
  const key = JSON.stringify(spec)
  const shownNote = noteFor === key ? note : null

  const run = async (name: string, fn: () => Promise<unknown>) => { setBusy(name); try { await fn() } catch (e) { fail(e) } finally { setBusy('') } }
  const explain = async () => {
    setExplaining(true)
    try { const r = await api.post<{ text: string }>('/ai/explain-report', spec); setNote(r.text); setNoteFor(key) } catch (e) { fail(e) } finally { setExplaining(false) }
  }
  const fileName = (ext: string) => `${report?.title || 'informe'}.${ext}`

  return (
    <>
      <PageHeader title={tr('Informes', 'Reports')} subtitle={tr('Elige qué quieres ver y de qué periodo. El informe aparece abajo, listo para imprimir, descargar o enviar por correo.', 'Choose what you want to see and for which period. The report appears below, ready to print, download or e-mail.')} />

      <div className="grid gap-6 [&>*]:min-w-0">
        <ViewTabs value={mode} onChange={setMode} label={tr('Cómo elegir el informe', 'How to choose the report')} options={[
          { value: 'listos', label: tr('Informes listos', 'Ready-made reports'), icon: <CalendarCheck size={21} /> },
          { value: 'medida', label: tr('Armar uno a mi medida', 'Build my own'), icon: <SlidersHorizontal size={21} /> },
        ]} />

        {mode === 'listos' && (
          <section id="panel-listos" role="tabpanel" aria-labelledby="tab-listos" className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 no-print">
            {ready_made.map((p) => {
              const on = type === p.t && range === p.r && !fundId && !method
              return (
                <button key={p.title} type="button" aria-pressed={on} onClick={() => pickPreset(p.t, p.r)}
                  className={cx('card flex items-start gap-4 p-5 text-left transition-colors', on ? 'border-accent bg-accent-soft/50' : 'hover:border-accent')}>
                  <span className={cx('size-12 rounded-[14px] grid place-items-center shrink-0', on ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-ink')} aria-hidden>{p.icon}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-[1.08rem] leading-snug">{p.title}</span>
                    <span className="block text-ink-soft text-[0.95rem] mt-0.5">{p.text}</span>
                  </span>
                </button>
              )
            })}
          </section>
        )}

        {mode === 'medida' && (
          <Card className="no-print">
            <div id="panel-medida" role="tabpanel" aria-labelledby="tab-medida">
              <h2 className="font-semibold text-[1.15rem] mb-4">{tr('1. ¿Qué necesitas ver?', '1. What do you need to see?')}</h2>
              <div className="grid lg:grid-cols-3 gap-6">
                {groups.map((g) => (
                  <fieldset key={g.title} className="min-w-0">
                    <legend className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-ink-soft mb-2">{g.title}</legend>
                    <div role="radiogroup" aria-label={g.title} className="grid gap-2">
                      {g.items.map((t) => (
                        <button key={t.value} type="button" role="radio" aria-checked={type === t.value} onClick={() => setType(t.value)}
                          className={cx('flex items-start gap-3 text-left p-3.5 rounded-[14px] border-[1.5px] transition-colors', type === t.value ? 'border-accent bg-accent-soft' : 'border-line hover:bg-raised')}>
                          <span className={cx('mt-0.5 shrink-0', type === t.value ? 'text-accent-ink' : 'text-muted')} aria-hidden>{t.icon}</span>
                          <span><span className="block font-semibold leading-snug">{t.label}</span><span className="block text-ink-soft text-[0.9rem]">{t.text}</span></span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>

              <h2 className="font-semibold text-[1.15rem] mt-8 mb-4">{tr('2. ¿De qué periodo?', '2. For which period?')}</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label={tr('Periodo', 'Period')}>
                  {(id) => <select id={id} className="ctl" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>{rangeOptions(tr, false, fys).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
                </Field>
                {range === 'custom' && (<>
                  <Field label={tr('Desde', 'From')}>{(id) => <input id={id} type="date" className="ctl" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />}</Field>
                  <Field label={tr('Hasta', 'To')}>{(id) => <input id={id} type="date" className="ctl" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />}</Field>
                </>)}
                {type === 'member' && (
                  <Field label={tr('Miembro', 'Member')} className="sm:col-span-2">{(id) => <MemberPicker id={id} value={memberId} onChange={setMemberId} allowLoose={false} />}</Field>
                )}
                <Field label={tr('Idioma del informe', 'Report language')}>
                  {(id) => <select id={id} className="ctl" value={reportLang} onChange={(e) => setReportLang(e.target.value as Lang)}><option value="es">Español</option><option value="en">English</option></select>}
                </Field>
              </div>
              {!noFilters && (
                <details className="mt-5 rounded-[14px] border border-line px-4 py-2" open={!!fundId || !!method}>
                  <summary className="font-semibold text-ink-soft py-2 cursor-pointer">{tr('Filtrar por fondo o forma de pago (opcional)', 'Filter by fund or payment method (optional)')}</summary>
                  <div className="grid gap-4 sm:grid-cols-2 pt-2 pb-3">
                    <Field label={tr('Fondo', 'Fund')}>
                      {(id) => <select id={id} className="ctl" value={fundId} onChange={(e) => setFundId(e.target.value)}><option value="">{tr('Todos', 'All')}</option>{funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
                    </Field>
                    <Field label={tr('Forma de pago', 'Payment method')}>
                      {(id) => <select id={id} className="ctl" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">{tr('Todas', 'All')}</option>{METHODS.map((m) => <option key={m} value={m}>{labels.method(m)}</option>)}</select>}
                    </Field>
                  </div>
                </details>
              )}
            </div>
          </Card>
        )}

        <Card>
          {!ready ? (
            <Empty icon={<UserRound size={28} />} title={type === 'member' ? tr('Elige un miembro para ver su estado', 'Choose a member to see their statement') : tr('Elige las fechas del informe', 'Choose the report dates')} />
          ) : error ? <ErrorNote error={error} /> : !report ? <Spinner /> : (<>
            <div className="flex flex-wrap items-center gap-2.5 mb-6 pb-5 border-b border-line no-print">
              <Button variant="primary" icon={<Download size={18} />} onClick={() => preview({ title: report.title, filename: fileName('pdf'), load: () => api.post<Blob>('/reports/pdf', { ...spec, note: shownNote || undefined }) })}>{tr('Descargar PDF', 'Download PDF')}</Button>
              <Button icon={<Printer size={18} />} onClick={() => window.print()}>{tr('Imprimir', 'Print')}</Button>
              <Button icon={<Mail size={18} />} onClick={() => setEmailing(true)}>{tr('Enviar por correo', 'Send by e-mail')}</Button>
              <span className="hidden sm:block w-px h-8 bg-line mx-1" aria-hidden />
              <Button variant="ghost" icon={<FileSpreadsheet size={18} />} busy={busy === 'csv'} onClick={() => run('csv', () => download('/reports/csv', fileName('csv'), spec))}>Excel</Button>
              {session!.features.ai && (shownNote
                ? <Button variant="ghost" icon={<X size={18} />} onClick={() => setNote(null)}>{tr('Quitar explicación', 'Remove explanation')}</Button>
                : <Button variant="ghost" icon={<Sparkles size={18} />} busy={explaining} onClick={explain}>{tr('Explicar con IA', 'Explain with AI')}</Button>)}
            </div>
            <div className={cx('transition-opacity', isFetching && 'opacity-50')}><ReportView report={report} note={shownNote} /></div>
          </>)}
        </Card>
      </div>

      {report && (
        <EmailComposer
          open={emailing} onClose={() => setEmailing(false)} pickRecipients
          title={tr('Enviar informe por correo', 'Send report by e-mail')}
          intro={type === 'member'
            ? tr('Si eliges a varios miembros, cada uno recibe su propio estado de ofrendas (no el de los demás).', 'If you choose several members, each one receives their own giving statement (not anyone else’s).')
            : tr('El informe se adjunta como PDF.', 'The report is attached as a PDF.')}
          defaultSubject={`${report.title.split(' · ')[0]} · ${session!.org.name}`}
          defaultMessage={reportLang === 'es'
            ? `Hola {nombre}:\n\nTe compartimos el informe adjunto de la tesorería de ${session!.org.name}.\n\nGracias por tu fidelidad y tu generosidad.\n\nBendiciones,\n${session!.user.full_name}`
            : `Hello {name},\n\nPlease find attached the report from the treasury of ${session!.org.name}.\n\nThank you for your faithfulness and generosity.\n\nBlessings,\n${session!.user.full_name}`}
          aiContext={`Attached PDF: "${report.title}" (${report.subtitle})`}
          onSend={(m) => api.post('/reports/email', { spec, lang: reportLang, note: shownNote || undefined, ...m })}
        />
      )}
    </>
  )
}
