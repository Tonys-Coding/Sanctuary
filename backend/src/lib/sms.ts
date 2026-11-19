import { env, features } from '../env';
import { q } from '../db';
import { HttpError, hourIn, todayIn } from '../http';
import { fullName } from '../routes/members';

/** Turns what people type ("(210) 555-0142", "210.555.0142", "+52 55 1234 5678") into +E.164. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (env.smsCountryCode === '1') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  }
  if (digits.startsWith(env.smsCountryCode) && digits.length > 10) return `+${digits}`;
  return digits.length >= 7 && digits.length <= 12 ? `+${env.smsCountryCode}${digits}` : null;
}

/** Characters that fit the cheaper 160-per-segment SMS alphabet; á, í, ó, ú (and emoji) do not. */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
export function segments(text: string) {
  const gsm = GSM.test(text);
  const len = [...text].length;
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return len <= single ? 1 : Math.ceil(len / multi);
}

export const personalize = (text: string, firstName: string) => text.replace(/\{nombre\}|\{name\}/gi, firstName);

/** Sends one text through Twilio. Throws with a readable message when Twilio refuses it. */
async function twilioSend(to: string, body: string): Promise<string> {
  if (!features().sms) throw new HttpError(503, 'sms_not_configured');
  const { sid, token, from, baseUrl } = env.twilio;
  const form = new URLSearchParams({ To: to, Body: body });
  if (from.startsWith('MG')) form.set('MessagingServiceSid', from);
  else form.set('From', from);
  const res = await fetch(`${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ? `${data.message}${data.code ? ` (${data.code})` : ''}` : `HTTP ${res.status}`);
  return String(data.sid || '');
}

/** Sends every text whose time has come. Safe to call often and from several places. */
export async function sendDue(orgId?: string): Promise<number> {
  if (!features().sms) return 0;
  // Claim the rows first, so two runs never send the same text twice.
  const due = await q(
    `UPDATE sms_messages SET status = 'sending'
     WHERE id IN (SELECT id FROM sms_messages WHERE status = 'scheduled' AND send_at <= now() ${orgId ? 'AND org_id = $1' : ''}
                  ORDER BY send_at LIMIT 200 FOR UPDATE SKIP LOCKED)
     RETURNING id, to_phone, body`,
    orgId ? [orgId] : [],
  );
  for (const m of due) {
    try {
      const sid = await twilioSend(m.to_phone, m.body);
      await q("UPDATE sms_messages SET status = 'sent', sent_at = now(), provider_id = $2 WHERE id = $1", [m.id, sid]);
    } catch (e: any) {
      await q("UPDATE sms_messages SET status = 'failed', error = $2 WHERE id = $1", [m.id, String(e?.message || e).slice(0, 300)]);
    }
  }
  return due.length;
}

export const DEFAULT_BIRTHDAY_MESSAGE = {
  es: '¡Feliz cumpleaños, {nombre}! Toda la familia de {iglesia} da gracias a Dios por tu vida. ¡Que Él te bendiga hoy y siempre!',
  en: 'Happy birthday, {name}! Everyone at {church} thanks God for your life. May He bless you today and always!',
};

/**
 * Once a day (from 9:00 in each church's own time zone), queues a birthday greeting for every
 * member who agreed to texts and has a birthday that day, in churches that turned the option on.
 */
export async function queueBirthdays(now = new Date()): Promise<number> {
  if (!features().sms) return 0;
  const orgs = await q('SELECT id, name, timezone, sms_birthday_message, sms_birthday_last_run FROM organizations WHERE sms_birthday_enabled');
  let queued = 0;
  for (const org of orgs) {
    const tz = org.timezone || 'UTC';
    const today = todayIn(tz, now);
    if (hourIn(tz, now) < 9 || (org.sms_birthday_last_run && org.sms_birthday_last_run >= today)) continue;
    // Claim the day first so two servers (or two ticks) never send twice.
    const claimed = await q(
      'UPDATE organizations SET sms_birthday_last_run = $2::date WHERE id = $1 AND (sms_birthday_last_run IS NULL OR sms_birthday_last_run < $2::date) RETURNING id',
      [org.id, today],
    );
    if (!claimed.length) continue;
    const md = today.slice(5);
    const y = Number(today.slice(0, 4));
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    // Feb 29 birthdays are greeted on Feb 28 in years without Feb 29.
    const days = md === '02-28' && !leap ? ['02-28', '02-29'] : [md];
    const people = await q(
      `SELECT m.id, m.first_name, m.phone, u.language FROM members m
       LEFT JOIN LATERAL (SELECT language FROM users WHERE org_id = m.org_id ORDER BY created_at LIMIT 1) u ON true
       WHERE m.org_id = $1 AND m.archived_at IS NULL AND m.sms_opt_in AND m.birth_date IS NOT NULL
         AND to_char(m.birth_date, 'MM-DD') = ANY($2::text[])`,
      [org.id, days],
    );
    for (const p of people) {
      const to = normalizePhone(p.phone);
      if (!to) continue;
      const template = org.sms_birthday_message || DEFAULT_BIRTHDAY_MESSAGE[p.language === 'en' ? 'en' : 'es'];
      const body = personalize(template, p.first_name).replace(/\{iglesia\}|\{church\}/gi, org.name);
      await q("INSERT INTO sms_messages (org_id, member_id, to_phone, body, kind) VALUES ($1,$2,$3,$4,'birthday')", [org.id, p.id, to, body]);
      queued++;
    }
  }
  return queued;
}

/** Background loop started by the server: birthday greetings and scheduled texts, every minute. */
export function startSmsScheduler() {
  const tick = async () => {
    try {
      await queueBirthdays();
      await sendDue();
    } catch (e: any) {
      console.error('SMS scheduler:', e?.message || e);
    }
  };
  tick();
  return setInterval(tick, 60_000);
}

export async function recipientsFor(orgId: string, memberIds: string[]) {
  return q(
    `SELECT m.id, ${fullName} AS name, m.first_name, m.phone, m.sms_opt_in FROM members m
     WHERE m.org_id = $1 AND m.id = ANY($2::uuid[]) AND m.archived_at IS NULL`,
    [orgId, memberIds],
  );
}

