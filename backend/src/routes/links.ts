import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { z } from 'zod';
import { one, q } from '../db';
import { env, features } from '../env';
import { HttpError, audit, notFound, parse, todayIn } from '../http';
import { letterHtml, sendMail } from '../lib/mailer';
import { normalizePhone, sendDue } from '../lib/sms';
import { statementsPdf } from '../lib/pdf';
import { Lang } from '../lib/reports';
import { statements } from './reports';
import { fullName } from './members';

/**
 * Personal giving links: a private address a member opens on their phone to see what they
 * have given and download their statement, without an account. Only a hash of the token is stored.
 */
export const links = Router();
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const urlFor = (token: string) => `${env.appUrl}/mi-ofrenda/${token}`;

links.get('/:memberId', async (req, res) => {
  res.json(await one(
    `SELECT id, expires_at, last_viewed_at, created_at FROM member_links
     WHERE member_id = $1 AND org_id = $2 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`,
    [req.params.memberId, req.user.orgId]) ?? null);
});

/** Creates a new link (the previous one stops working) and optionally sends it by e-mail or text. */
links.post('/:memberId', async (req, res) => {
  const b = parse(z.object({ days: z.coerce.number().int().min(1).max(730).default(365), send: z.enum(['none', 'email', 'sms']).default('none'), lang: z.enum(['es', 'en']).optional() }), req.body ?? {});
  const m = await one(`SELECT m.id, m.first_name, m.email, m.phone, m.sms_opt_in, ${fullName} AS name FROM members m WHERE id = $1 AND org_id = $2`, [req.params.memberId, req.user.orgId]);
  if (!m) throw notFound();
  if (b.send === 'email' && !features().email) throw new HttpError(503, 'email_not_configured');
  if (b.send === 'email' && !m.email) throw new HttpError(400, 'member_no_email');
  if (b.send === 'sms' && !features().sms) throw new HttpError(503, 'sms_not_configured');
  if (b.send === 'sms' && (!m.sms_opt_in || !normalizePhone(m.phone))) throw new HttpError(400, 'member_no_sms');
  const token = crypto.randomBytes(24).toString('base64url');
  await q('UPDATE member_links SET revoked_at = now() WHERE member_id = $1 AND revoked_at IS NULL', [m.id]);
  const link = await one(
    `INSERT INTO member_links (org_id, member_id, token_hash, expires_at, created_by) VALUES ($1,$2,$3, now() + make_interval(days => $4::int), $5) RETURNING id, expires_at, created_at`,
    [req.user.orgId, m.id, hash(token), b.days, req.user.id]);
  const url = urlFor(token);
  const org = await one('SELECT name, email FROM organizations WHERE id = $1', [req.user.orgId]);
  const lang = b.lang || req.user.language;
  const text = lang === 'es'
    ? `Hola ${m.first_name}:\n\nEste es su enlace personal para ver sus diezmos y ofrendas en ${org.name} y descargar su constancia para impuestos. Es privado: no lo comparta.`
    : `Hello ${m.first_name},\n\nThis is your personal link to see your tithes and offerings at ${org.name} and download your tax statement. It is private: please do not share it.`;
  let sent = false;
  if (b.send === 'email') {
    sent = await sendMail({ orgId: req.user.orgId, userId: req.user.id, kind: 'member_link' }, {
      to: m.email, subject: lang === 'es' ? `Sus ofrendas en ${org.name}` : `Your giving at ${org.name}`,
      text: `${text}\n\n${url}`, html: letterHtml(org.name, text, { label: lang === 'es' ? 'Ver mis ofrendas' : 'See my giving', url }), replyTo: org.email || undefined,
    });
  } else if (b.send === 'sms') {
    const body = lang === 'es' ? `${org.name}: su enlace personal para ver sus ofrendas: ${url}` : `${org.name}: your personal link to see your giving: ${url}`;
    const row = await one('INSERT INTO sms_messages (org_id, member_id, to_phone, body, kind, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [req.user.orgId, m.id, normalizePhone(m.phone), body, 'manual', req.user.id]);
    await sendDue(req.user.orgId);
    sent = (await one('SELECT status FROM sms_messages WHERE id = $1', [row.id]))?.status === 'sent';
  }
  await audit(req, 'create', 'member_link', link.id, `${m.name}${b.send !== 'none' ? ` → ${b.send}` : ''}`);
  res.status(201).json({ ...link, url, sent });
});

links.delete('/:memberId', async (req, res) => {
  const rows = await q('UPDATE member_links SET revoked_at = now() WHERE member_id = $1 AND org_id = $2 AND revoked_at IS NULL RETURNING id', [req.params.memberId, req.user.orgId]);
  await audit(req, 'delete', 'member_link', rows[0]?.id ?? null, String(rows.length));
  res.json({ revoked: rows.length });
});

// ─── The public page behind the link (no sign-in) ────────────────────────────

export const publicGiving = Router();
publicGiving.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: env.isProd ? 120 : 5000, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_attempts' } }));
publicGiving.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });

