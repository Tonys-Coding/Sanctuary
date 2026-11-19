import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, parse, todayIn } from '../http';
import { Lang, buildReport, reportSpec, reportToRows } from '../lib/reports';
import { reportPdf, statementsPdf, StatementData } from '../lib/pdf';
import { toCsv } from '../lib/csv';
import { letterHtml, sendMail } from '../lib/mailer';
import { features } from '../env';
import { dashboard } from '../lib/analytics';
import { fullName } from './members';

const r = Router();
const getOrg = (id: string) => one('SELECT * FROM organizations WHERE id = $1', [id]);
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'informe';
const langOf = (v: unknown, fallback: Lang): Lang => (v === 'en' || v === 'es' ? v : fallback);

r.get('/dashboard', async (req, res) => {
  res.json(await dashboard(req.user.orgId, Number(req.query.year) || undefined));
});

r.post('/run', async (req, res) => {
  res.json(await buildReport(req.user.orgId, langOf(req.body?.lang, req.user.language), parse(reportSpec, req.body)));
});

r.post('/pdf', async (req, res) => {
  const lang = langOf(req.body?.lang, req.user.language);
  const report = await buildReport(req.user.orgId, lang, parse(reportSpec, req.body));
  const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 3000) : undefined;
  const pdf = await reportPdf(await getOrg(req.user.orgId), report, lang, note);
  res.type('application/pdf').attachment(`${slug(report.title)}.pdf`).send(pdf);
});

r.post('/csv', async (req, res) => {
  const report = await buildReport(req.user.orgId, langOf(req.body?.lang, req.user.language), parse(reportSpec, req.body));
  const { header, rows } = reportToRows(report);
  res.type('text/csv').attachment(`${slug(report.title)}.csv`).send(toCsv(header, rows));
});

// Sends a report as a PDF attachment. With type "member" and several memberIds,
// each member receives their own personal statement.
r.post('/email', async (req, res) => {
  if (!features().email) throw new HttpError(503, 'email_not_configured');
  const body = parse(
    z.object({
      spec: reportSpec,
      lang: z.enum(['es', 'en']).optional(),
      memberIds: z.array(z.string().uuid()).max(500).default([]),
      emails: z.array(z.string().trim().toLowerCase().email()).max(50).default([]),
      subject: z.string().trim().min(2).max(200),
      message: z.string().trim().min(2).max(5000),
      note: z.string().max(3000).optional(),
    }),
    req.body,
  );
  const lang = body.lang || req.user.language;
  const org = await getOrg(req.user.orgId);
  const members = body.memberIds.length
    ? await q(`SELECT m.id, m.email, ${fullName} AS name, m.first_name FROM members m WHERE m.org_id = $1 AND m.id = ANY($2::uuid[])`, [req.user.orgId, body.memberIds])
    : [];
  const ctx = { orgId: req.user.orgId, userId: req.user.id, kind: 'report' };
  const personal = (text: string, first: string) => text.replace(/\{nombre\}|\{name\}/gi, first);
  let sent = 0;
  const failed: string[] = [];
  const skipped: string[] = [];

  const deliver = async (to: string, firstName: string, pdf: Buffer, filename: string) => {
    const text = personal(body.message, firstName);
    const ok = await sendMail(ctx, { to, subject: personal(body.subject, firstName), text, html: letterHtml(org.name, text), attachments: [{ filename, content: pdf }], replyTo: org.email || undefined });
    if (ok) sent++; else failed.push(to);
  };

  if (body.spec.type === 'member' && members.length) {
    for (const m of members) {
      if (!m.email) { skipped.push(m.name); continue; }
      const report = await buildReport(req.user.orgId, lang, { ...body.spec, memberId: m.id });
      await deliver(m.email, m.first_name, await reportPdf(org, report, lang), `${slug(report.title)}.pdf`);
    }
  } else {
    const report = await buildReport(req.user.orgId, lang, body.spec);
    const pdf = await reportPdf(org, report, lang, body.note);
    for (const m of members) {
      if (!m.email) { skipped.push(m.name); continue; }
      await deliver(m.email, m.first_name, pdf, `${slug(report.title)}.pdf`);
    }
    for (const e of body.emails) await deliver(e, '', pdf, `${slug(report.title)}.pdf`);
  }
  await audit(req, 'email', 'report', null, `${body.subject} → ${sent}`);
  res.json({ sent, failed, skipped });
});

// ─── Tax / contribution statements ───────────────────────────────────────────

const yearOf = (v: unknown) => {
  const y = Number(v);
  if (!Number.isInteger(y) || y < 1990 || y > 2200) throw new HttpError(400, 'invalid_input');
  return y;
};

