import { useApp } from './app'
import { ApiError } from './api'
import type { Method } from './types'

export const METHODS: Method[] = ['cash', 'check', 'card', 'transfer', 'other']

/** Translated names for the fixed vocabularies (payment methods, roles, months…). */
export function useLabels() {
  const { tr, lang } = useApp()
  const locale = lang === 'es' ? 'es-US' : 'en-US'
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return {
    method: (m: string) =>
      ({ cash: tr('Efectivo', 'Cash'), check: tr('Cheque', 'Check'), card: tr('Tarjeta', 'Card'), transfer: tr('Transferencia', 'Transfer'), other: tr('Otro', 'Other') })[m] || m,
    status: (s: string) => ({ active: tr('Activo', 'Active'), inactive: tr('Inactivo', 'Inactive'), visitor: tr('Visitante', 'Visitor') })[s] || s,
    role: (r: string) => ({ pastor: 'Pastor', leader: tr('Líder', 'Leader'), member: tr('Miembro', 'Member'), visitor: tr('Visitante', 'Visitor') })[r] || r,
    month: (m: number, style: 'short' | 'long' = 'short') => cap(new Date(2024, m - 1, 1).toLocaleDateString(locale, { month: style }).replace('.', '')),
    loose: tr('Ofrenda suelta', 'Loose offering'),
  }
}

/** Turns an API error into a sentence a non-technical person can act on. */
export function useErrorText() {
  const { tr } = useApp()
  return (e: unknown): string => {
    const code = e instanceof ApiError ? e.code : 'server_error'
    const map: Record<string, string> = {
      network: tr('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', 'Cannot reach the server. Check your connection and try again.'),
      server_error: tr('Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento.', 'Something went wrong on our side. Please try again in a moment.'),
      unauthenticated: tr('Tu sesión terminó. Vuelve a entrar.', 'Your session ended. Please sign in again.'),
      forbidden: tr('No se permite esta acción.', 'This action is not allowed.'),
      not_found: tr('No encontramos ese registro. Puede que alguien lo haya eliminado.', 'We could not find that record. Someone may have deleted it.'),
      invalid_input: tr('Revisa los datos: falta algo o hay un valor que no es válido.', 'Please check the form: something is missing or not valid.'),
      bad_credentials: tr('El correo o la contraseña no coinciden.', 'The e-mail or password does not match.'),
      email_taken: tr('Ya existe una cuenta con ese correo. Prueba a entrar.', 'An account with that e-mail already exists. Try signing in.'),
      invite_invalid: tr('Ese código de invitación no es válido o ya venció. Pide uno nuevo a tu iglesia.', 'That invitation code is not valid or has expired. Ask your church for a new one.'),
      church_name_required: tr('Escribe el nombre de tu iglesia.', 'Enter the name of your church.'),
      reset_invalid: tr('Este enlace ya se usó o venció. Solicita uno nuevo.', 'This link was already used or has expired. Request a new one.'),
      wrong_password: tr('La contraseña actual no es correcta.', 'The current password is not correct.'),
      too_many_attempts: tr('Demasiados intentos. Espera unos minutos.', 'Too many attempts. Please wait a few minutes.'),
      cannot_remove_self: tr('No puedes quitarte a ti mismo.', 'You cannot remove yourself.'),
      fund_in_use: tr('Este fondo ya tiene ofrendas. Puedes archivarlo en lugar de eliminarlo.', 'This fund already has offerings. You can archive it instead of deleting it.'),
      file_required: tr('Elige un archivo primero.', 'Choose a file first.'),
      file_not_image: tr('Ese archivo no es una foto. Usa JPG o PNG.', 'That file is not a photo. Use JPG or PNG.'),
      file_too_large: tr('El archivo es demasiado grande (máximo 10 MB).', 'The file is too large (10 MB maximum).'),
      invalid_range: tr('La fecha final debe ser posterior a la inicial.', 'The end date must be after the start date.'),
      member_required: tr('Elige un miembro para este informe.', 'Choose a member for this report.'),
      no_statements: tr('No hay contribuciones deducibles para ese año.', 'There are no deductible contributions for that year.'),
      email_not_configured: tr('El envío de correos aún no está configurado en el servidor (SMTP).', 'Sending e-mail is not configured on the server yet (SMTP).'),
      csv_empty: tr('El archivo está vacío o no tiene filas de datos.', 'The file is empty or has no data rows.'),
      csv_too_large: tr('El archivo tiene demasiadas filas (máximo 20,000).', 'The file has too many rows (20,000 maximum).'),
      csv_missing_columns: tr('Al archivo le faltan columnas necesarias.', 'The file is missing required columns.'),
      ai_not_configured: tr('La inteligencia artificial aún no está activada. Falta la clave de Gemini en el servidor.', 'AI is not turned on yet. The Gemini key is missing on the server.'),
      ai_bad_key: tr('La clave de Gemini no es válida. Revísala en el archivo .env del servidor.', 'The Gemini key is not valid. Check it in the server .env file.'),
      ai_bad_model: tr('El modelo de Gemini configurado no existe. Revisa GEMINI_MODEL en el archivo .env.', 'The configured Gemini model does not exist. Check GEMINI_MODEL in the .env file.'),
      ai_busy: tr('El asistente está ocupado. Espera un momento e inténtalo otra vez.', 'The assistant is busy. Wait a moment and try again.'),
      ai_unreachable: tr('No se pudo conectar con el servicio de IA.', 'Could not reach the AI service.'),
      ai_failed: tr('El asistente no pudo responder esta vez. Inténtalo de nuevo.', 'The assistant could not answer this time. Please try again.'),
      ai_empty: tr('El asistente no devolvió una respuesta. Inténtalo de nuevo.', 'The assistant returned no answer. Please try again.'),
      sms_not_configured: tr('Los mensajes de texto aún no están activados. Faltan los datos de Twilio en el servidor.', 'Text messages are not turned on yet. The Twilio details are missing on the server.'),
      ai_no_data: tr('Todavía no hay ofrendas registradas para resumir.', 'There are no offerings recorded yet to summarise.'),
    }
    return map[code] || map.server_error
  }
}

export const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const seriesColor = (slot?: number | null) => `var(--series-${(((slot || 1) - 1) % 8) + 1})`

/**
 * Reads an amount the way people type it: "1,250.50", "1250", "$ 45", or "45,50" (comma as decimal).
 * Returns NaN when it cannot be read.
 */
export function parseAmount(input: string): number {
  let s = input.replace(/[^\d.,]/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // Whichever comes last is the decimal mark: "1,250.50" or "1.250,50".
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  } else if (lastComma > -1) {
    // Only commas: "45,50" is a decimal, "1,250" is thousands.
    s = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\.(?=.*\.)/g, '') // "1.250.50" → "1250.50"
  }
  const n = Math.round(parseFloat(s) * 100) / 100
  return Number.isFinite(n) ? n : NaN
}
