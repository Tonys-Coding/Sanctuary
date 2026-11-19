import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, q } from '../db';
import { features } from '../env';
import { HttpError, isoDate, parse, todayIn } from '../http';
import { ToolDef, converse, currentModel, generate, generateJson } from '../lib/gemini';
import { dashboard } from '../lib/analytics';
import { buildReport, reportSpec } from '../lib/reports';
import { fullName } from './members';

const r = Router();
r.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'ai_busy' } }));

const langName = (l: string) => (l === 'en' ? 'English' : 'Spanish');

async function persona(orgId: string, lang: string) {
  const org = await one('SELECT name, currency, timezone FROM organizations WHERE id = $1', [orgId]);
  return `You are the built-in assistant of Sanctuary, the app the treasury team of the church "${org.name}" uses to record tithes and offerings (diezmos y ofrendas).
Today is ${todayIn(org.timezone)}. All amounts are in ${org.currency}.
Always answer in ${langName(lang)}.
Your readers are church volunteers, often middle-aged, with little technical or accounting background: write short, warm, plain sentences. No jargon, no code, no database terms.
Only state numbers that appear in the data you are given or that your tools return. Never guess or invent figures; if the data is missing, say so plainly.
Format money with the currency symbol and two decimals. Be respectful of givers: describe giving patterns neutrally and never judge individuals.
You are not a tax or legal adviser: for tax questions give general guidance and recommend confirming with a professional.`;
}

/** AI is on when the server has a key and the church has not switched it off in Settings. */
export async function aiOn(orgId: string) {
  if (!features().ai) return false;
  return !!(await one('SELECT ai_enabled FROM organizations WHERE id = $1', [orgId]))?.ai_enabled;
}

r.get('/status', async (req, res) => {
  res.json({ enabled: await aiOn(req.user.orgId), configured: features().ai, model: currentModel() });
});

r.use(async (req, _res, next) => {
  if (features().ai && !(await aiOn(req.user.orgId))) throw new HttpError(403, 'ai_disabled');
  next();
});

/** "Probar conexión": a tiny request that proves the key and model work, in plain words. */
r.post('/test', async (req, res) => {
  const started = Date.now();
  const text = await generate({
    system: 'You are a connection test. Reply with one short friendly sentence.',
    contents: [{ role: 'user', parts: [{ text: req.user.language === 'en' ? 'Say hello to the church treasury team in English.' : 'Saluda al equipo de tesorería de la iglesia, en español.' }] }],
    temperature: 0.5,
    maxTokens: 200,
  });
  res.json({ ok: true, model: currentModel(), ms: Date.now() - started, reply: text });
});

// ─── Dashboard summary (cached per day) ──────────────────────────────────────

r.post('/dashboard-summary', async (req, res) => {
  const body = parse(z.object({ year: z.coerce.number().int().optional(), refresh: z.boolean().optional() }), req.body);
  const lang = req.user.language;
  const data = await dashboard(req.user.orgId, body.year);
  const key = `dashboard:${data.year}:${lang}:${todayIn(req.user.tz)}`;
  if (!body.refresh) {
    const hit = await one('SELECT content, created_at FROM ai_cache WHERE org_id = $1 AND key = $2', [req.user.orgId, key]);
    if (hit) return void res.json({ text: hit.content, createdAt: hit.created_at, cached: true });
  }
  if (data.kpis.count === 0) throw new HttpError(400, 'ai_no_data');
  const slim = {
    year: data.year, dataThrough: data.ref, kpis: data.kpis, monthlyTotals: data.monthly, byFund: data.byFund.map((f: any) => ({ fund: f.name, total: f.total })),
    byMethod: data.byMethod, yearlyTotals: data.yearly, goals: data.goals.map((g: any) => ({ name: g.name, target: g.target_amount, raised: g.raised, ends: g.end_date })),
    signals: data.insights.map((i) => ({ type: i.type, ...i.data, members: undefined })),
  };
  const text = await generate({
    system: await persona(req.user.orgId, lang),
    contents: [{ role: 'user', parts: [{ text:
`Write the "summary of the moment" shown at the top of the treasury dashboard, based on this data:

${JSON.stringify(slim)}

Structure (Markdown, no headings, no tables):
1. One short paragraph (2–3 sentences) saying how giving is going this year and this month compared with before.
2. A bullet list of the 2–3 most notable changes or trends, each with its number.
3. One closing line starting with a bold label ("**Sugerencia:**" / "**Suggestion:**") with a single practical, kind next step for the treasury team.
Keep it under 130 words. Do not name individual members.` }] }],
    temperature: 0.4,
  });
  await q(
    `INSERT INTO ai_cache (org_id, key, content) VALUES ($1,$2,$3)
     ON CONFLICT (org_id, key) DO UPDATE SET content = EXCLUDED.content, created_at = now()`,
    [req.user.orgId, key, text],
  );
  await q("DELETE FROM ai_cache WHERE org_id = $1 AND created_at < now() - interval '14 days'", [req.user.orgId]);
  res.json({ text, createdAt: new Date().toISOString(), cached: false });
});