const METHODS: Record<Lang, Record<string, string>> = {
  es: { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' },
  en: { cash: 'Cash', check: 'Check', card: 'Card', transfer: 'Transfer', other: 'Other' },
};

type Recipient = StatementData & Required<Pick<StatementData, 'given' | 'goods' | 'noncash' | 'quidProQuo'>> & {
  id: string; emails: string[]; first_name: string; memberIds: string[]; memberNames: string[]; avatar_file: string | null;
  non_deductible: number; largest: number; household: boolean;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Everyone who gets a contribution statement for a calendar year. Members of a household marked
 * "joint statement" share one statement; the id is then "h:<household id>", otherwise the member id.
 * Only the part of each gift above the value of goods or services received is deductible.
 */
export async function statements(orgId: string, year: number, lang: Lang, ids?: string[]): Promise<Recipient[]> {
  const [gifts, goods] = await Promise.all([
    q(
      `SELECT m.id AS member_id, ${fullName} AS member_name, m.first_name, m.email, m.avatar_file, m.address, m.city, m.state, m.postal_code, m.envelope_number,
              h.id AS household_id, h.name AS household_name,
              o.date, f.name AS fund, f.tax_deductible, o.method, o.check_number, o.amount, o.goods_value
       FROM offerings o JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id
       LEFT JOIN households h ON h.id = m.household_id AND h.joint_statement
       WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int
       ORDER BY COALESCE(h.name, ${fullName}), o.date, o.created_at`, [orgId, year]),
    q(
      `SELECT m.id AS member_id, ${fullName} AS member_name, m.first_name, m.email, m.avatar_file, m.address, m.city, m.state, m.postal_code, m.envelope_number,
              h.id AS household_id, h.name AS household_name, g.date, g.description
       FROM noncash_gifts g JOIN members m ON m.id = g.member_id LEFT JOIN households h ON h.id = m.household_id AND h.joint_statement
       WHERE g.org_id = $1 AND extract(year FROM g.date) = $2::int ORDER BY g.date`, [orgId, year]),
  ]);
  const out = new Map<string, Recipient>();
  const get = (g: any) => {
    const key = g.household_id ? `h:${g.household_id}` : g.member_id;
    let s = out.get(key);
    if (!s) {
      out.set(key, (s = {
        id: key, emails: [], first_name: g.household_id ? '' : g.first_name, memberIds: [], memberNames: [], avatar_file: g.avatar_file, household: !!g.household_id,
        member: { full_name: g.household_name || g.member_name, address: null, city: null, state: null, postal_code: null, envelope_number: g.envelope_number },
        year, gifts: [], total: 0, given: 0, goods: 0, noncash: [], quidProQuo: false, non_deductible: 0, largest: 0,
      }));
    }
    if (!s.memberIds.includes(g.member_id)) {
      s.memberIds.push(g.member_id);
      s.memberNames.push(g.member_name);
      if (g.email && !s.emails.includes(g.email)) s.emails.push(g.email);
    }
    if (!s.member.address && g.address) Object.assign(s.member, { address: g.address, city: g.city, state: g.state, postal_code: g.postal_code });
    return s;
  };
  for (const g of gifts) {
    const s = get(g);
    if (!g.tax_deductible) { s.non_deductible = round2(s.non_deductible + g.amount); continue; }
    const goodsValue = Math.min(g.goods_value || 0, g.amount);
    const deductible = round2(g.amount - goodsValue);
    s.gifts.push({ date: g.date, fund: g.fund, method: METHODS[lang][g.method] + (g.check_number ? ` #${g.check_number}` : ''), amount: g.amount, goods: goodsValue, deductible, giver: s.household ? g.first_name : undefined });
    s.total = round2(s.total + deductible);
    s.given = round2(s.given + g.amount);
    s.goods = round2(s.goods + goodsValue);
    s.largest = Math.max(s.largest, g.amount);
    if (goodsValue > 0 && g.amount > 75) s.quidProQuo = true;
  }
  for (const g of goods) get(g).noncash.push({ date: g.date, description: g.description });
  return [...out.values()]
    .filter((s) => s.total > 0 || s.noncash.length)
    .filter((s) => !ids?.length || ids.includes(s.id) || s.memberIds.some((m) => ids.includes(m)))
    .map((s) => ({ ...s, first_name: s.household ? s.member.full_name : s.first_name }));
}

r.get('/tax', async (req, res) => {
  const year = yearOf(req.query.year);
  const args = [req.user.orgId, year];
  const [org, list, sentRows, other, years] = await Promise.all([
    getOrg(req.user.orgId),
    statements(req.user.orgId, year, req.user.language),
    q('SELECT member_id, emailed_at, emailed_to FROM tax_statements WHERE org_id = $1 AND year = $2', args),
    one(
      `SELECT COALESCE(sum(o.amount) FILTER (WHERE o.member_id IS NULL), 0) AS loose,
              COALESCE(sum(o.amount) FILTER (WHERE NOT f.tax_deductible), 0) AS non_deductible,
              COALESCE(sum(o.goods_value) FILTER (WHERE f.tax_deductible AND o.member_id IS NOT NULL), 0) AS goods,
              COALESCE(sum(o.amount), 0) AS total
       FROM offerings o JOIN funds f ON f.id = o.fund_id WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int`, args),
    q('SELECT DISTINCT extract(year FROM date)::int AS year FROM offerings WHERE org_id = $1 ORDER BY 1 DESC', [req.user.orgId]),
  ]);
  const sent = new Map(sentRows.map((s) => [s.member_id, s]));
  const rows = list.map((s) => {
    const marks = s.memberIds.map((id) => sent.get(id)).filter(Boolean);
    const last = marks.sort((a, b) => +new Date(b.emailed_at) - +new Date(a.emailed_at))[0];
    return {
      id: s.id, name: s.member.full_name, avatar_file: s.avatar_file, email: s.emails[0] ?? null, emails: s.emails, envelope_number: s.member.envelope_number,
      has_address: !!(s.member.address && s.member.city), deductible: s.total, given: s.given, goods: s.goods, non_deductible: s.non_deductible,
      gifts: s.gifts.length, largest: s.largest, needs_acknowledgment: s.largest >= 250, quid_pro_quo: s.quidProQuo, noncash: s.noncash.length,
      household: s.household, members: s.memberNames, emailed_at: last?.emailed_at ?? null, emailed_to: last?.emailed_to ?? null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const currentYear = Number(todayIn(req.user.tz).slice(0, 4));
  res.json({
    year,
    years: Array.from(new Set([currentYear, currentYear - 1, ...years.map((y) => y.year)])).sort((a, b) => b - a),
    readiness: {
      legal_name: !!(org.legal_name || org.name), tax_id: !!org.tax_id, address: !!(org.address && org.city),
      signer: !!(org.treasurer_name || org.pastor_name),
    },
    members: rows,
    totals: {
      deductible: round2(rows.reduce((a, m) => a + m.deductible, 0)), statements: rows.length,
      loose: other.loose, non_deductible: other.non_deductible, goods: other.goods, total: other.total,
      missing_email: rows.filter((m) => !m.email).length, missing_address: rows.filter((m) => !m.has_address).length,
      needs_acknowledgment: rows.filter((m) => m.needs_acknowledgment).length, emailed: rows.filter((m) => m.emailed_at).length,
      quid_pro_quo: rows.filter((m) => m.quid_pro_quo).length, noncash: rows.filter((m) => m.noncash).length,
      households: rows.filter((m) => m.household).length,
    },
    emailConfigured: features().email,
  });
});

r.get('/tax/statements.pdf', async (req, res) => {
  const year = yearOf(req.query.year);
  const lang = langOf(req.query.lang, req.user.language);
  const ids = typeof req.query.memberId === 'string' && req.query.memberId ? [req.query.memberId] : undefined;
  const list = await statements(req.user.orgId, year, lang, ids);
  if (!list.length) throw new HttpError(404, 'no_statements');
  const pdf = await statementsPdf(await getOrg(req.user.orgId), list, lang);
  const name = ids ? `${slug(list[0].member.full_name)}-${year}` : `${lang === 'es' ? 'constancias' : 'statements'}-${year}`;
  res.type('application/pdf').attachment(`${name}.pdf`);
  if (req.query.inline === '1') res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`);
  res.send(pdf);
});

r.post('/tax/email', async (req, res) => {
  if (!features().email) throw new HttpError(503, 'email_not_configured');
  const body = parse(
    z.object({ year: z.coerce.number().int(), lang: z.enum(['es', 'en']).optional(), memberIds: z.array(z.string().regex(/^(h:)?[0-9a-f-]{36}$/)).min(1).max(1000), subject: z.string().trim().min(2).max(200), message: z.string().trim().min(2).max(5000) }),
    req.body,
  );
  const year = yearOf(body.year);
  const lang = body.lang || req.user.language;
  const org = await getOrg(req.user.orgId);
  const list = await statements(req.user.orgId, year, lang, body.memberIds);
  let sent = 0;
  const failed: string[] = [];
  const skipped: string[] = [];
  for (const s of list) {
    if (!s.emails.length) { skipped.push(s.member.full_name); continue; }
    const text = body.message.replace(/\{nombre\}|\{name\}/gi, s.first_name);
    const pdf = await statementsPdf(org, [s], lang);
    // A joint statement goes to every member of the household who has an e-mail.
    const delivered: string[] = [];
    for (const to of s.emails) {
      const ok = await sendMail(
        { orgId: req.user.orgId, userId: req.user.id, kind: 'tax_statement' },
        {
          to, subject: body.subject.replace(/\{nombre\}|\{name\}/gi, s.first_name), text, html: letterHtml(org.name, text), replyTo: org.email || undefined,
          attachments: [{ filename: `${lang === 'es' ? 'constancia' : 'statement'}-${year}.pdf`, content: pdf }],
        },
      );
      if (ok) delivered.push(to);
    }
    if (!delivered.length) { failed.push(s.member.full_name); continue; }
    sent++;
    for (const memberId of s.memberIds) {
      await q(
        `INSERT INTO tax_statements (org_id, member_id, year, total, emailed_to, emailed_at) VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (org_id, member_id, year) DO UPDATE SET total = EXCLUDED.total, emailed_to = EXCLUDED.emailed_to, emailed_at = now()`,
        [req.user.orgId, memberId, year, s.total, delivered.join(', ')],
      );
    }
  }
  await audit(req, 'email', 'tax_statement', null, `${year} → ${sent}`);
  res.json({ sent, failed, skipped });
});

export default r;
