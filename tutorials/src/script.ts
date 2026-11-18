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
}
