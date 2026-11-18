// What each video says. One caption per screenshot taken by capture.mjs, in the same order.
// `click: false` means the cursor points without clicking (the step only asks to look).
export type Lang = 'es' | 'en'
export interface Step { caption: Record<Lang, string>; click?: boolean }
export interface Script { title: Record<Lang, string>; outro: Record<Lang, string>; steps: Step[] }

export const scripts: Record<string, Script> = {
  'registrar-ofrenda': {
    title: { es: 'Cómo registrar una ofrenda', en: 'How to record an offering' },
    outro: {
      es: 'La ofrenda queda guardada y los totales se actualizan solos.',
      en: 'The offering is saved and every total updates on its own.',
    },
    steps: [
      { caption: { es: 'Pulsa el botón naranja «Registrar ofrenda». Está arriba, en todas las pantallas.', en: 'Press the orange “Record offering” button. It is at the top of every screen.' } },
      { caption: { es: 'Escribe el nombre de la persona, o su número de sobre.', en: 'Type the person’s name, or their envelope number.' } },
      { caption: { es: 'Elige a la persona en la lista.', en: 'Choose the person from the list.' } },
      { caption: { es: 'Escribe el monto. Abajo verás su última ofrenda, para comprobar.', en: 'Type the amount. Below you will see their last gift, as a check.' } },
      { caption: { es: 'Elige el fondo: diezmo, ofrenda, misiones… y la forma de pago.', en: 'Choose the fund (tithes, offerings, missions…) and the payment method.' } },
      { caption: { es: 'Pulsa «Guardar».', en: 'Press “Save”.' } },
      { caption: { es: '¡Listo! Un aviso confirma que la ofrenda quedó registrada.', en: 'Done! A message confirms the offering was recorded.' }, click: false },
    ],
  },
  'informe-mensual': {
    title: { es: 'Cómo sacar el informe del mes', en: 'How to get the monthly report' },
    outro: {
      es: 'También puedes imprimirlo o enviarlo por correo desde la misma pantalla.',
      en: 'You can also print it or e-mail it from the same screen.',
    },
    steps: [
      { caption: { es: 'En el menú de la izquierda, entra en «Informes».', en: 'In the menu on the left, open “Reports”.' } },
      { caption: { es: 'Pulsa «Informe del mes pasado». Es el que se presenta a la junta.', en: 'Press “Last month’s report”. It is the one presented to the board.' } },
      { caption: { es: 'Revisa los números en pantalla y pulsa «Descargar PDF».', en: 'Check the numbers on screen and press “Download PDF”.' } },
      { caption: { es: 'Antes de descargar, verás el documento. Revisa que sea el correcto.', en: 'Before downloading, you will see the document. Check it is the right one.' }, click: false },
      { caption: { es: 'Si todo está bien, pulsa «Descargar».', en: 'If everything looks right, press “Download”.' } },
    ],
  },
  'conteo-domingo': {
    title: { es: 'Cómo contar las ofrendas del domingo', en: 'How to count Sunday’s offerings' },
    outro: {
      es: 'Todas las ofrendas del culto quedan registradas, cuadradas y con su hoja para firmar.',
      en: 'Every offering from the service is recorded, balanced and ready to sign.',
    },
    steps: [
      { caption: { es: 'En Inicio, pulsa «Contar el culto de hoy».', en: 'On Home, press “Count today’s service”.' } },
      { caption: { es: 'Elige el culto y escribe la asistencia, si la sabes.', en: 'Choose the service and type the attendance, if you know it.' } },
      { caption: { es: 'Pulsa «Empezar a contar».', en: 'Press “Start counting”.' } },
      { caption: { es: 'Toma un sobre. Escribe el nombre o el número de sobre y elige a la persona.', en: 'Take an envelope. Type the name or envelope number and choose the person.' } },
      { caption: { es: 'Escribe el monto y pulsa Enter. Sigue igual con cada sobre.', en: 'Type the amount and press Enter. Do the same with every envelope.' } },
      { caption: { es: 'Al terminar, cuenta los billetes y monedas en «Cuadre de efectivo».', en: 'When you finish, count the bills and coins under “Cash check”.' }, click: false },
      { caption: { es: '«Todo cuadra»: lo contado coincide con lo anotado.', en: '“Everything balances”: what you counted matches what you entered.' }, click: false },
      { caption: { es: 'Imprime la hoja para que firmen quienes contaron, y pulsa «Cerrar conteo».', en: 'Print the sheet for the counters to sign, then press “Close count”.' } },
    ],
  },
  'nuevo-miembro': {
    title: { es: 'Cómo agregar un miembro nuevo', en: 'How to add a new member' },
    outro: {
      es: 'Desde su tarjeta puedes ver todo lo que ha dado, poner su foto y registrar sus ofrendas.',
      en: 'From their card you can see everything they gave, add a photo and record their offerings.',
    },
    steps: [
      { caption: { es: 'En el menú de la izquierda, entra en «Miembros».', en: 'In the menu on the left, open “Members”.' } },
      { caption: { es: 'Pulsa «Nuevo miembro».', en: 'Press “New member”.' } },
      { caption: { es: 'Escribe su nombre y apellidos.', en: 'Type their first and last name.' }, click: false },
      { caption: { es: 'Añade su teléfono y correo. El correo sirve para enviarle su constancia.', en: 'Add their phone and e-mail. The e-mail is used to send their statement.' }, click: false },
      { caption: { es: 'Si aceptó recibir mensajes de texto, marca esta casilla.', en: 'If they agreed to receive text messages, tick this box.' }, click: false },
      { caption: { es: 'Pulsa «Guardar».', en: 'Press “Save”.' } },
      { caption: { es: '¡Listo! Ya aparece en Miembros, con su propia tarjeta.', en: 'Done! They now appear in Members, with their own card.' }, click: false },
    ],
  },
  'corregir-ofrenda': {
    title: { es: 'Cómo corregir o borrar una ofrenda', en: 'How to fix or delete an offering' },
    outro: {
      es: 'Cada cambio queda anotado en «Actividad», con quién lo hizo y cuándo.',
      en: 'Every change is noted in “Activity”, with who made it and when.',
    },
    steps: [
      { caption: { es: 'En el menú de la izquierda, entra en «Ofrendas».', en: 'In the menu on the left, open “Offerings”.' } },
      { caption: { es: 'Escribe el nombre de la persona para encontrar su ofrenda.', en: 'Type the person’s name to find their offering.' }, click: false },
      { caption: { es: 'Pulsa el lápiz para corregirla.', en: 'Press the pencil to fix it.' } },
      { caption: { es: 'Cambia lo que esté mal: el monto, la fecha, el fondo…', en: 'Change whatever is wrong: the amount, the date, the fund…' }, click: false },
      { caption: { es: 'Pulsa «Guardar».', en: 'Press “Save”.' } },
      { caption: { es: 'Para borrar una ofrenda, pulsa el bote de basura.', en: 'To delete an offering, press the bin.' } },
      { caption: { es: '¿Te equivocaste? Pulsa «Deshacer» en los siguientes 8 segundos.', en: 'Made a mistake? Press “Undo” within 8 seconds.' } },
      { caption: { es: 'La ofrenda vuelve a su lugar, como si nada.', en: 'The offering is back, as if nothing happened.' }, click: false },
    ],
  },
  constancias: {
    title: { es: 'Cómo sacar las constancias de impuestos', en: 'How to get the tax statements' },
    outro: {
      es: 'Entrégalas antes del 31 de enero. También puedes enviarlas por correo con «Enviar a todos».',
      en: 'Hand them out before January 31. You can also e-mail them with “E-mail all”.',
    },
    steps: [
      { caption: { es: 'En el menú de la izquierda, entra en «Impuestos».', en: 'In the menu on the left, open “Taxes”.' } },
      { caption: { es: 'Revisa la lista: lo amarillo es lo que falta completar antes de entregarlas.', en: 'Check the list: anything in yellow still needs completing first.' }, click: false },
      { caption: { es: 'Para la constancia de una sola persona, pulsa «PDF» en su fila.', en: 'For one person’s statement, press “PDF” on their row.' } },
      { caption: { es: 'Verás la constancia antes de descargarla. Pulsa «Descargar».', en: 'You will see the statement before downloading it. Press “Download”.' } },
      { caption: { es: 'Para todas a la vez, pulsa «Descargar todas (PDF)».', en: 'For all of them at once, press “Download all (PDF)”.' } },
      { caption: { es: 'Salen las constancias de todos, una tras otra, listas para imprimir.', en: 'You get everyone’s statements, one after another, ready to print.' }, click: false },
    ],
  },
}