// ─── Explain a report ────────────────────────────────────────────────────────

r.post('/explain-report', async (req, res) => {
  const spec = parse(reportSpec, req.body);
  const report = await buildReport(req.user.orgId, req.user.language, spec);
  const slim = { ...report, sections: report.sections.map((s) => ({ title: s.title, total: s.total, rows: s.rows.slice(0, 80), truncated: s.rows.length > 80 })) };
  const text = await generate({
    system: await persona(req.user.orgId, req.user.language),
    contents: [{ role: 'user', parts: [{ text:
`Explain this report in plain words for the church board. Give a 2-sentence overview, then 3–4 bullet points with the most important findings (with their numbers), and end with one sentence on what to keep an eye on. Under 150 words, Markdown, no headings, no tables.

${JSON.stringify(slim)}` }] }],
  });
  res.json({ text });
});

// ─── Draft an e-mail ─────────────────────────────────────────────────────────

r.post('/draft-email', async (req, res) => {
  const body = parse(z.object({ purpose: z.string().trim().min(3).max(1000), context: z.string().max(2000).optional() }), req.body);
  const org = await one('SELECT name, pastor_name, treasurer_name FROM organizations WHERE id = $1', [req.user.orgId]);
  const out = await generateJson<{ subject: string; body: string }>({
    system: await persona(req.user.orgId, req.user.language),
    contents: [{ role: 'user', parts: [{ text:
`Draft a short, warm e-mail from the treasury of ${org.name} to church members.
Purpose described by the treasurer: """${body.purpose}"""
${body.context ? `What is attached / context: ${body.context}` : ''}
Sign it as ${org.treasurer_name || req.user.name}, Tesorería / Treasury, ${org.name}.
Plain text only (no Markdown), 60–120 words, blank lines between paragraphs. Do not include any amounts.
Return JSON: {"subject": string, "body": string}` }] }],
    temperature: 0.6,
  });
  res.json({ subject: String(out.subject || '').slice(0, 200), body: String(out.body || '') });
});

// ─── Turn dictated / typed notes into offering rows ──────────────────────────

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Turns the model's rows into offerings matched to real members and funds; anything unsure is left for the person to pick. */
function matchRows(raw: unknown, members: any[], funds: any[]) {
  const byName = new Map(members.map((m) => [norm(m.name), m]));
  const byEnvelope = new Map(members.filter((m) => m.envelope_number).map((m) => [norm(String(m.envelope_number)), m]));
  const fundByName = new Map(funds.map((f) => [norm(f.name), f]));
  return (Array.isArray(raw) ? raw : []).slice(0, 100).flatMap((row: any) => {
    const amount = Math.round(Number(row.amount) * 100) / 100;
    if (!(amount > 0) || amount > 9_999_999) return [];
    const m = (row.member ? byName.get(norm(String(row.member))) : undefined) || (row.envelope ? byEnvelope.get(norm(String(row.envelope))) : undefined);
    const f = fundByName.get(norm(String(row.fund || ''))) || funds[0];
    return [{
      member_id: m?.id ?? null, member_name: m?.name ?? null, unmatched_name: !m && row.member ? String(row.member).slice(0, 120) : null,
      fund_id: f?.id, fund_name: f?.name, amount,
      method: ['cash', 'check', 'card', 'transfer', 'other'].includes(row.method) ? row.method : 'cash',
      check_number: row.check_number ? String(row.check_number).slice(0, 40) : null,
      date: typeof row.date === 'string' && isoDate.test(row.date) ? row.date : null,
      notes: row.notes ? String(row.notes).slice(0, 300) : null,
      unsure: !!row.unsure,
    }];
  });
}

