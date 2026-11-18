import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList, DatabaseBackup, FileText, HandCoins, Landmark, Pencil, Sparkles, UserPlus, Users } from 'lucide-react'
import { useApp } from '../lib/app'
import { Button, Card, PageHeader, cx } from '../components/ui'

interface Guide { id: string; icon: ReactNode; title: string; when: string; steps: ReactNode[]; to?: string; cta?: string }

function GuideItem({ g, open, onToggle }: { g: Guide; open: boolean; onToggle: () => void }) {
  return (
    <li className="card overflow-hidden">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-4 p-5 text-left hover:bg-raised/50 transition-colors">
        <span className="size-12 rounded-[14px] grid place-items-center bg-accent-soft text-accent-ink shrink-0" aria-hidden>{g.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[1.08rem] leading-snug">{g.title}</span>
          <span className="block text-muted text-[0.92rem]">{g.when}</span>
        </span>
        <ChevronDown size={22} className={cx('text-muted shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="px-5 pb-6 sm:pl-[5.25rem] rise">
          <ol className="grid gap-3">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="size-7 rounded-full bg-ink text-bg grid place-items-center font-bold text-[0.85rem] shrink-0 mt-0.5">{i + 1}</span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
          {g.to && <Link to={g.to} className="inline-block mt-5"><Button variant="primary">{g.cta}</Button></Link>}
        </div>
      )}
    </li>
  )
}

export default function Help() {
  const { tr, session } = useApp()
  const [open, setOpen] = useState<string | null>('domingo')
  const b = (s: string) => <strong className="font-semibold">{s}</strong>

  const guides: Guide[] = [
    {
      id: 'domingo', icon: <ClipboardList size={24} />, title: tr('Anotar las ofrendas del domingo', 'Record Sunday’s offerings'),
      when: tr('Después de cada culto. Es lo que más vas a usar.', 'After every service. This is what you will use most.'),
      to: '/conteos?nuevo=1', cta: tr('Empezar un conteo ahora', 'Start a count now'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Conteos', 'Counts'))} {tr('y pulsa', 'and press')} {b(tr('Nuevo conteo', 'New count'))}. {tr('Elige el culto y escribe la asistencia si la sabes.', 'Choose the service and type the attendance if you know it.')}</>,
        <>{tr('Toma el primer sobre. Escribe el nombre o el número de sobre de la persona; aparecerá en la lista. Pulsa', 'Take the first envelope. Type the person’s name or envelope number; they will appear in the list. Press')} {b('Enter')}.</>,
        <>{tr('Escribe el monto, revisa el fondo (diezmo, ofrenda…) y la forma de pago, y pulsa', 'Type the amount, check the fund (tithe, offering…) and payment method, and press')} {b('Enter')} {tr('otra vez. Listo, sigue con el siguiente sobre.', 'again. Done, move on to the next envelope.')}</>,
        <>{tr('El dinero suelto del plato, sin nombre, se anota dejando el nombre vacío: queda como', 'Loose cash from the plate, with no name, is entered by leaving the name empty: it is saved as')} {b(tr('ofrenda suelta', 'loose offering'))}.</>,
        <>{tr('Al terminar, cuenta los billetes y monedas en', 'When you finish, count the bills and coins in')} {b(tr('Cuadre de efectivo', 'Cash check'))}. {tr('Si dice', 'If it says')} {b(tr('Todo cuadra', 'Everything balances'))}, {tr('¡perfecto! Si no, te dice cuánto sobra o falta.', 'perfect! If not, it tells you how much is over or short.')}</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Imprimir hoja', 'Print sheet'))} {tr('para tener la hoja firmada por las dos personas que contaron, y luego', 'to get the sheet signed by the two people who counted, and then')} {b(tr('Cerrar conteo', 'Close count'))}.</>,
      ],
    },
    {
      id: 'una', icon: <HandCoins size={24} />, title: tr('Anotar una sola ofrenda', 'Record a single offering'),
      when: tr('Una transferencia, un cheque que llegó entre semana…', 'A transfer, a check that came mid-week…'),
      steps: [
        <>{tr('Pulsa el botón naranja', 'Press the orange button')} {b(tr('Registrar ofrenda', 'Record offering'))}{tr(', arriba a la derecha. Está en todas las pantallas.', ', top right. It is on every screen.')}</>,
        <>{tr('Escribe quién la da, el monto y la fecha, elige el fondo y la forma de pago, y pulsa', 'Type who is giving, the amount and the date, choose the fund and payment method, and press')} {b(tr('Guardar', 'Save'))}.</>,
        <>{tr('Si alguien no está en la lista, escribe su nombre y elige', 'If someone is not on the list, type their name and choose')} {b(tr('Agregar como miembro nuevo', 'Add as a new member'))}.</>,
      ],
    },
    {
      id: 'error', icon: <Pencil size={24} />, title: tr('Me equivoqué: corregir o borrar', 'I made a mistake: fix or delete'),
      when: tr('No te preocupes: todo se puede corregir.', 'Don’t worry: everything can be fixed.'),
      to: '/ofrendas', cta: tr('Ir a Ofrendas', 'Go to Offerings'),
      steps: [
        <>{tr('Busca la ofrenda en', 'Find the offering in')} {b(tr('Ofrendas', 'Offerings'))} {tr('(puedes buscar por nombre) o dentro del conteo del día.', '(you can search by name) or inside that day’s count.')}</>,
        <>{tr('Pulsa el lápiz ✏️ para cambiarla, o el bote 🗑️ para borrarla.', 'Press the pencil ✏️ to change it, or the bin 🗑️ to delete it.')}</>,
        <>{tr('¿Borraste la que no era? Pulsa', 'Deleted the wrong one? Press')} {b(tr('Deshacer', 'Undo'))} {tr('en el aviso que aparece abajo, en los siguientes 8 segundos.', 'in the message that appears at the bottom, within 8 seconds.')}</>,
        <>{tr('Todo cambio queda anotado en', 'Every change is noted in')} {b(tr('Actividad', 'Activity'))}{tr(', con quién lo hizo y cuándo.', ', with who did it and when.')}</>,
      ],
    },
    {
      id: 'junta', icon: <FileText size={24} />, title: tr('Preparar el informe para la junta', 'Prepare the report for the board'),
      when: tr('Una vez al mes, o cuando el pastor lo pida.', 'Once a month, or whenever the pastor asks.'),
      to: '/informes?preset=mes', cta: tr('Abrir el informe del mes pasado', 'Open last month’s report'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Informes', 'Reports'))} {tr('y pulsa', 'and press')} {b(tr('Informe del mes pasado', 'Last month’s report'))}.</>,
        <>{tr('Revisa los números en pantalla. Puedes cambiar el periodo o elegir otro tipo de informe.', 'Check the numbers on screen. You can change the period or choose another kind of report.')}</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Imprimir', 'Print'))}, {b(tr('Descargar PDF', 'Download PDF'))} {tr('o', 'or')} {b(tr('Enviar por correo', 'Send by e-mail'))}.</>,
        ...(session?.features.ai ? [<>{tr('Opcional: pulsa', 'Optional: press')} {b(tr('Explicar con IA', 'Explain with AI'))} {tr('para añadir un resumen en palabras sencillas.', 'to add a summary in plain words.')}</>] : []),
      ],
    },
    {
      id: 'impuestos', icon: <Landmark size={24} />, title: tr('Entregar las constancias para impuestos', 'Hand out the tax statements'),
      when: tr('En enero, antes del día 31.', 'In January, before the 31st.'),
      to: '/impuestos', cta: tr('Ir a Impuestos', 'Go to Taxes'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Impuestos', 'Taxes'))} {tr('y elige el año que terminó.', 'and choose the year that just ended.')}</>,
        <>{tr('Revisa la lista', 'Check the list')} {b(tr('Antes de entregar las constancias', 'Before handing out statements'))}{tr(': completa lo que esté en amarillo (dirección de la iglesia, número fiscal, direcciones de miembros).', ': complete anything in yellow (church address, tax ID, members’ addresses).')}</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Enviar a todos', 'E-mail all'))} {tr('para mandarlas por correo, y', 'to send them by e-mail, and')} {b(tr('Descargar todas (PDF)', 'Download all (PDF)'))} {tr('para imprimir las de quienes no tienen correo.', 'to print the ones for people without e-mail.')}</>,
      ],
    },
    {
      id: 'miembro', icon: <Users size={24} />, title: tr('Agregar o actualizar a un miembro', 'Add or update a member'),
      when: tr('Cuando llega alguien nuevo o cambia de dirección.', 'When someone new arrives or moves.'),
      to: '/miembros', cta: tr('Ir a Miembros', 'Go to Members'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Miembros', 'Members'))} {tr('y pulsa', 'and press')} {b(tr('Nuevo miembro', 'New member'))}{tr(', o abre su tarjeta y pulsa', ', or open their card and press')} {b(tr('Editar', 'Edit'))}.</>,
        <>{tr('El correo y la dirección son importantes: se usan para enviarle su constancia de impuestos.', 'The e-mail and address matter: they are used to send their tax statement.')}</>,
        <>{tr('Para poner su foto, pulsa la cámara 📷 junto a su foto en su perfil.', 'To add their photo, press the camera 📷 next to their picture on their profile.')}</>,
      ],
    },
    {
      id: 'equipo', icon: <UserPlus size={24} />, title: tr('Dar acceso a otra persona del equipo', 'Give another team member access'),
      when: tr('Por ejemplo, a quien te ayuda a contar.', 'For example, whoever helps you count.'),
      to: '/configuracion?tab=equipo', cta: tr('Crear una invitación', 'Create an invitation'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Configuración → Equipo e invitaciones', 'Settings → Team & invitations'))} {tr('y pulsa', 'and press')} {b(tr('Crear código', 'Create code'))}.</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Copiar enlace', 'Copy link'))} {tr('y envíaselo por WhatsApp o correo. Al abrirlo, crea su cuenta y entra directamente a tu iglesia.', 'and send it by WhatsApp or e-mail. When they open it, they create their account and join your church directly.')}</>,
        <>{tr('Todos en el equipo pueden ver y cambiar todo. Si alguien deja de ayudar, quítale el acceso desde la misma pantalla.', 'Everyone on the team can see and change everything. If someone stops helping, remove their access from the same screen.')}</>,
      ],
    },
    {
      id: 'respaldo', icon: <DatabaseBackup size={24} />, title: tr('Guardar una copia de seguridad', 'Keep a backup'),
      when: tr('Una vez al mes es buena costumbre.', 'Once a month is a good habit.'),
      to: '/configuracion?tab=datos', cta: tr('Ir a Importar y respaldar', 'Go to Import & backup'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Configuración → Importar y respaldar', 'Settings → Import & backup'))} {tr('y pulsa', 'and press')} {b(tr('Copia completa', 'Full backup'))}.</>,
        <>{tr('Guarda el archivo en una memoria USB o en la nube (Google Drive, OneDrive…).', 'Save the file on a USB drive or in the cloud (Google Drive, OneDrive…).')}</>,
      ],
    },
    ...(session?.features.ai ? [{
      id: 'ia', icon: <Sparkles size={24} />, title: tr('Preguntarle al asistente', 'Ask the assistant'),
      when: tr('Cuando quieras saber algo y no sepas dónde buscarlo.', 'When you want to know something and don’t know where to look.'),
      to: '/asistente', cta: tr('Abrir el asistente', 'Open the assistant'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Asistente', 'Assistant'))} {tr('y escribe tu pregunta con tus propias palabras, como se la harías a una persona.', 'and type your question in your own words, as you would ask a person.')}</>,
        <>{tr('Ejemplos: «¿Cuánto entró de diezmos en octubre?», «¿Quién no ha ofrendado en dos meses?».', 'Examples: “How much came in as tithes in October?”, “Who hasn’t given in two months?”.')}</>,
        <>{tr('Las cifras importantes, confírmalas siempre en Informes.', 'Always double-check important figures in Reports.')}</>,
      ],
    } as Guide] : []),
  ]

  const words: [string, string][] = [
    [tr('Fondo', 'Fund'), tr('El propósito del dinero: diezmos, ofrendas, misiones, construcción… Se configuran en Configuración → Fondos.', 'What the money is for: tithes, offerings, missions, building… Set them up in Settings → Funds.')],
    [tr('Conteo', 'Count'), tr('Todas las ofrendas de un culto juntas, con su cuadre de efectivo y hoja para firmar.', 'All the offerings from one service together, with its cash check and a sheet to sign.')],
    [tr('Ofrenda suelta', 'Loose offering'), tr('Dinero sin nombre, como el del plato. Cuenta en los totales, pero no aparece en ninguna constancia.', 'Money with no name, like the plate. It counts in the totals but appears on no statement.')],
    [tr('Constancia', 'Statement'), tr('El documento anual que cada miembro usa para deducir sus ofrendas en los impuestos.', 'The yearly document each member uses to deduct their giving on their taxes.')],
    [tr('Deducible', 'Deductible'), tr('Lo que se puede restar de los impuestos. Una venta de comida, por ejemplo, no lo es.', 'What can be subtracted on taxes. A food sale, for example, is not.')],
  ]

  return (
    <>
      <PageHeader title={tr('Ayuda', 'Help')} subtitle={tr('Guías cortas, paso a paso, para lo que haces en la tesorería. Toca una para abrirla.', 'Short step-by-step guides for what you do in the treasury. Tap one to open it.')} />
      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_24rem] gap-5 items-start">
        <ul className="grid gap-3">
          {guides.map((g) => <GuideItem key={g.id} g={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} />)}
        </ul>
        <Card title={tr('Palabras que verás', 'Words you will see')}>
          <dl className="grid gap-4">
            {words.map(([w, d]) => (
              <div key={w}>
                <dt className="font-semibold">{w}</dt>
                <dd className="text-ink-soft">{d}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  )
}
