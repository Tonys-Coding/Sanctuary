import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, parse } from '../http';
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

r.get('/tax', async (req, res) => {
  const year = yearOf(req.query.year);
  const args = [req.user.orgId, year];
  const [org, rows, other, years] = await Promise.all([
    getOrg(req.user.orgId),
    q(
      `SELECT m.id, ${fullName} AS name, m.avatar_file, m.email, m.envelope_number,
              (m.address IS NOT NULL AND m.city IS NOT NULL) AS has_address,
              sum(o.amount) FILTER (WHERE f.tax_deductible) AS deductible,
              COALESCE(sum(o.amount) FILTER (WHERE NOT f.tax_deductible), 0) AS non_deductible,
              count(*) FILTER (WHERE f.tax_deductible) AS gifts,
              COALESCE(max(o.amount) FILTER (WHERE f.tax_deductible), 0) AS largest,
              ts.emailed_at, ts.emailed_to
       FROM offerings o JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id
       LEFT JOIN tax_statements ts ON ts.member_id = m.id AND ts.year = $2::int
       WHERE o.org_id = $1 AND extract(year FROM o.date) = $2
       GROUP BY m.id, ts.emailed_at, ts.emailed_to HAVING sum(o.amount) FILTER (WHERE f.tax_deductible) > 0
       ORDER BY ${fullName}`, args),
    one(
      `SELECT COALESCE(sum(o.amount) FILTER (WHERE o.member_id IS NULL), 0) AS loose,
              COALESCE(sum(o.amount) FILTER (WHERE NOT f.tax_deductible), 0) AS non_deductible,
              COALESCE(sum(o.amount), 0) AS total
       FROM offerings o JOIN funds f ON f.id = o.fund_id WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int`, args),
    q('SELECT DISTINCT extract(year FROM date)::int AS year FROM offerings WHERE org_id = $1 ORDER BY 1 DESC', [req.user.orgId]),
  ]);
  const currentYear = new Date().getFullYear();
  res.json({
    year,
    years: Array.from(new Set([currentYear, currentYear - 1, ...years.map((y) => y.year)])).sort((a, b) => b - a),
    readiness: {
      legal_name: !!(org.legal_name || org.name), tax_id: !!org.tax_id, address: !!(org.address && org.city),
      signer: !!(org.treasurer_name || org.pastor_name),
    },
    members: rows.map((m) => ({ ...m, needs_acknowledgment: m.largest >= 250 })),
    totals: {
      deductible: Math.round(rows.reduce((a, m) => a + m.deductible, 0) * 100) / 100, statements: rows.length,
      loose: other.loose, non_deductible: other.non_deductible, total: other.total,
      missing_email: rows.filter((m) => !m.email).length, missing_address: rows.filter((m) => !m.has_address).length,
      needs_acknowledgment: rows.filter((m) => m.largest >= 250).length, emailed: rows.filter((m) => m.emailed_at).length,
    },
    emailConfigured: features().email,
  });
});

const METHODS: Record<Lang, Record<string, string>> = {
  es: { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' },
  en: { cash: 'Cash', check: 'Check', card: 'Card', transfer: 'Transfer', other: 'Other' },
};

async function statements(orgId: string, year: number, lang: Lang, memberIds?: string[]): Promise<(StatementData & { id: string; email: string | null; first_name: string })[]> {
  const gifts = await q(
    `SELECT m.id, ${fullName} AS full_name, m.first_name, m.email, m.address, m.city, m.state, m.postal_code, m.envelope_number,
            o.date, f.name AS fund, o.method, o.check_number, o.amount
     FROM offerings o JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id AND f.tax_deductible
     WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int AND ($3::uuid[] IS NULL OR m.id = ANY($3::uuid[]))
     ORDER BY ${fullName}, m.id, o.date, o.created_at`,
    [orgId, year, memberIds?.length ? memberIds : null],
  );
  const out = new Map<string, StatementData & { id: string; email: string | null; first_name: string }>();
  for (const g of gifts) {
    let s = out.get(g.id);
    if (!s) out.set(g.id, (s = { id: g.id, email: g.email, first_name: g.first_name, member: g, year, gifts: [], total: 0 }));
    s.gifts.push({ date: g.date, fund: g.fund, method: METHODS[lang][g.method] + (g.check_number ? ` #${g.check_number}` : ''), amount: g.amount });
    s.total = Math.round((s.total + g.amount) * 100) / 100;
  }
  return [...out.values()];
}

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
    z.object({ year: z.coerce.number().int(), lang: z.enum(['es', 'en']).optional(), memberIds: z.array(z.string().uuid()).min(1).max(1000), subject: z.string().trim().min(2).max(200), message: z.string().trim().min(2).max(5000) }),
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
    if (!s.email) { skipped.push(s.member.full_name); continue; }
    const text = body.message.replace(/\{nombre\}|\{name\}/gi, s.first_name);
    const ok = await sendMail(
      { orgId: req.user.orgId, userId: req.user.id, kind: 'tax_statement' },
      {
        to: s.email, subject: body.subject.replace(/\{nombre\}|\{name\}/gi, s.first_name), text, html: letterHtml(org.name, text), replyTo: org.email || undefined,
        attachments: [{ filename: `${lang === 'es' ? 'constancia' : 'statement'}-${year}.pdf`, content: await statementsPdf(org, [s], lang) }],
      },
    );
    if (!ok) { failed.push(s.member.full_name); continue; }
    sent++;
    await q(
      `INSERT INTO tax_statements (org_id, member_id, year, total, emailed_to, emailed_at) VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (org_id, member_id, year) DO UPDATE SET total = EXCLUDED.total, emailed_to = EXCLUDED.emailed_to, emailed_at = now()`,
      [req.user.orgId, s.id, year, s.total, s.email],
    );
  }
  await audit(req, 'email', 'tax_statement', null, `${year} → ${sent}`);
  res.json({ sent, failed, skipped });
});

export default r;