async function byToken(token: string, touch = false) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound();
  const l = await one(
    `SELECT l.id, l.member_id, l.org_id, m.first_name, ${fullName} AS name, o.name AS church, o.currency, o.timezone, o.logo_file
     FROM member_links l JOIN members m ON m.id = l.member_id JOIN organizations o ON o.id = l.org_id
     WHERE l.token_hash = $1 AND l.revoked_at IS NULL AND l.expires_at > now()`, [hash(token)]);
  if (!l) throw new HttpError(404, 'link_invalid');
  if (touch) await q('UPDATE member_links SET last_viewed_at = now() WHERE id = $1', [l.id]);
  return l;
}

publicGiving.get('/:token', async (req, res) => {
  const l = await byToken(String(req.params.token), true);
  const thisYear = Number(todayIn(l.timezone).slice(0, 4));
  const year = Number(req.query.year) >= 1990 && Number(req.query.year) <= thisYear ? Number(req.query.year) : thisYear;
  const [gifts, years] = await Promise.all([
    q(`SELECT o.date, f.name AS fund, o.method, o.amount, f.tax_deductible FROM offerings o JOIN funds f ON f.id = o.fund_id
       WHERE o.member_id = $1 AND extract(year FROM o.date) = $2::int ORDER BY o.date DESC`, [l.member_id, year]),
    q('SELECT DISTINCT extract(year FROM date)::int AS y FROM offerings WHERE member_id = $1 ORDER BY 1 DESC', [l.member_id]),
  ]);
  const byFund = new Map<string, number>();
  for (const g of gifts) byFund.set(g.fund, Math.round(((byFund.get(g.fund) || 0) + g.amount) * 100) / 100);
  res.json({
    church: l.church, currency: l.currency, name: l.name, first_name: l.first_name, year,
    years: [...new Set([thisYear, ...years.map((y) => y.y)])].sort((a, b) => b - a),
    total: Math.round(gifts.reduce((a, g) => a + g.amount, 0) * 100) / 100,
    byFund: [...byFund.entries()].map(([fund, total]) => ({ fund, total })).sort((a, b) => b.total - a.total),
    gifts: gifts.map(({ tax_deductible: _t, ...g }) => g),
  });
});

publicGiving.get('/:token/statement.pdf', async (req, res) => {
  const l = await byToken(String(req.params.token));
  const lang: Lang = req.query.lang === 'en' ? 'en' : 'es';
  const year = Number(req.query.year);
  if (!Number.isInteger(year) || year < 1990 || year > 2200) throw new HttpError(400, 'invalid_input');
  // A member on a joint household statement gets the household's statement.
  const list = await statements(l.org_id, year, lang, [l.member_id]);
  if (!list.length) throw new HttpError(404, 'no_statements');
  const org = await one('SELECT * FROM organizations WHERE id = $1', [l.org_id]);
  const pdf = await statementsPdf(org, list, lang);
  res.type('application/pdf').setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${lang === 'es' ? 'constancia' : 'statement'}-${year}.pdf"`);
  res.send(pdf);
});
