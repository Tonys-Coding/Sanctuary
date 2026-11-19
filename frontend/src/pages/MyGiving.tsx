import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, HeartHandshake } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useErrorText, useLabels } from '../lib/labels'
import { LangToggle, Logo, ThemeToggle } from '../components/Layout'
import { Card, Empty, Spinner } from '../components/ui'

interface Giving {
  church: string; currency: string; name: string; first_name: string; year: number; years: number[]; total: number
  byFund: { fund: string; total: number }[]
  gifts: { date: string; fund: string; method: string; amount: number }[]
}

/** What a member sees when they open their personal link: their own giving and their statement. No account needed. */
export default function MyGiving() {
  const { token = '' } = useParams()
  const { tr, date, lang } = useApp()
  const labels = useLabels()
  const errorText = useErrorText()
  const [year, setYear] = useState<number | undefined>()
  const { data, error, isPending } = useQuery({
    queryKey: ['my-giving', token, year],
    queryFn: () => api.get<Giving>(`/public/giving/${encodeURIComponent(token)}${year ? `?year=${year}` : ''}`),
    retry: false, placeholderData: (p) => p,
  })
  const money = (n: number) => new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: data?.currency || 'USD' }).format(n)
  const max = Math.max(1, ...(data?.byFund.map((f) => f.total) || [1]))

  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b border-line bg-surface">
        <div className="flex items-center gap-2.5 min-w-0"><Logo size={36} /><span className="font-display text-[1.2rem] truncate">{data?.church || 'Sanctuary'}</span></div>
        <div className="flex items-center gap-1.5"><LangToggle /><ThemeToggle /></div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 grid gap-5">
        {isPending ? <Spinner /> : error || !data ? (
          <Card><Empty icon={<HeartHandshake size={28} />} title={tr('No pudimos abrir esta página', 'We could not open this page')}>{errorText(error)}</Empty></Card>
        ) : (<>
          <div>
            <h1 className="font-display text-[2rem] leading-tight">{tr(`Hola, ${data.first_name}`, `Hello, ${data.first_name}`)}</h1>
            <p className="text-ink-soft mt-1">{tr('Gracias por tu fidelidad. Aquí puedes ver tus diezmos y ofrendas y descargar tu constancia.', 'Thank you for your faithfulness. Here you can see your tithes and offerings and download your statement.')}</p>
          </div>
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <label className="text-muted flex items-center gap-2">{tr('Año', 'Year')}
                  <select className="ctl !w-auto !min-h-10" value={data.year} onChange={(e) => setYear(Number(e.target.value))}>{data.years.map((y) => <option key={y}>{y}</option>)}</select>
                </label>
                <p className="text-[2.3rem] font-bold leading-tight mt-2">{money(data.total)}</p>
                <p className="text-muted">{tr(`en ${data.gifts.length} ofrendas`, `in ${data.gifts.length} gifts`)}</p>
              </div>
              {data.total > 0 && (
                <a href={`/api/public/giving/${encodeURIComponent(token)}/statement.pdf?year=${data.year}&lang=${lang}&download=1`}
                  className="inline-flex items-center gap-2 min-h-12 px-5 rounded-[11px] bg-accent text-on-accent font-semibold hover:bg-accent-hover">
                  <Download size={19} aria-hidden />{tr(`Constancia ${data.year} (PDF)`, `${data.year} statement (PDF)`)}
                </a>
              )}
            </div>
            {data.byFund.length > 0 && (
              <ul className="grid gap-3 mt-6">
                {data.byFund.map((f) => (
                  <li key={f.fund}>
                    <div className="flex justify-between"><span>{f.fund}</span><span className="font-semibold">{money(f.total)}</span></div>
                    <div className="h-2.5 rounded-full bg-raised mt-1 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${(f.total / max) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card pad={false} title={tr('Detalle', 'Detail')}>
            {data.gifts.length === 0 ? <p className="text-muted p-6">{tr('No hay ofrendas registradas en este año.', 'No gifts recorded this year.')}</p> : (
              <ul className="mt-3 border-t border-line">
                {data.gifts.map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-line last:border-0">
                    <span><span className="block font-medium">{g.fund}</span><span className="text-muted text-[0.88rem]">{date(g.date)} · {labels.method(g.method)}</span></span>
                    <span className="font-semibold">{money(g.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-muted text-[0.88rem] text-center">{tr('Este enlace es personal. Si ves algún error, habla con la tesorería de tu iglesia.', 'This link is personal. If you see a mistake, talk to your church treasury.')}</p>
        </>)}
      </main>
    </div>
  )
}
