import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Copy, Printer, RotateCcw, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useErrorText } from '../lib/labels'
import { Button, Card, IconButton, PageHeader, cx, useFeedback } from '../components/ui'

interface Msg { role: 'user' | 'assistant'; text: string; error?: boolean }

export default function Assistant() {
  const { tr, session } = useApp()
  const errorText = useErrorText()
  const { toast } = useFeedback()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState<number | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [msgs, busy])

  const ask = async (question: string) => {
    const qn = question.trim()
    if (!qn || busy) return
    const history = [...msgs.filter((m) => !m.error), { role: 'user' as const, text: qn }]
    setMsgs(history); setText(''); setBusy(true)
    try {
      const r = await api.post<{ text: string }>('/ai/chat', { messages: history.slice(-20) })
      setMsgs([...history, { role: 'assistant', text: r.text }])
    } catch (e) {
      setMsgs([...history, { role: 'assistant', text: errorText(e), error: true }])
    } finally { setBusy(false) }
  }
  // Prints a single answer as a one-page report.
  const print = (i: number) => { setPrinting(i); setTimeout(() => { window.print(); setPrinting(null) }, 60) }

  const ideas = [
    tr('¿Cómo vamos este año comparado con el año pasado?', 'How are we doing this year compared with last year?'),
    tr('Hazme un informe de los diezmos de los últimos 3 meses, mes por mes.', 'Give me a report of tithes for the last 3 months, month by month.'),
    tr('¿Qué miembros activos no han ofrendado en los últimos 2 meses?', 'Which active members have not given in the last 2 months?'),
    tr('¿Cuál fue el domingo con más ofrendas este año?', 'Which Sunday had the most giving this year?'),
    tr('Explícame qué necesito para entregar las constancias de impuestos.', 'Explain what I need to hand out the tax statements.'),
    tr('¿Cuánto falta para la meta de construcción y a qué ritmo vamos?', 'How far are we from the building goal, and at what pace?'),
  ]

  if (!session!.features.ai) {
    return (<>
      <PageHeader title={tr('Asistente', 'Assistant')} />
      <Card className="max-w-2xl">
        <div className="inline-grid place-items-center size-14 rounded-full bg-accent-soft text-accent-ink mb-4"><Sparkles size={28} /></div>
        <h2 className="font-semibold text-[1.2rem]">{tr('El asistente está listo; solo falta activarlo', 'The assistant is ready; it just needs switching on')}</h2>
        <p className="text-ink-soft mt-2">{tr('Con la inteligencia artificial de Google Gemini, Sanctuary puede responder preguntas sobre las ofrendas, preparar informes a pedido, resumir cómo va el mes y redactar correos. Para activarlo, quien administra el servidor debe:', 'With Google Gemini AI, Sanctuary can answer questions about giving, prepare reports on request, summarise how the month is going and draft e-mails. To switch it on, whoever runs the server needs to:')}</p>
        <ol className="list-decimal pl-6 mt-4 grid gap-2 text-ink-soft">
          <li>{tr('Conseguir una clave gratuita en', 'Get a free key at')} <span className="font-semibold text-ink">aistudio.google.com/apikey</span></li>
          <li>{tr('Abrir el archivo', 'Open the file')} <code className="bg-raised px-1.5 py-0.5 rounded">backend/.env</code> {tr('y pegarla después de', 'and paste it after')} <code className="bg-raised px-1.5 py-0.5 rounded">GEMINI_API_KEY=</code></li>
          <li>{tr('Reiniciar el servidor.', 'Restart the server.')}</li>
        </ol>
      </Card>
    </>)
  }

  return (
    <div className="flex flex-col min-h-[calc(100dvh-68px-4.5rem)]">
      <div className={cx(printing !== null && 'no-print')}>
        <PageHeader title={tr('Asistente', 'Assistant')} subtitle={tr('Pregunta con tus propias palabras. El asistente consulta los registros de la iglesia y te responde con números reales.', 'Ask in your own words. The assistant looks at the church records and answers with real numbers.')}>
          {msgs.length > 0 && <Button icon={<RotateCcw size={18} />} onClick={() => setMsgs([])}>{tr('Empezar de nuevo', 'Start over')}</Button>}
        </PageHeader>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto">
        {msgs.length === 0 ? (
          <div className="no-print">
            <p className="text-muted mb-3">{tr('Algunas ideas para empezar:', 'Some ideas to get started:')}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {ideas.map((q) => (
                <button key={q} type="button" onClick={() => ask(q)} className="card text-left p-4 hover:border-accent hover:bg-accent-soft/40 transition-colors">{q}</button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="grid gap-5">
            {msgs.map((m, i) => m.role === 'user' ? (
              <li key={i} className={cx('justify-self-end max-w-[85%] bg-raised rounded-[16px] rounded-br-[4px] px-4 py-3 whitespace-pre-wrap', 'no-print')}>{m.text}</li>
            ) : (
              <li key={i} className={cx('card p-5', m.error && 'border-bad text-bad', printing !== null && printing !== i && 'no-print')}>
                {m.error ? m.text : (<>
                  <div className="prose-ai"><Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown></div>
                  <div className="flex gap-1 mt-3 -mb-2 -ml-2 no-print">
                    <IconButton label={tr('Copiar', 'Copy')} onClick={() => navigator.clipboard.writeText(m.text).then(() => toast(tr('Copiado', 'Copied')))}><Copy size={17} /></IconButton>
                    <IconButton label={tr('Imprimir esta respuesta', 'Print this answer')} onClick={() => print(i)}><Printer size={17} /></IconButton>
                  </div>
                </>)}
              </li>
            ))}
            {busy && <li className="card p-5 flex items-center gap-3 text-muted" role="status"><Sparkles size={18} className="animate-[pulse-soft_1.2s_ease-in-out_infinite] text-accent-ink" />{tr('Consultando los registros…', 'Looking through the records…')}</li>}
          </ol>
        )}
        <div ref={end} className="h-4" />
      </div>

      <form className="sticky bottom-0 w-full max-w-3xl mx-auto pt-3 pb-4 bg-bg no-print" onSubmit={(e) => { e.preventDefault(); ask(text) }}>
        <div className="relative">
          <textarea className="ctl !pr-16 !min-h-[60px] !py-4" rows={1} placeholder={tr('Escribe tu pregunta…', 'Type your question…')} aria-label={tr('Tu pregunta', 'Your question')} value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text) } }} />
          <button type="submit" disabled={busy || !text.trim()} aria-label={tr('Enviar', 'Send')} className="absolute right-2.5 bottom-2.5 size-11 rounded-full bg-accent text-on-accent grid place-items-center disabled:opacity-40 hover:bg-accent-hover transition-colors"><ArrowUp size={22} /></button>
        </div>
        <p className="text-muted text-[0.82rem] mt-2">{tr('Para responder, los datos necesarios se envían a Google Gemini. Revisa siempre las cifras importantes en Informes.', 'To answer, the necessary data is sent to Google Gemini. Always double-check important figures in Reports.')}</p>
      </form>
    </div>
  )
}
