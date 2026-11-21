import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useApp } from '../lib/app'
import { LangToggle, Logo, ThemeToggle } from '../components/Layout'
import { Card, PageHeader } from '../components/ui'

/** Plain-language privacy notice: what Sanctuary keeps, who sees it, and what leaves the server. */
export default function Privacy({ standalone }: { standalone?: boolean }) {
  const { tr, session } = useApp()
  const ai = session?.features.aiConfigured
  const sections: { title: string; body: ReactNode }[] = [
    {
      title: tr('Qué guardamos', 'What we keep'),
      body: <ul className="list-disc pl-5 grid gap-1.5">
        <li>{tr('De los miembros: nombre, datos de contacto que la iglesia decida anotar, fechas (cumpleaños, ingreso), número de sobre, notas y foto opcional.', 'About members: name, the contact details the church chooses to record, dates (birthday, joined), envelope number, notes and an optional photo.')}</li>
        <li>{tr('De las ofrendas: fecha, monto, fondo, forma de pago, número de cheque y notas. De los gastos: a quién se pagó, monto y recibo.', 'About offerings: date, amount, fund, payment method, check number and notes. About expenses: payee, amount and receipt.')}</li>
        <li>{tr('De las personas del equipo: nombre, correo y una contraseña cifrada (nadie, ni siquiera el servidor, puede leerla).', 'About team members: name, e-mail and an encrypted password (no one, not even the server, can read it).')}</li>
        <li>{tr('Un registro de actividad con quién cambió qué y cuándo, incluyendo el valor anterior y el nuevo.', 'An activity log of who changed what and when, including the old and new value.')}</li>
      </ul>,
    },
    {
      title: tr('Quién puede verlo', 'Who can see it'),
      body: <p>{tr('Solo las personas que la iglesia invitó con un código. Cada iglesia ve únicamente sus propios datos. Un miembro con un enlace personal solo ve sus propias ofrendas, y el enlace se puede revocar en cualquier momento.', 'Only the people the church invited with a code. Each church sees only its own data. A member with a personal link sees only their own giving, and the link can be revoked at any time.')}</p>,
    },
    {
      title: tr('Qué sale del servidor', 'What leaves the server'),
      body: <ul className="list-disc pl-5 grid gap-1.5">
        <li>{tr('Correos: solo cuando alguien del equipo envía un informe, una constancia o un enlace, o cuando está activado el informe mensual a la junta.', 'E-mail: only when a team member sends a report, a statement or a link, or when the monthly board report is turned on.')}</li>
        <li>{tr('Mensajes de texto (Twilio): solo a miembros que aceptaron recibirlos.', 'Text messages (Twilio): only to members who agreed to receive them.')}</li>
        <li>{ai
          ? tr('Inteligencia artificial (Google Gemini): cuando usas una función de IA, se envían a Google los datos necesarios para responder (por ejemplo, nombres y montos, o la foto del cuaderno). La iglesia puede apagar la IA en Configuración → IA, correo y SMS.', 'Artificial intelligence (Google Gemini): when you use an AI feature, the data needed to answer (for example names and amounts, or the notebook photo) is sent to Google. The church can turn AI off in Settings → AI, e-mail and SMS.')
          : tr('Inteligencia artificial: no está activada en este servidor, así que no se envía nada.', 'Artificial intelligence: it is not turned on on this server, so nothing is sent.')}</li>
      </ul>,
    },
    {
      title: tr('Seguridad', 'Security'),
      body: <ul className="list-disc pl-5 grid gap-1.5">
        <li>{tr('La sesión se cierra sola tras unos minutos sin actividad (la iglesia elige cuántos).', 'Sessions close by themselves after some minutes without activity (the church chooses how many).')}</li>
        <li>{tr('Los conteos cerrados no se pueden cambiar sin reabrirlos y explicar el motivo.', 'Closed counts cannot be changed without reopening them and giving a reason.')}</li>
        <li>{tr('Se guarda una copia de seguridad automática cada día en el servidor.', 'An automatic backup is kept on the server every day.')}</li>
      </ul>,
    },
    {
      title: tr('Sus derechos', 'Your rights'),
      body: <p>{tr('Cualquier miembro puede pedir a la tesorería ver, corregir o eliminar sus datos. Las ofrendas de años anteriores pueden tener que conservarse por razones fiscales; en ese caso se archivan en lugar de borrarse. La iglesia puede descargar todos sus datos en cualquier momento desde Configuración → Copias de seguridad.', 'Any member can ask the treasury to see, correct or delete their data. Gifts from past years may need to be kept for tax reasons; in that case they are archived instead of deleted. The church can download all of its data at any time from Settings → Backups.')}</p>,
    },
  ]
  const body = (
    <div className="grid gap-4 max-w-3xl">
      {sections.map((s) => <Card key={s.title} title={s.title}><div className="text-ink-soft leading-relaxed">{s.body}</div></Card>)}
    </div>
  )
  if (!standalone) return (<><PageHeader title={tr('Privacidad', 'Privacy')} subtitle={tr('Cómo cuida Sanctuary la información de la iglesia y de sus miembros.', 'How Sanctuary looks after the church’s and its members’ information.')} />{body}</>)
  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-b border-line bg-surface">
        <Link to="/" className="flex items-center gap-2.5"><Logo size={36} /><span className="font-display text-[1.2rem]">Sanctuary</span></Link>
        <div className="flex items-center gap-1.5"><LangToggle /><ThemeToggle /></div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-ink-soft hover:text-ink mb-4"><ArrowLeft size={18} />{tr('Volver', 'Back')}</Link>
        <h1 className="font-display text-[2rem] mb-6">{tr('Privacidad', 'Privacy')}</h1>
        {body}
      </main>
    </div>
  )
}