r.post('/parse-offerings', async (req, res) => {
  const body = parse(z.object({ text: z.string().trim().min(3).max(6000), date: z.string().regex(isoDate).optional() }), req.body);
  const [members, funds] = await Promise.all([
    q(`SELECT m.id, ${fullName} AS name, m.envelope_number FROM members m WHERE m.org_id = $1 AND m.archived_at IS NULL`, [req.user.orgId]),
    q('SELECT id, name FROM funds WHERE org_id = $1 AND archived_at IS NULL ORDER BY sort_order', [req.user.orgId]),
  ]);
  const out = await generateJson<{ rows: any[] }>({
    system: 'You convert a church treasurer\'s free-form notes into structured offering records. Output JSON only.',
    contents: [{ role: 'user', parts: [{ text:
`Notes (may be in Spanish or English, one or many offerings):
"""${body.text}"""

Known funds: ${funds.map((f) => f.name).join(', ')}
Known members (name | envelope number): ${members.map((m) => `${m.name}${m.envelope_number ? ' | ' + m.envelope_number : ''}`).join('; ')}

Return {"rows": [{"member": string|null, "amount": number, "fund": string, "method": "cash"|"check"|"card"|"transfer"|"other", "check_number": string|null, "notes": string|null}]}.
Rules: "member" must be copied exactly from the known members list when the note clearly refers to one (by name, nickname or envelope number); use null for anonymous / loose offerings or when unsure. "fund" must be one of the known funds; a "diezmo"/"tithe" goes to the tithes fund, otherwise use the general offerings fund. Default method is "cash". Never invent offerings that are not in the notes.` }] }],
    temperature: 0,
  });
  res.json({ rows: matchRows(out.rows, members, funds) });
});

// ─── Assistant chat with database tools ──────────────────────────────────────

