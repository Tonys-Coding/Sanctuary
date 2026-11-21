import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList, CloudOff, DatabaseBackup, Link2, PiggyBank, Receipt, Scale, Upload, FileText, HandCoins, Landmark, MessageSquareText, Pencil, PlayCircle, Sparkles, UserPlus, Users } from 'lucide-react'
import { useApp } from '../lib/app'
import { Button, Card, PageHeader, cx } from '../components/ui'

interface Guide { id: string; icon: ReactNode; title: string; when: string; steps: ReactNode[]; to?: string; cta?: string }

/** Short tutorial videos (made with Remotion from real screens of the app; see /tutorials). */
function Videos() {
  const { tr, lang } = useApp()
  const videos = [
    { id: 'registrar-ofrenda', title: tr('Cómo registrar una ofrenda', 'How to record an offering'), text: tr('Del botón naranja a «Guardar», en 7 pasos.', 'From the orange button to “Save”, in 7 steps.'), length: '0:46' },
    { id: 'conteo-domingo', title: tr('Cómo contar las ofrendas del domingo', 'How to count Sunday’s offerings'), text: tr('Todos los sobres de un culto, el cuadre de efectivo y la hoja para firmar.', 'Every envelope from a service, the cash check and the sheet to sign.'), length: '0:52' },
    { id: 'corregir-ofrenda', title: tr('Cómo corregir o borrar una ofrenda', 'How to fix or delete an offering'), text: tr('Buscarla, cambiarla, borrarla… y deshacerlo si te equivocas.', 'Find it, change it, delete it… and undo if you slip.'), length: '0:52' },
    { id: 'nuevo-miembro', title: tr('Cómo agregar un miembro nuevo', 'How to add a new member'), text: tr('Sus datos, su correo para la constancia y el permiso para mensajes.', 'Their details, e-mail for statements and text-message consent.'), length: '0:46' },
    { id: 'informe-mensual', title: tr('Cómo sacar el informe del mes', 'How to get the monthly report'), text: tr('Para la junta: verlo, revisarlo y descargarlo.', 'For the board: open it, check it and download it.'), length: '0:35' },
    { id: 'constancias', title: tr('Cómo sacar las constancias de impuestos', 'How to get the tax statements'), text: tr('Revisar lo que falta y descargar una o todas.', 'Check what is missing and download one or all.'), length: '0:41' },
  ]
  return (
    <section aria-labelledby="videos" className="mb-6">
      <h2 id="videos" className="font-semibold text-[1.15rem] mb-3 flex items-center gap-2"><PlayCircle size={22} className="text-accent-ink" aria-hidden />{tr('Videotutoriales', 'Video tutorials')}</h2>
      <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-5">
        {videos.map((v) => (
          <article key={v.id} className="card overflow-hidden">
            <video key={`${v.id}-${lang}`} controls preload="none" playsInline className="w-full aspect-video bg-ink block"
              poster={`/tutorials/${v.id}.${lang}.jpg`} aria-label={v.title}>
              <source src={`/tutorials/${v.id}.${lang}.mp4`} type="video/mp4" />
            </video>
            <div className="p-5">
              <h3 className="font-semibold text-[1.08rem] flex items-baseline justify-between gap-3">{v.title}<span className="text-muted text-[0.85rem] font-normal shrink-0">{v.length}</span></h3>
              <p className="text-muted">{v.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

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
      id: 'respaldo', icon: <DatabaseBackup size={24} />, title: tr('Copias de seguridad y cómo regresar a una', 'Backups and how to go back to one'),
      when: tr('Sanctuary guarda una copia cada día; tú puedes guardar otras cuando quieras.', 'Sanctuary keeps a copy every day; you can keep more whenever you like.'),
      to: '/configuracion?tab=respaldo', cta: tr('Ir a Copias de seguridad', 'Go to Backups'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Configuración → Copias de seguridad', 'Settings → Backups'))}. {tr('Ahí', 'There')} {tr('verás las copias automáticas de cada día.', 'you will see the automatic daily copies.')}</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Crear copia ahora', 'Back up now'))} {tr('antes de un cambio grande, o', 'before a big change, or')} {b(tr('Descargar', 'Download'))} {tr('para guardarla en una memoria USB o en la nube.', 'to keep it on a USB drive or in the cloud.')}</>,
        <>{tr('Si algo salió mal, pulsa', 'If something went wrong, press')} {b(tr('Volver a esta copia', 'Restore this copy'))} {tr('y escribe RESTAURAR. Antes de hacerlo, Sanctuary guarda una copia de lo que hay ahora.', 'and type RESTORE. Before doing it, Sanctuary saves a copy of what is there now.')}</>,
      ],
    },
    {
      id: 'deposito', icon: <PiggyBank size={24} />, title: tr('Llevar el dinero al banco', 'Take the money to the bank'),
      when: tr('Después de cerrar uno o varios conteos.', 'After closing one or more counts.'),
      to: '/depositos', cta: tr('Ir a Depósitos', 'Go to Deposits'),
      steps: [
        <>{tr('Cierra el conteo del culto (botón', 'Close the service count (the')} {b(tr('Cerrar conteo', 'Close count'))}{tr('). Un conteo cerrado queda protegido: para cambiarlo hay que reabrirlo y explicar por qué.', ' button). A closed count is protected: to change it you must reopen it and explain why.')}</>,
        <>{tr('Ve a', 'Go to')} {b(tr('Depósitos', 'Deposits'))}, {tr('pulsa', 'press')} {b(tr('Nuevo depósito', 'New deposit'))} {tr('y elige los conteos que llevas.', 'and choose the counts you are taking.')}</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Hoja para el banco', 'Bank slip'))}: {tr('trae el efectivo por billete y cada cheque. Imprímela y llévala con el dinero.', 'it lists cash by bill and each check. Print it and take it with the money.')}</>,
        <>{tr('Al volver, pulsa', 'When you are back, press')} {b(tr('Ya lo llevé al banco', 'I took it to the bank'))}. {tr('Cuando llegue el estado de cuenta, escribe lo que registró el banco y pulsa', 'When the bank statement arrives, enter what the bank recorded and press')} {b(tr('Marcar como conciliado', 'Mark as reconciled'))}.</>,
      ],
    },
    {
      id: 'gastos', icon: <Receipt size={24} />, title: tr('Registrar un gasto y su recibo', 'Record an expense and its receipt'),
      when: tr('Cada vez que la iglesia paga algo.', 'Every time the church pays for something.'),
      to: '/gastos', cta: tr('Ir a Gastos', 'Go to Expenses'),
      steps: [
        <>{tr('Ve a', 'Go to')} {b(tr('Gastos y presupuesto', 'Expenses & budget'))} {tr('y pulsa', 'and press')} {b(tr('Registrar gasto', 'Record expense'))}.</>,
        <>{tr('Escribe a quién se pagó, el monto y la categoría. Si ya le pagaste antes, Sanctuary recuerda su categoría.', 'Enter who was paid, the amount and the category. If you paid them before, Sanctuary remembers the category.')}</>,
        <>{tr('En', 'Under')} {b(tr('Recibo o factura', 'Receipt or invoice'))} {tr('toma una foto del recibo con el teléfono o sube el PDF.', 'take a photo of the receipt with your phone or upload the PDF.')}</>,
        <>{tr('En la pestaña', 'On the')} {b(tr('Presupuesto', 'Budget'))} {tr('escribe cuánto planean gastar en el año y verás cuánto queda en cada categoría.', 'tab, enter how much you plan to spend this year and you will see what is left in each category.')}</>,
      ],
    },
    {
      id: 'tesoreria', icon: <Scale size={24} />, title: tr('El informe de tesorería del mes', 'The monthly treasurer’s report'),
      when: tr('Saldo inicial, ingresos, gastos y saldo final, listo para la junta.', 'Opening balance, income, expenses and closing balance, ready for the board.'),
      to: '/informes?preset=tesoreria', cta: tr('Ver el informe del mes pasado', 'See last month’s report'),
      steps: [
        <>{tr('Una sola vez: en', 'Once: in')} {b(tr('Configuración → Finanzas', 'Settings → Finances'))} {tr('anota cuánto había en el banco el día que empezaron a usar Sanctuary.', 'enter how much was in the bank the day you started using Sanctuary.')}</>,
        <>{tr('Ve a', 'Go to')} {b(tr('Informes', 'Reports'))} {tr('y pulsa', 'and press')} {b(tr('Tesorería del mes pasado', 'Last month’s treasury'))}.</>,
        <>{tr('Para que llegue solo a la junta cada mes, activa', 'To have it reach the board by itself each month, turn on')} {b(tr('Informe mensual a la junta', 'Monthly report to the board'))} {tr('en Configuración → Finanzas.', 'in Settings → Finances.')}</>,
      ],
    },
    {
      id: 'enlinea', icon: <Upload size={24} />, title: tr('Agregar las ofrendas de Zelle y en línea', 'Add Zelle and online gifts'),
      when: tr('Una vez al mes, con el archivo del banco o del servicio de ofrendas.', 'Once a month, with the file from the bank or giving service.'),
      to: '/configuracion?tab=datos', cta: tr('Ir a Importar datos', 'Go to Import data'),
      steps: [
        <>{tr('En el sitio del banco (o de Tithe.ly, Square, PayPal) busca', 'On the bank’s site (or Tithe.ly, Square, PayPal) look for')} {b(tr('Exportar / Descargar actividad', 'Export / Download activity'))} {tr('y guarda el archivo CSV.', 'and save the CSV file.')}</>,
        <>{tr('En', 'In')} {b(tr('Configuración → Importar datos', 'Settings → Import data'))} {tr('pulsa', 'press')} {b(tr('Importar archivo de donaciones', 'Import a giving file'))}.</>,
        <>{tr('Revisa la lista: cada donación ya viene unida a su miembro cuando el nombre o el correo coinciden. Corrige las que falten y pulsa', 'Check the list: each gift is already matched to its member when the name or e-mail matches. Fix the rest and press')} {b(tr('Importar', 'Import'))}. {tr('Si subes el mismo archivo dos veces, no se repite nada.', 'If you upload the same file twice, nothing is repeated.')}</>,
      ],
    },
    {
      id: 'sinconexion', icon: <CloudOff size={24} />, title: tr('Si se va el internet durante el conteo', 'If the internet drops during a count'),
      when: tr('Puedes seguir anotando: nada se pierde.', 'You can keep entering: nothing is lost.'),
      steps: [
        <>{tr('Aparecerá un aviso amarillo de', 'A yellow notice saying')} {b(tr('Sin conexión', 'No connection'))}. {tr('Sigue registrando las ofrendas como siempre.', 'Keep recording offerings as usual.')}</>,
        <>{tr('Se guardan en esta computadora y se envían solas cuando vuelve el internet. No cierres el navegador ni borres su historial mientras tanto.', 'They are kept on this computer and sent automatically when the internet is back. Do not clear the browser’s data in the meantime.')}</>,
      ],
    },
    {
      id: 'enlace', icon: <Link2 size={24} />, title: tr('Que un miembro vea sus propias ofrendas', 'Let a member see their own giving'),
      when: tr('Para que descargue su constancia sin pedírtela.', 'So they can download their statement without asking you.'),
      to: '/miembros', cta: tr('Ir a Miembros', 'Go to Members'),
      steps: [
        <>{tr('Abre la ficha del miembro y busca', 'Open the member’s page and find')} {b(tr('Enlace personal', 'Personal link'))}.</>,
        <>{tr('Pulsa', 'Press')} {b(tr('Enviar por correo', 'Send by e-mail'))} {tr('o', 'or')} {b(tr('Enviar por SMS', 'Send by text'))}, {tr('o crea el enlace y cópialo para mandarlo por WhatsApp.', 'or create the link and copy it to send by WhatsApp.')}</>,
        <>{tr('La persona lo abre en su teléfono, sin contraseña. Puedes desactivarlo cuando quieras.', 'They open it on their phone, with no password. You can turn it off at any time.')}</>,
      ],
    },
    {
      id: 'sms', icon: <MessageSquareText size={24} />, title: tr('Enviar un mensaje de texto (SMS)', 'Send a text message (SMS)'),
      when: tr('Recordatorios, avisos y felicitaciones de cumpleaños.', 'Reminders, notices and birthday greetings.'),
      to: '/mensajes', cta: tr('Ir a Mensajes', 'Go to Messages'),
      steps: [
        <>{tr('Primero, en cada miembro, marca', 'First, on each member, tick')} {b(tr('«Acepta recibir mensajes de texto»', '“Agrees to receive text messages”'))} {tr('si la persona lo autorizó. Sin eso no se le envía nada.', 'if the person said yes. Without it, nothing is sent to them.')}</>,
        <>{tr('Ve a', 'Go to')} {b(tr('Mensajes', 'Messages'))} {tr('y pulsa', 'and press')} {b(tr('Nuevo mensaje', 'New message'))}. {tr('Elige a quién, escribe el mensaje (o usa una plantilla) y mira cómo se verá.', 'Choose who, write the message (or use a template) and see how it will look.')}</>,
        <>{tr('Elige', 'Choose')} {b(tr('Enviar ahora', 'Send now'))} {tr('o', 'or')} {b(tr('Programar para después', 'Schedule for later'))} {tr('con día y hora. Los programados se pueden cancelar.', 'with a day and time. Scheduled ones can be cancelled.')}</>,
        <>{tr('En', 'On')} {b(tr('Inicio → Celebraciones', 'Home → Celebrations'))} {tr('aparece el botón', 'there is a')} {b(tr('Felicitar', 'Greet'))} {tr('junto a cada cumpleaños. También puedes activar las felicitaciones automáticas en Mensajes.', 'button next to each birthday. You can also turn on automatic greetings in Messages.')}</>,
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
      <Videos />
      <h2 className="font-semibold text-[1.15rem] mb-3">{tr('Guías paso a paso', 'Step-by-step guides')}</h2>
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
