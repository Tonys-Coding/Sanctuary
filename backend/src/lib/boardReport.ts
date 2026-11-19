import { one, q } from '../db';
import { hourIn, todayIn } from '../http';
import { Lang, buildReport, fmtMoney } from './reports';
import { reportPdf } from './pdf';
import { letterHtml, sendMail } from './mailer';

/** The month before the given local date, as { from, to, key: 'YYYY-MM' }. */
export function previousMonth(todayIso: string) {
  let [y, m] = todayIso.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const key = `${y}-${String(m).padStart(2, '0')}`;
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, '0')}`, key };
}

export const boardRecipients = (list: string | null | undefined) =>
  (list || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^\S+@\S+\.\S+$/.test(s)).slice(0, 30);

const MONTHS: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** Builds and sends the treasurer's report for one month to the board. Returns how many e-mails went out. */
export async function sendBoardReport(orgId: string, period: { from: string; to: string; key: string }, userId: string | null = null) {
  const org = await one('SELECT * FROM organizations WHERE id = $1', [orgId]);
  const to = boardRecipients(org.board_emails);
  if (!to.length) return 0;
  const lang: Lang = org.board_report_lang === 'en' ? 'en' : 'es';
  const report = await buildReport(orgId, lang, { type: 'treasurer', from: period.from, to: period.to } as any);
  const pdf = await reportPdf(org, report, lang);
  const [y, m] = period.key.split('-').map(Number);
  const month = `${MONTHS[lang][m - 1]} ${y}`;
  const h = Object.fromEntries(report.highlights.map((x, i) => [i, fmtMoney(Number(x.value), org.currency, lang)]));
  const text = lang === 'es'
    ? `Hola:\n\nAdjunto está el informe de tesorería de ${month}.\n\nSaldo inicial: ${h[0]}\nIngresos: ${h[1]}\nGastos: ${h[2]}\nSaldo final: ${h[3]}\n\nEste correo se envía automáticamente cada mes desde Sanctuary.`
    : `Hello,\n\nAttached is the treasurer's report for ${month}.\n\nOpening balance: ${h[0]}\nIncome: ${h[1]}\nExpenses: ${h[2]}\nClosing balance: ${h[3]}\n\nThis e-mail is sent automatically every month by Sanctuary.`;
  const subject = lang === 'es' ? `Informe de tesorería · ${month} · ${org.name}` : `Treasurer's report · ${month} · ${org.name}`;
  const filename = lang === 'es' ? `informe-tesoreria-${period.key}.pdf` : `treasurer-report-${period.key}.pdf`;
  let sent = 0;
  for (const addr of to) {
    if (await sendMail({ orgId, userId, kind: 'board' }, { to: addr, subject, text, html: letterHtml(org.name, text), attachments: [{ filename, content: pdf }], replyTo: org.email || undefined })) sent++;
  }
  return sent;
}

/**
 * Checked every minute: on the chosen day of the month, after 8 a.m. church time, each church with the
 * board report turned on gets last month's report — once (board_report_last remembers the month sent).
 */
export async function sendBoardReports(now = new Date()) {
  const orgs = await q('SELECT id, timezone, board_report_day, board_report_last FROM organizations WHERE board_report_enabled AND board_emails IS NOT NULL');
  for (const o of orgs) {
    const today = todayIn(o.timezone, now);
    if (Number(today.slice(8, 10)) < o.board_report_day || hourIn(o.timezone, now) < 8) continue;
    const period = previousMonth(today);
    if (o.board_report_last === period.key) continue;
    // Claim the month first so two servers (or a slow send) never mail the board twice.
    const claimed = await q('UPDATE organizations SET board_report_last = $2 WHERE id = $1 AND board_report_last IS DISTINCT FROM $2 RETURNING id', [o.id, period.key]);
    if (!claimed.length) continue;
    await sendBoardReport(o.id, period);
  }
}