function tools(orgId: string): ToolDef[] {
  const dateProps = {
    date_from: { type: 'STRING', description: 'Start date, YYYY-MM-DD (inclusive).' },
    date_to: { type: 'STRING', description: 'End date, YYYY-MM-DD (inclusive).' },
  };
  const filterProps = {
    fund: { type: 'STRING', description: 'Only this fund (part of its name, e.g. "Diezmos").' },
    member: { type: 'STRING', description: 'Only this member (part of their name).' },
    method: { type: 'STRING', description: 'cash, check, card, transfer or other.' },
  };
  const build = (a: Record<string, any>) => {
    const where = ['o.org_id = $1'];
    const params: unknown[] = [orgId];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (isoDate.test(a.date_from || '')) add('o.date >= ?', a.date_from);
    if (isoDate.test(a.date_to || '')) add('o.date <= ?', a.date_to);
    if (a.fund) add("f.name ILIKE '%' || ? || '%'", String(a.fund));
    if (a.member) add(`${fullName} ILIKE '%' || ? || '%'`, String(a.member));
    if (a.method) add('o.method = ?', String(a.method));
    return { where: where.join(' AND '), params };
  };
  const FROM = 'FROM offerings o LEFT JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id';
  const groups: Record<string, string> = {
    month: "to_char(o.date, 'YYYY-MM')", year: "to_char(o.date, 'YYYY')", fund: 'f.name', method: 'o.method',
    member: `COALESCE(${fullName}, '(loose offering, no name)')`, weekday: "trim(to_char(o.date, 'Day'))", week: "to_char(date_trunc('week', o.date), 'YYYY-MM-DD')",
  };
  return [
    {
      name: 'offering_totals',
      description: 'Totals of tithes and offerings (sum, number of records, average, distinct givers), optionally grouped. Use for any question about how much was given.',
      parameters: {
        type: 'OBJECT',
        properties: { ...dateProps, ...filterProps, group_by: { type: 'STRING', description: 'One of: none, month, year, week, fund, member, method, weekday.' }, limit: { type: 'INTEGER', description: 'Max groups to return (default 50), ordered by total descending for fund/member/method.' } },
      },
      run: async (a) => {
        const { where, params } = build(a);
        const g = groups[a.group_by as string];
        const agg = 'round(sum(o.amount), 2) AS total, count(*) AS records, round(avg(o.amount), 2) AS average, count(DISTINCT o.member_id) AS givers';
        if (!g) return one(`SELECT ${agg} ${FROM} WHERE ${where}`, params);
        const order = ['month', 'year', 'week'].includes(a.group_by) ? '1' : 'total DESC';
        return q(`SELECT ${g} AS "group", ${agg} ${FROM} WHERE ${where} GROUP BY 1 ORDER BY ${order} LIMIT ${Math.min(Number(a.limit) || 50, 200)}`, params);
      },
    },
    {
      name: 'list_offerings',
      description: 'Individual offering records (date, member, fund, method, amount), newest first. Use when the user wants a detailed list.',
      parameters: { type: 'OBJECT', properties: { ...dateProps, ...filterProps, limit: { type: 'INTEGER', description: 'Max rows (default 30, max 100).' } } },
      run: async (a) => {
        const { where, params } = build(a);
        return q(`SELECT o.date, COALESCE(${fullName}, '(loose offering)') AS member, f.name AS fund, o.method, o.amount, o.notes ${FROM} WHERE ${where} ORDER BY o.date DESC LIMIT ${Math.min(Number(a.limit) || 30, 100)}`, params);
      },
    },
    {
      name: 'find_members',
      description: 'Look up church members: status, role, contact completeness, total given this year and all time, date of last gift. Can also list members who have not given since a date.',
      parameters: {
        type: 'OBJECT',
        properties: {
          search: { type: 'STRING', description: 'Part of the name.' },
          status: { type: 'STRING', description: 'active, inactive or visitor.' },
          no_gift_since: { type: 'STRING', description: 'YYYY-MM-DD: only members whose last gift is before this date (or who never gave).' },
          limit: { type: 'INTEGER' },
        },
      },
      run: async (a) =>
        q(
          `SELECT ${fullName} AS name, m.status, m.church_role AS role, m.joined_date, (m.email IS NOT NULL) AS has_email, (m.address IS NOT NULL) AS has_address,
                  COALESCE(s.total_year, 0) AS given_this_year, COALESCE(s.total_all, 0) AS given_all_time, s.last_gift
           FROM members m LEFT JOIN (
             SELECT member_id, round(sum(amount) FILTER (WHERE date >= fy_start($1)), 2) AS total_year, round(sum(amount), 2) AS total_all, max(date) AS last_gift
             FROM offerings WHERE org_id = $1 GROUP BY member_id) s ON s.member_id = m.id
           WHERE m.org_id = $1 AND m.archived_at IS NULL
             AND ($2::text IS NULL OR ${fullName} ILIKE '%' || $2 || '%') AND ($3::text IS NULL OR m.status = $3)
             AND ($4::date IS NULL OR s.last_gift IS NULL OR s.last_gift < $4::date)
           ORDER BY given_this_year DESC LIMIT ${Math.min(Number(a.limit) || 50, 200)}`,
          [orgId, a.search || null, a.status || null, isoDate.test(a.no_gift_since || '') ? a.no_gift_since : null],
        ),
    },
    {
      name: 'year_overview',
      description: 'Dashboard overview for a year: totals, month-by-month with last year for comparison, breakdown by fund and method, goals and detected trends.',
      parameters: { type: 'OBJECT', properties: { year: { type: 'INTEGER' } } },
      run: async (a) => {
        const d = await dashboard(orgId, Number(a.year) || undefined);
        return { year: d.year, kpis: d.kpis, monthly: d.monthly, byFund: d.byFund, byMethod: d.byMethod, yearly: d.yearly, goals: d.goals, signals: d.insights.map((i) => ({ type: i.type, ...i.data })) };
      },
    },
  ];
}

r.post('/chat', async (req, res) => {
  const body = parse(
    z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(8000) })).min(1).max(40) }),
    req.body,
  );
  if (body.messages[body.messages.length - 1].role !== 'user') throw new HttpError(400, 'invalid_input');
  const text = await converse({
    system:
      (await persona(req.user.orgId, req.user.language)) +
      `\nYou can look things up with your tools; use them whenever a question involves figures, members or dates, and call them again with different filters if needed.
When the answer is a list or a comparison, present it as a compact Markdown table, then add one or two sentences explaining what it means. When asked for a report, give it a short bold title and the period it covers.
If a request is unrelated to the church's treasury, members or this app, politely steer back.`,
    contents: body.messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    tools: tools(req.user.orgId),
  });
  res.json({ text });
});

export default r;

// ─── Reading photos: a notebook page or checks ───────────────────────────────

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * Reads a photo of the offering notebook or of one or more checks and proposes offerings.
 * Nothing is saved here: the person reviews every row before saving.
 */
r.post('/read-image', imageUpload.single('file'), async (req, res) => {
  if (!req.file || !/^image\/(jpeg|png|webp|heic|heif)$/.test(req.file.mimetype)) throw new HttpError(400, 'file_not_image');
  const kind = req.body?.kind === 'check' ? 'check' : 'ledger';
  let jpeg: Buffer;
  try {
    jpeg = await sharp(req.file.buffer).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } catch {
    throw new HttpError(400, 'file_not_image');
  }
  const [members, funds] = await Promise.all([
    q(`SELECT m.id, ${fullName} AS name, m.envelope_number FROM members m WHERE m.org_id = $1 AND m.archived_at IS NULL`, [req.user.orgId]),
    q('SELECT id, name FROM funds WHERE org_id = $1 AND archived_at IS NULL ORDER BY sort_order', [req.user.orgId]),
  ]);
  const what = kind === 'check'
    ? 'This is a photo of one or more paper checks given to a church. For each check read: the payer name printed on it (member), the amount (prefer the written-out legal amount when the numeric one is unclear), the check number, the date, and the memo line (notes; a memo like "diezmo" or "tithe" tells the fund). Method is always "check".'
    : 'This is a photo of a page of a church treasurer\'s handwritten offering notebook (in Spanish or English). Each line is usually one offering: a name or envelope number, an amount, sometimes a fund (diezmo/tithe, ofrenda, misiones…), a method (efectivo/cash, cheque/check with its number) and a date. Ignore subtotals, totals and crossed-out lines.';
  const out = await generateJson<{ rows: any[] }>({
    system: 'You read photos of church giving records and turn them into structured offering records. Output JSON only. Never invent rows that are not on the page.',
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } },
      { text:
`${what}

Known funds: ${funds.map((f) => f.name).join(', ')}
Known members (name | envelope number): ${members.map((m) => `${m.name}${m.envelope_number ? ' | ' + m.envelope_number : ''}`).join('; ')}

Return {"rows": [{"member": string|null, "envelope": string|null, "amount": number, "fund": string, "method": "cash"|"check"|"card"|"transfer"|"other", "check_number": string|null, "date": "YYYY-MM-DD"|null, "notes": string|null, "unsure": boolean}]}.
Rules: copy "member" exactly from the known members list when the writing clearly matches one (by name, nickname or envelope number), otherwise write the name as you read it; null when there is no name (loose offering). "fund" must be one of the known funds; default to the general offerings fund. Default method is "cash" for notebooks. Set "unsure": true for any row whose name or amount is hard to read.` },
    ] }],
    temperature: 0,
  });
  res.json({ kind, rows: matchRows(out.rows, members, funds) });
});
