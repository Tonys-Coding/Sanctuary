// End-to-end API tests. They run against a real Postgres database (TEST_DATABASE_URL)
// and a stand-in Gemini server, so no API key or network access is needed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const geminiRequests: any[] = [];
let retiredModel = '';
const fakeGemini = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url?.startsWith('/models')) {
    res.setHeader('content-type', 'application/json');
    const m = (name: string, methods = ['generateContent']) => ({ name: `models/${name}`, supportedGenerationMethods: methods });
    return void res.end(JSON.stringify({ models: [m('gemini-2.5-flash'), m('gemini-3.6-flash'), m('gemini-3.6-flash-lite'), m('gemini-3.9-flash-preview'), m('gemini-3.6-pro'), m('text-embedding-004', ['embedContent'])] }));
  }
  if (retiredModel && req.url?.includes(`/models/${retiredModel}:`)) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    return void res.end(JSON.stringify({ error: { code: 404, message: `models/${retiredModel} is not found` } }));
  }
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = JSON.parse(raw);
    geminiRequests.push({ url: req.url, key: req.headers['x-goog-api-key'], body });
    const last = body.contents[body.contents.length - 1];
    const answered = last.parts.some((p: any) => p.functionResponse);
    const parts = body.tools && !answered
      ? [{ functionCall: { name: 'offering_totals', args: { group_by: 'none' }, id: 'call-1' }, thoughtSignature: 'sig-abc' }]
      : body.generationConfig.responseMimeType === 'application/json'
        ? [{ text: JSON.stringify({ subject: 'Asunto', body: 'Cuerpo', rows: [{ member: 'Ana Pérez', amount: 50, fund: 'Diezmos', method: 'cash' }, { member: null, amount: 12.5, fund: 'Ofrendas', method: 'cash' }] }) }]
        : [{ text: 'thinking…', thought: true }, { text: answered ? `Total: ${last.parts[0].functionResponse.response.result.total}` : 'Resumen de prueba' }];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts } }] }));
  });
});

// Stand-in for Twilio: accepts every number except +15550000000.
const smsSent: { to: string; body: string; from?: string; auth?: string }[] = [];
const fakeTwilio = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const f = new URLSearchParams(raw);
    res.setHeader('content-type', 'application/json');
    if (f.get('To') === '+15550000000') { res.statusCode = 400; return void res.end(JSON.stringify({ code: 21211, message: "The 'To' number is not a valid phone number." })); }
    smsSent.push({ to: f.get('To')!, body: f.get('Body')!, from: f.get('From') || undefined, auth: req.headers.authorization });
    res.statusCode = 201;
    res.end(JSON.stringify({ sid: `SM${smsSent.length}` }));
  });
});

let base = '';
let server: http.Server;
let pool: { end: () => Promise<void>; query: (sql: string) => Promise<unknown> };
const resetLinks: string[] = [];

before(async () => {
  await new Promise<void>((r) => fakeGemini.listen(0, r));
  await new Promise<void>((r) => fakeTwilio.listen(0, r));
  process.env.TWILIO_ACCOUNT_SID = 'AC123';
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  process.env.TWILIO_FROM = '+12105559999';
  process.env.TWILIO_BASE_URL = `http://localhost:${(fakeTwilio.address() as AddressInfo).port}`;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://sanctuary:sanctuary@localhost:5432/sanctuary_test';
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_BASE_URL = `http://localhost:${(fakeGemini.address() as AddressInfo).port}`;
  process.env.SMTP_HOST = '';
  process.env.UPLOAD_DIR = '/tmp/sanctuary-test-uploads';
  const db = await import('../db.js');
  pool = db.pool;
  await pool.query('DROP SCHEMA IF EXISTS sanctuary CASCADE');
  await db.migrate();
  const { createApp } = await import('../app.js');
  server = createApp().listen(0);
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
  const log = console.log;
  console.log = (...a: unknown[]) => {
    const m = String(a[0]).match(/restablecer\?token=(\S+)/);
    if (m) resetLinks.push(m[1]); else log(...a);
  };
});

after(async () => {
  server.close();
  fakeGemini.close();
  fakeTwilio.close();
  await pool.end();
});

/** A tiny browser: keeps the session cookie between calls. */
function client() {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) } as { status: number; body: any };
  };
  const form = async (path: string, fields: Record<string, string>, file?: { name: string; type: string; data: Buffer | string }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    if (file) fd.set("file", new Blob([typeof file.data === "string" ? file.data : new Uint8Array(file.data)], { type: file.type }), file.name);
    const res = await fetch(base + path, { method: 'POST', headers: { cookie }, body: fd });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) } as { status: number; body: any };
  };
  return {
    get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b ?? {}), patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b), del: (p: string) => call('DELETE', p), form,
  };
}

const a = client(); // founder of church A
const a2 = client(); // joins church A with an invitation
const b = client(); // founder of church B
let fundA = '';
let memberA = '';
let offeringA = '';
const year = new Date().getFullYear();

test('creating a church sets up default funds and a session', async () => {
  const r = await a.post('/auth/register', { mode: 'create', churchName: 'Iglesia A', fullName: 'Ana Tesorera', email: 'ana@a.test', password: 'password-a1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.org.name, 'Iglesia A');
  assert.equal(r.body.features.ai, true);
  const funds = (await a.get('/funds')).body;
  assert.deepEqual(funds.map((f: any) => f.name), ['Diezmos', 'Ofrendas', 'Misiones', 'Construcción', 'Primicias']);
  fundA = funds[0].id;
  assert.equal((await client().get('/members')).status, 401);
});

test('invitation codes let a second person join the same church, once', async () => {
  const inv = (await a.post('/org/invitations', { maxUses: 1, expiresInDays: 7 })).body;
  assert.match(inv.code, /^[A-Z2-9]{8}$/);
  assert.equal((await client().get(`/auth/invite/${inv.code.toLowerCase()}`)).body.churchName, 'Iglesia A');
  const r = await a2.post('/auth/register', { mode: 'join', inviteCode: `${inv.code.slice(0, 4)}-${inv.code.slice(4)}`, fullName: 'Luis Contador', email: 'luis@a.test', password: 'password-l1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.org.name, 'Iglesia A');
  const again = await client().post('/auth/register', { mode: 'join', inviteCode: inv.code, fullName: 'Otro', email: 'otro@a.test', password: 'password-o1' });
  assert.equal(again.status, 400);
  assert.equal(again.body.error, 'invite_invalid');
  assert.equal((await client().post('/auth/register', { mode: 'join', inviteCode: 'NOPE0000', fullName: 'X Y', email: 'x@a.test', password: 'password-x1' })).status, 400);
  assert.equal((await a.get('/org/team')).body.length, 2);
});

test('members and offerings are shared inside a church and feed the dashboard', async () => {
  const m = await a.post('/members', { first_name: 'Ana', last_name: 'Pérez', email: 'ana.perez@a.test', address: '1 Calle Uno', city: 'Austin' });
  assert.equal(m.status, 201);
  memberA = m.body.id;
  const o = await a2.post('/offerings', { member_id: memberA, fund_id: fundA, amount: '250.5', date: `${year}-01-10`, method: 'check', check_number: '101' });
  assert.equal(o.status, 201);
  offeringA = o.body.id;
  assert.equal(o.body.member_name, 'Ana Pérez');
  await a.post('/offerings', { member_id: null, fund_id: fundA, amount: 40, date: `${year}-01-10` });
  assert.equal((await a.post('/offerings', { fund_id: fundA, amount: -5, date: `${year}-01-10` })).status, 400);

  const list = (await a.get(`/offerings?from=${year}-01-01&q=pérez`)).body;
  assert.equal(list.count, 1);
  assert.equal(list.total, 250.5);
  const d = (await a.get(`/reports/dashboard?year=${year}`)).body;
  assert.equal(d.kpis.total, 290.5);
  assert.equal(d.kpis.loose, 40);
  assert.equal(d.monthly[0].total, 290.5);
  assert.equal(d.topMembers[0].name, 'Ana Pérez');
  const activity = (await a.get('/org/activity')).body;
  assert.ok(activity.some((e: any) => e.entity === 'offering' && e.user_name === 'Luis Contador'));
});

test('another church can never see or touch this church’s data', async () => {
  const r = await b.post('/auth/register', { mode: 'create', churchName: 'Iglesia B', fullName: 'Beto', email: 'beto@b.test', password: 'password-b1', language: 'en' });
  assert.equal(r.status, 201);
  assert.equal((await b.get('/members')).body.length, 0);
  assert.equal((await b.get('/offerings')).body.count, 0);
  assert.equal((await b.get(`/members/${memberA}`)).status, 404);
  assert.equal((await b.patch(`/members/${memberA}`, { first_name: 'Hack' })).status, 404);
  assert.equal((await b.del(`/offerings/${offeringA}`)).status, 404);
  assert.equal((await b.patch(`/funds/${fundA}`, { name: 'Hack' })).status, 404);
  const fundB = (await b.get('/funds')).body[0];
  assert.equal(fundB.name, 'Tithes');
  // Mixing ids across churches is refused in both directions.
  assert.equal((await b.post('/offerings', { fund_id: fundA, amount: 5, date: `${year}-01-01` })).status, 400);
  assert.equal((await b.post('/offerings', { fund_id: fundB.id, member_id: memberA, amount: 5, date: `${year}-01-01` })).status, 400);
  assert.equal((await b.post('/reports/run', { type: 'member', memberId: memberA, from: `${year}-01-01`, to: `${year}-12-31` })).status, 400);
  assert.equal((await b.get(`/reports/tax/statements.pdf?year=${year}&memberId=${memberA}`)).status, 404);
  assert.equal((await b.get(`/reports/dashboard?year=${year}`)).body.kpis.total, 0);
  assert.equal((await a.get(`/members/${memberA}`)).body.member.first_name, 'Ana');
});

test('reports, PDFs and tax statements', async () => {
  const spec = { type: 'summary', from: `${year}-01-01`, to: `${year}-12-31`, lang: 'en' };
  const rep = (await a.post('/reports/run', spec)).body;
  assert.equal(rep.title, 'Giving summary');
  assert.equal(rep.highlights[0].value, 290.5);
  const pdf = await a.post('/reports/pdf', spec);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  const csv = await a.post('/reports/csv', { ...spec, type: 'transactions' });
  assert.match(csv.body.toString(), /Ana Pérez/);

  const tax = (await a.get(`/reports/tax?year=${year}`)).body;
  assert.equal(tax.totals.deductible, 250.5);
  assert.equal(tax.totals.loose, 40);
  assert.equal(tax.members[0].needs_acknowledgment, true);
  assert.equal(tax.readiness.tax_id, false);
  const st = await a.get(`/reports/tax/statements.pdf?year=${year}`);
  assert.equal(st.body.subarray(0, 4).toString(), '%PDF');
  // Without SMTP configured, e-mailing answers with a clear error instead of pretending.
  const mail = await a.post('/reports/tax/email', { year, memberIds: [memberA], subject: 'Hola', message: 'Hola {nombre}' });
  assert.equal(mail.status, 503);
  assert.equal(mail.body.error, 'email_not_configured');
});

test('non-deductible funds are left out of tax statements', async () => {
  const f = (await a.post('/funds', { name: 'Venta de comida', color_slot: 6, tax_deductible: false })).body;
  await a.post('/offerings', { member_id: memberA, fund_id: f.id, amount: 30, date: `${year}-02-01` });
  const tax = (await a.get(`/reports/tax?year=${year}`)).body;
  assert.equal(tax.totals.deductible, 250.5);
  assert.equal(tax.totals.non_deductible, 30);
  assert.equal((await a.del(`/funds/${f.id}`)).body.error, 'fund_in_use');
});

test('counts group offerings and reconcile cash', async () => {
  const batch = (await a.post('/batches', { date: `${year}-03-01`, name: 'Culto dominical', attendance: '80' })).body;
  await a.post('/offerings', { fund_id: fundA, batch_id: batch.id, amount: 60, date: batch.date, method: 'cash' });
  await a.post('/offerings', { fund_id: fundA, batch_id: batch.id, amount: 100, date: batch.date, method: 'check' });
  const closed = await a.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, denominations: { '20': 3 }, status: 'closed' });
  assert.equal(closed.body.status, 'closed');
  const got = (await a.get(`/batches/${batch.id}`)).body;
  assert.equal(got.total, 160);
  assert.equal(got.cash_total, 60);
  assert.deepEqual(got.denominations, { '20': 3 });
  assert.equal((await b.get(`/batches/${batch.id}`)).status, 404);
});

test('password reset signs out old sessions and accepts the new password', async () => {
  assert.equal((await client().post('/auth/forgot', { email: 'nobody@a.test' })).body.ok, true);
  assert.equal(resetLinks.length, 0);
  await client().post('/auth/forgot', { email: 'luis@a.test' });
  assert.equal(resetLinks.length, 1);
  assert.equal((await client().post('/auth/reset', { token: 'wrong-token-value', password: 'new-password-1' })).status, 400);
  assert.equal((await client().post('/auth/reset', { token: resetLinks[0], password: 'new-password-1' })).status, 200);
  assert.equal((await client().post('/auth/reset', { token: resetLinks[0], password: 'again-password' })).status, 400);
  assert.equal((await a2.get('/auth/me')).status, 401);
  assert.equal((await client().post('/auth/login', { email: 'luis@a.test', password: 'password-l1' })).status, 401);
  assert.equal((await a2.post('/auth/login', { email: 'luis@a.test', password: 'new-password-1' })).status, 200);
});

test('AI: summary, assistant tool calls and note parsing go through Gemini', async () => {
  const summary = await a.post('/ai/dashboard-summary', { year });
  assert.equal(summary.body.text, 'Resumen de prueba'); // "thought" parts are dropped
  assert.equal((await a.post('/ai/dashboard-summary', { year })).body.cached, true);
  assert.equal(geminiRequests[0].key, 'test-key');
  assert.match(geminiRequests[0].url, /\/models\/.+:generateContent$/);

  geminiRequests.length = 0;
  const chat = await a.post('/ai/chat', { messages: [{ role: 'user', text: '¿Cuánto hemos recibido?' }] });
  assert.equal(chat.body.text, 'Total: 480.5');
  assert.equal(geminiRequests.length, 2);
  const second = geminiRequests[1].body.contents;
  assert.equal(second[1].parts[0].thoughtSignature, 'sig-abc'); // model turn echoed back untouched
  assert.equal(second[2].parts[0].functionResponse.id, 'call-1');
  // The assistant's database tools only ever see the caller's own church.
  assert.equal((await b.post('/ai/chat', { messages: [{ role: 'user', text: 'total?' }] })).body.text, 'Total: null');

  const parsed = (await a.post('/ai/parse-offerings', { text: 'Ana Pérez 50 diezmo y 12.50 suelta' })).body.rows;
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].member_id, memberA);
  assert.equal(parsed[0].fund_id, fundA);
  assert.equal(parsed[1].member_id, null);
  assert.equal(parsed[1].fund_name, 'Ofrendas');
});

test('CSV import accepts Spanish headers, day-first dates and creates what is missing', async () => {
  const form = new FormData();
  form.append('file', new Blob(['Fecha;Miembro;Monto;Fondo;Método\n15/04/' + year + ';Ana Pérez;"1.250,50";Diezmos;Cheque\n16/04/' + year + ';Nuevo Hermano;20;Jóvenes;Efectivo\nmal;X;abc;;\n']), 'ofrendas.csv');
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ana@a.test', password: 'password-a1' }) });
  const res = await fetch(base + '/data/import/offerings', { method: 'POST', headers: { cookie: login.headers.get('set-cookie')!.split(';')[0] }, body: form });
  const out: any = await res.json();
  assert.deepEqual({ created: out.created, newMembers: out.newMembers, newFunds: out.newFunds, errorCount: out.errorCount }, { created: 2, newMembers: 1, newFunds: 1, errorCount: 1 });
  const list = (await a.get(`/offerings?from=${year}-04-15&to=${year}-04-15`)).body;
  assert.equal(list.rows[0].amount, 1250.5);
  assert.equal(list.rows[0].method, 'check');
});

test('requests from other websites are refused, even behind proxies that rewrite the Host', async () => {
  const login = (headers: Record<string, string>) =>
    fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ email: 'ana@a.test', password: 'password-a1' }) }).then((r) => r.status);
  // Codespaces / dev proxy: Host says localhost, the browser's Origin is the public URL.
  assert.equal(await login({ host: 'localhost:5173', origin: 'https://abc-5173.app.github.dev', 'sec-fetch-site': 'same-origin' }), 200);
  assert.equal(await login({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), 403);
  assert.equal(await login({ origin: 'https://other-5173.app.github.dev', 'sec-fetch-site': 'same-site' }), 403);
  // Browsers without Sec-Fetch-Site: Origin must match the server's own address.
  assert.equal(await login({ origin: 'https://evil.example' }), 403);
});

test('text messages: consent, phone clean-up, sending, failures and scheduling', async () => {
  const mk = async (first: string, phone: string | null, sms_opt_in: boolean) => (await a.post('/members', { first_name: first, last_name: 'Prueba', phone, sms_opt_in })).body.id as string;
  const yes = await mk('Rosa', '(210) 555-0142', true);
  const no = await mk('Juan', '(210) 555-0143', false);
  const nophone = await mk('Lola', null, true);
  const bad = await mk('Malo', '555 000 0000', true);

  const r = (await a.post('/messages', { memberIds: [yes, no, nophone, bad], message: 'Hola {nombre}, el culto empieza a las 10.' })).body;
  assert.equal(r.queued, 2);
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 1);
  assert.deepEqual(r.skipped.map((x: any) => x.reason).sort(), ['no_consent', 'no_phone']);
  assert.deepEqual(smsSent[0], { to: '+12105550142', body: 'Hola Rosa, el culto empieza a las 10.', from: '+12105559999', auth: `Basic ${Buffer.from('AC123:secret').toString('base64')}` });
  const log = (await a.get('/messages')).body.messages;
  assert.match(log.find((m: any) => m.status === 'failed').error, /not a valid phone number/);
  // Other churches can neither text these members nor see the log.
  assert.equal((await b.post('/messages', { memberIds: [yes], message: 'hola' })).body.queued, 0);
  assert.equal((await b.get('/messages')).body.messages.length, 0);

  // Scheduled for later: nothing goes out now; it can be cancelled.
  const later = new Date(Date.now() + 3600e3).toISOString();
  const s = (await a.post('/messages', { memberIds: [yes], message: 'Recordatorio', sendAt: later, kind: 'reminder' })).body;
  assert.equal(s.scheduled, 1);
  assert.equal(smsSent.length, 1);
  const pending = (await a.get('/messages')).body.messages.find((m: any) => m.status === 'scheduled');
  assert.equal((await b.del(`/messages/${pending.id}`)).status, 404);
  assert.equal((await a.del(`/messages/${pending.id}`)).status, 200);
  // A send to several people is cancelled as one.
  const group = (await a.post('/messages', { memberIds: [yes, bad], message: 'Grupo', sendAt: later })).body;
  assert.equal(group.scheduled, 2);
  const batch = (await a.get('/messages')).body.messages.find((m: any) => m.body === 'Grupo').batch_id;
  assert.equal((await b.del(`/messages/batch/${batch}`)).status, 404);
  assert.equal((await a.del(`/messages/batch/${batch}`)).body.canceled, 2);

  // A scheduled text whose time has come is sent by the background loop.
  const { sendDue, normalizePhone, segments } = await import('../lib/sms.js');
  await pool.query(`INSERT INTO sanctuary.sms_messages (org_id, member_id, to_phone, body, send_at)
                    SELECT org_id, id, '+12105550142', 'Ya es hora', now() - interval '1 minute' FROM sanctuary.members WHERE id = '${yes}'`);
  assert.equal(await sendDue(), 1);
  assert.equal(smsSent[smsSent.length - 1].body, 'Ya es hora');

  assert.equal(normalizePhone('+52 55 1234 5678'), '+525512345678');
  assert.equal(normalizePhone('1-210-555-0142'), '+12105550142');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(segments('Hola'.repeat(40)), 1);        // 160 plain characters: one message
  assert.equal(segments('á' + 'a'.repeat(70)), 2);      // an accent switches to the 70-character alphabet
});

test('birthday greetings and upcoming celebrations', async () => {
  const { queueBirthdays, sendDue } = await import('../lib/sms.js');
  const { upcomingCelebrations } = await import('../lib/analytics.js');
  const id = (await a.post('/members', { first_name: 'Cumple', last_name: 'Añero', phone: '2105550199', sms_opt_in: true, birth_date: '1980-03-14', joined_date: '2020-03-20' })).body.id;
  await a.patch('/messages/birthday', { enabled: true, message: '¡Feliz cumpleaños, {nombre}! — {iglesia}' });
  const before = smsSent.length;
  assert.equal(await queueBirthdays(new Date(2031, 2, 14, 8, 0)), 0); // before 9:00 nothing happens
  assert.equal(await queueBirthdays(new Date(2031, 2, 14, 9, 5)), 1);
  assert.equal(await queueBirthdays(new Date(2031, 2, 14, 15, 0)), 0); // only once a day
  await sendDue();
  assert.equal(smsSent.length, before + 1);
  assert.equal(smsSent[smsSent.length - 1].body, '¡Feliz cumpleaños, Cumple! — Iglesia A');

  const rows = [{ id, name: 'Cumple Añero', first_name: 'Cumple', birth_date: '1980-03-14', joined_date: '2020-03-20', sms_opt_in: true, phone: 'x' },
                { id: 'leap', name: 'Bisiesto', first_name: 'B', birth_date: '2000-02-29', joined_date: null }];
  const soon = upcomingCelebrations(rows, '2031-03-10');
  assert.deepEqual(soon.map((c) => [c.kind, c.in_days, c.years]), [['birthday', 4, 51], ['anniversary', 10, 11]]);
  assert.equal(upcomingCelebrations(rows, '2031-02-27')[0].date, '2031-02-28'); // Feb 29 falls on Feb 28
  assert.equal(upcomingCelebrations(rows, '2032-02-27')[0].date, '2032-02-29');
});

test('AI: a retired model is replaced by the newest stable Flash model, and the connection test reports it', async () => {
  const before = (await a.get('/ai/status')).body.model;
  retiredModel = before;
  const r = await a.post('/ai/test');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.model, 'gemini-3.6-flash'); // stable beats preview; lite, pro and embedding models are skipped
  assert.ok(r.body.reply.length > 0);
  assert.equal((await a.get('/ai/status')).body.model, 'gemini-3.6-flash');
  retiredModel = '';
});

// ─── v3 ──────────────────────────────────────────────────────────────────────

const c = client(); // church C, used by the v3 tests
let fundC = '';
let offeringsFundC = '';
const ok = (r: { status: number; body: any }, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };

test('v3 · the church’s own time zone decides what "today" is', async () => {
  const { todayIn, hourIn } = await import('../http.js');
  const noonUtc = new Date('2026-01-01T12:00:00Z');
  assert.equal(todayIn('Pacific/Kiritimati', noonUtc), '2026-01-02');
  assert.equal(todayIn('Pacific/Pago_Pago', noonUtc), '2026-01-01');
  assert.equal(todayIn('America/Chicago', new Date('2026-03-02T03:30:00Z')), '2026-03-01');
  assert.equal(hourIn('America/Chicago', new Date('2026-07-01T14:00:00Z')), 9);

  const r = ok(await c.post('/auth/register', { mode: 'create', churchName: 'Iglesia C', fullName: 'Carla Tesorera', email: 'carla@c.test', password: 'password-c1', timezone: 'America/Chicago' }), 201);
  assert.equal(r.org.timezone, 'America/Chicago');
  const org = r.org;
  assert.equal((await c.patch('/org', { ...org, timezone: 'Mars/Olympus' })).status, 400);
  const saved = ok(await c.patch('/org', { ...org, timezone: 'America/Los_Angeles', fiscal_year_start: 7, idle_minutes: 10 }));
  assert.equal(saved.timezone, 'America/Los_Angeles');
  assert.equal(saved.fiscal_year_start, 7);
  // The change is in the activity log with what it was before and after.
  const act = ok(await c.get('/org/activity'));
  const entry = act.find((e: any) => e.entity === 'org');
  assert.deepEqual(entry.changes.timezone, ['America/Chicago', 'America/Los_Angeles']);
  assert.deepEqual(entry.changes.fiscal_year_start, [1, 7]);
  const funds = ok(await c.get('/funds'));
  fundC = funds[0].id;
  offeringsFundC = funds[1].id;
});

test('v3 · fiscal years: periods, labels and the dashboard follow the church’s fiscal year', async () => {
  const { fiscalYearOf, fiscalRange, fiscalLabel, fiscalMonths } = await import('../lib/period.js');
  assert.equal(fiscalYearOf('2026-06-30', 7), 2025);
  assert.equal(fiscalYearOf('2026-07-01', 7), 2026);
  assert.deepEqual(fiscalRange(2025, 7), { start: '2025-07-01', end: '2026-06-30' });
  assert.equal(fiscalLabel(2025, 7), '2025–26');
  assert.equal(fiscalLabel(2025, 1), '2025');
  assert.deepEqual(fiscalMonths(2025, 7)[0], { year: 2025, month: 7 });
  assert.deepEqual(fiscalMonths(2025, 7)[11], { year: 2026, month: 6 });

  ok(await c.post('/offerings', { fund_id: fundC, amount: 100, date: '2025-07-15' }), 201);
  ok(await c.post('/offerings', { fund_id: fundC, amount: 50, date: '2026-06-20' }), 201);
  ok(await c.post('/offerings', { fund_id: fundC, amount: 7, date: '2026-07-02' }), 201);
  const d = ok(await c.get('/reports/dashboard?year=2025'));
  assert.equal(d.label, '2025–26');
  assert.equal(d.start, '2025-07-01');
  assert.equal(d.kpis.total, 150);
  assert.equal(d.monthly[0].month, 7);
  assert.equal(d.monthly[0].total, 100);
  assert.equal(d.monthly[11].total, 50);
  assert.ok(d.years.some((y: any) => y.year === 2026 && y.label === '2026–27'));
});

test('v3 · a closed count is locked; reopening needs a reason and is recorded', async () => {
  const batch = ok(await c.post('/batches', { date: '2026-03-01', name: 'Culto dominical' }), 201);
  const off = ok(await c.post('/offerings', { fund_id: fundC, batch_id: batch.id, amount: 20, date: batch.date, method: 'cash' }), 201);
  ok(await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, status: 'closed' }));

  const edit = await c.patch(`/offerings/${off.id}`, { fund_id: fundC, batch_id: batch.id, amount: 25, date: batch.date, method: 'cash' });
  assert.equal(edit.status, 409);
  assert.equal(edit.body.error, 'batch_closed');
  assert.equal((await c.del(`/offerings/${off.id}`)).body.error, 'batch_closed');
  assert.equal((await c.post('/offerings', { fund_id: fundC, batch_id: batch.id, amount: 5, date: batch.date })).body.error, 'batch_closed');
  assert.equal((await c.patch(`/batches/${batch.id}`, { date: batch.date, name: 'Otro nombre', status: 'closed' })).body.error, 'batch_closed');
  assert.equal((await c.del(`/batches/${batch.id}`)).body.error, 'batch_closed');

  assert.equal((await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, status: 'open' })).body.error, 'reopen_reason_required');
  const reopened = ok(await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, status: 'open', reopen_reason: 'Faltó un sobre de $5' }));
  assert.equal(reopened.status, 'open');
  const act = ok(await c.get('/org/activity'));
  assert.ok(act.some((e: any) => e.action === 'reopen' && e.summary.includes('Faltó un sobre')));

  const changed = ok(await c.patch(`/offerings/${off.id}`, { fund_id: fundC, batch_id: batch.id, amount: 25, date: batch.date, method: 'cash' }));
  assert.equal(changed.amount, 25);
  const log = ok(await c.get('/org/activity')).find((e: any) => e.entity === 'offering' && e.action === 'update');
  assert.deepEqual(log.changes.amount, [20, 25]);
  ok(await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, status: 'closed' }));
});

test('v3 · envelope numbers are unique; duplicate people can be found and merged', async () => {
  const one = ok(await c.post('/members', { first_name: 'José', last_name: 'García', envelope_number: '12', phone: '(210) 555-0100' }), 201);
  const taken = await c.post('/members', { first_name: 'Otro', last_name: 'Señor', envelope_number: '12' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error, 'envelope_taken');
  assert.equal(taken.body.detail.name, 'José García');
  const two = ok(await c.post('/members', { first_name: 'Jose', last_name: 'Garcia', email: 'jose@c.test', phone: '210.555.0100' }), 201);
  const lone = ok(await c.post('/members', { first_name: 'María', last_name: 'López' }), 201);
  ok(await c.post('/offerings', { member_id: two.id, fund_id: fundC, amount: 40, date: '2026-04-05' }), 201);

  const dups = ok(await c.get('/members/duplicates'));
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].reasons.sort(), ['name', 'phone']);
  const merged = ok(await c.post(`/members/${one.id}/merge`, { other_id: two.id }));
  assert.equal(merged.moved.offerings, 1);
  const kept = ok(await c.get(`/members/${one.id}`));
  assert.equal(kept.member.email, 'jose@c.test');
  assert.equal(kept.member.envelope_number, '12');
  assert.equal((await c.get(`/members/${two.id}`)).status, 404);
  assert.equal(ok(await c.get('/members/duplicates')).length, 0);

  // "They are different people" is remembered.
  const three = ok(await c.post('/members', { first_name: 'Maria', last_name: 'Lopez' }), 201);
  assert.equal(ok(await c.get('/members/duplicates')).length, 1);
  ok(await c.post('/members/duplicates/dismiss', { a: lone.id, b: three.id }));
  assert.equal(ok(await c.get('/members/duplicates')).length, 0);
  // Another church cannot merge or dismiss our members.
  assert.equal((await b.post(`/members/${one.id}/merge`, { other_id: three.id })).status, 404);
});

test('v3 · backups are kept on the server and can be restored', async () => {
  const before = ok(await c.get('/offerings')).count;
  const { name } = ok(await c.post('/data/backups'), 201);
  assert.match(name, /manual\.json\.gz$/);
  const list = ok(await c.get('/data/backups'));
  assert.ok(list.some((x: any) => x.name === name));
  assert.equal((await b.get(`/data/backups/${name}`)).status, 404);
  const file = ok(await c.get(`/data/backups/${name}`));
  assert.equal(file.app, 'Sanctuary');

  // Changes made after the backup disappear when it is restored.
  const extra = ok(await c.post('/members', { first_name: 'Temporal', last_name: 'Prueba' }), 201);
  assert.equal((await c.form('/data/restore', { backup: name, confirm: 'si' })).body.error, 'restore_confirm');
  const res = ok(await c.form('/data/restore', { backup: name, confirm: 'RESTAURAR' }));
  assert.equal(res.counts.offerings, before);
  assert.match(res.safety, /before-restore/);
  assert.equal(ok(await c.get('/offerings')).count, before);
  assert.ok(!ok(await c.get('/members')).some((m: any) => m.id === extra.id));
  // Restoring from an uploaded copy works too, and garbage is refused.
  const up = ok(await c.form('/data/restore', { confirm: 'RESTORE' }, { name: 'copia.json', type: 'application/json', data: JSON.stringify(file) }));
  assert.equal(up.counts.offerings, before);
  assert.equal((await c.form('/data/restore', { confirm: 'RESTORE' }, { name: 'x.json', type: 'application/json', data: '{"hola":1}' })).body.error, 'backup_invalid');
  const funds = ok(await c.get('/funds'));
  fundC = funds[0].id;
  offeringsFundC = funds[1].id;
});

test('v3 · automatic backups: one per church per day', async () => {
  const { autoBackups } = await import('../lib/backup.js');
  await autoBackups();
  await autoBackups();
  const autos = ok(await c.get('/data/backups')).filter((x: any) => x.kind === 'auto');
  assert.equal(autos.length, 1);
});

let depositBatch = '';
test('v3 · bank deposits: slip, deposited, reconciled; deposited counts cannot reopen', async () => {
  const batch = ok(await c.post('/batches', { date: '2026-05-03', name: 'Culto 3 de mayo', denominations: { '20': 2, '1': 5 } }), 201);
  depositBatch = batch.id;
  const m = ok(await c.get('/members')).find((x: any) => x.first_name === 'José');
  ok(await c.post('/offerings', { fund_id: fundC, batch_id: batch.id, amount: 45, date: batch.date, method: 'cash' }), 201);
  ok(await c.post('/offerings', { member_id: m.id, fund_id: fundC, batch_id: batch.id, amount: 100, date: batch.date, method: 'check', check_number: '555' }), 201);
  ok(await c.post('/offerings', { fund_id: fundC, batch_id: batch.id, amount: 30, date: batch.date, method: 'card' }), 201);

  assert.equal((await c.post('/deposits', { date: '2026-05-04', batch_ids: [batch.id] })).body.error, 'batch_not_closed');
  ok(await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, denominations: { '20': 2, '1': 5 }, status: 'closed' }));
  const lists = ok(await c.get('/deposits'));
  assert.ok(lists.pending.some((p: any) => p.id === batch.id));
  assert.equal((await c.post('/deposits', { date: '2026-05-04', batch_ids: [] })).body.error, 'deposit_needs_batches');
  const dep = ok(await c.post('/deposits', { date: '2026-05-04', account: 'Cuenta 1234', batch_ids: [batch.id] }), 201);
  assert.equal(dep.cash, 45);
  assert.equal(dep.checks, 100);
  assert.equal(dep.total, 145);
  assert.equal((await c.post('/deposits', { date: '2026-05-04', batch_ids: [batch.id] })).body.error, 'batch_already_deposited');
  assert.equal((await b.get(`/deposits/${dep.id}`)).status, 404);

  const detail = ok(await c.get(`/deposits/${dep.id}`));
  assert.deepEqual(detail.denominations, [{ value: 20, count: 2 }, { value: 1, count: 5 }]);
  assert.equal(detail.check_list[0].check_number, '555');
  assert.equal(detail.checks, 100);
  const slip = await c.get(`/deposits/${dep.id}/slip.pdf`);
  assert.equal(slip.body.subarray(0, 4).toString(), '%PDF');

  ok(await c.patch(`/deposits/${dep.id}`, { status: 'deposited' }));
  assert.equal((await c.patch(`/batches/${batch.id}`, { date: batch.date, name: batch.name, status: 'open', reopen_reason: 'error' })).body.error, 'batch_deposited');
  assert.equal((await c.del(`/deposits/${dep.id}`)).body.error, 'deposit_locked');
  assert.equal((await c.patch(`/deposits/${dep.id}`, { status: 'reconciled' })).body.error, 'bank_amount_required');
  const diffErr = await c.patch(`/deposits/${dep.id}`, { status: 'reconciled', bank_amount: 140 });
  assert.equal(diffErr.body.error, 'reconcile_note_required');
  assert.equal(diffErr.body.detail.difference, -5);
  const rec = ok(await c.patch(`/deposits/${dep.id}`, { status: 'reconciled', bank_amount: 140, reconcile_note: 'Billete falso de $5' }));
  assert.equal(rec.status, 'reconciled');
  assert.ok(rec.reconciled_at);
});

test('v3 · expenses, budget, balance and the treasurer’s report', async () => {
  const org = ok(await c.get('/org'));
  ok(await c.patch('/org', { ...org, fiscal_year_start: 1, opening_balance: 1000, opening_balance_date: '2026-01-01' }));
  const cats = ok(await c.get('/expenses/categories'));
  assert.equal(cats[0].name, 'Salarios y honorarios');
  const utilities = cats[2];
  const e1 = ok(await c.post('/expenses', { date: '2026-05-10', category_id: utilities.id, payee: 'Compañía de luz', amount: '120.40', method: 'check', reference: '1001' }), 201);
  assert.equal(e1.category, utilities.name);
  ok(await c.post('/expenses', { date: '2026-05-20', category_id: cats[0].id, payee: 'Pastor', amount: 500 }), 201);
  assert.equal((await c.post('/expenses', { date: '2026-05-20', category_id: cats[0].id, payee: 'X', amount: 0 })).status, 400);
  assert.equal((await b.post('/expenses', { date: '2026-05-20', category_id: cats[0].id, payee: 'X', amount: 5 })).body.error, 'invalid_category');

  const png = await (await import('sharp')).default({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer();
  const rc = ok(await c.form(`/expenses/${e1.id}/receipt`, {}, { name: 'recibo.png', type: 'image/png', data: png }));
  assert.match(rc.receipt_file, /\.webp$/);
  assert.equal((await c.form(`/expenses/${e1.id}/receipt`, {}, { name: 'x.txt', type: 'text/plain', data: 'hola' })).body.error, 'file_not_receipt');

  ok(await c.put('/expenses/budget', { year: 2026, amounts: [{ category_id: utilities.id, amount: 1200 }, { category_id: cats[0].id, amount: '' }] }));
  const sum = ok(await c.get('/expenses/summary?year=2026'));
  const u = sum.categories.find((x: any) => x.id === utilities.id);
  assert.equal(u.budget, 1200);
  assert.equal(u.spent, 120.4);
  assert.equal(sum.months.find((m: any) => m.month === 5).expenses, 620.4);
  assert.equal(sum.totals.spent, 620.4);

  const tr = ok(await c.post('/reports/run', { type: 'treasurer', from: '2026-05-01', to: '2026-05-31' }));
  const income2026BeforeMay = 25 + 40; // offerings dated Jan–Apr 2026 in church C
  const opening = 1000 + income2026BeforeMay;
  assert.equal(tr.highlights[0].value, opening);
  assert.equal(tr.highlights[1].value, 175);
  assert.equal(tr.highlights[2].value, 620.4);
  assert.equal(tr.highlights[3].value, Math.round((opening + 175 - 620.4) * 100) / 100);
  assert.ok(tr.sections.some((s: any) => s.title === 'Depósitos bancarios' && s.rows[0].status === 'Conciliado'));
  assert.ok(tr.sections.some((s: any) => s.title?.startsWith('Presupuesto del año fiscal') && s.rows[0].used === 10));
  const pdf = await c.post('/reports/pdf', { type: 'treasurer', from: '2026-05-01', to: '2026-05-31' });
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');
  const ex = ok(await c.post('/reports/run', { type: 'expenses', from: '2026-05-01', to: '2026-05-31', lang: 'en' }));
  assert.equal(ex.title, 'Expense detail');
  assert.equal(ex.highlights[0].value, 620.4);

  assert.equal((await c.del(`/expenses/categories/${utilities.id}`)).body.error, 'category_in_use');
  ok(await c.del(`/expenses/${e1.id}`));
});

test('v3 · the monthly board report is e-mailed once, on the chosen day', async () => {
  const { env } = await import('../env.js');
  const { sendBoardReports, previousMonth } = await import('../lib/boardReport.js');
  assert.deepEqual(previousMonth('2026-01-05'), { from: '2025-12-01', to: '2025-12-31', key: '2025-12' });
  assert.deepEqual(previousMonth('2026-03-05'), { from: '2026-02-01', to: '2026-02-28', key: '2026-02' });
  env.smtp.host = 'test';
  try {
    const org = ok(await c.get('/org'));
    ok(await c.patch('/org', { ...org, board_emails: 'junta@c.test, pastor@c.test; no-es-correo', board_report_enabled: true, board_report_day: 5 }));
    const tz = org.timezone;
    const at = (iso: string) => { const d = new Date(iso); return d; };
    // On the 4th nothing is sent; on the 6th at noon (church time) last month's report goes out once.
    await sendBoardReports(at('2026-06-04T20:00:00Z'));
    const { pool: p } = await import('../db.js');
    const count = async () => Number(((await p.query("SELECT count(*) AS n FROM sanctuary.email_log WHERE kind = 'board'")) as any).rows[0].n);
    assert.equal(await count(), 0);
    await sendBoardReports(at('2026-06-06T20:00:00Z'));
    assert.equal(await count(), 2);
    await sendBoardReports(at('2026-06-06T21:00:00Z'));
    assert.equal(await count(), 2);
    assert.equal(ok(await c.get('/org')).board_report_last, '2026-05');
    const test = ok(await c.post('/org/board-report/test'));
    assert.equal(test.sent, 2);
    assert.ok(tz);
  } finally {
    env.smtp.host = '';
  }
});

test('v3 · households get one joint statement; goods received and gifts of property follow the tax rules', async () => {
  const ana = ok(await c.post('/members', { first_name: 'Ana', last_name: 'Ruiz', email: 'ana@ruiz.test', address: '5 Calle', city: 'Austin' }), 201);
  const beto = ok(await c.post('/members', { first_name: 'Beto', last_name: 'Ruiz', email: 'beto@ruiz.test' }), 201);
  const h = ok(await c.post('/households', { name: 'Familia Ruiz', joint_statement: true, member_ids: [ana.id, beto.id] }), 201);
  assert.equal(h.members.length, 2);
  assert.equal((await b.post('/households', { name: 'X', member_ids: [ana.id] })).body.error, 'invalid_member');
  ok(await c.post('/offerings', { member_id: ana.id, fund_id: fundC, amount: 200, date: '2026-02-01' }), 201);
  ok(await c.post('/offerings', { member_id: beto.id, fund_id: fundC, amount: 100, date: '2026-02-08', goods_value: 30, notes: 'Cena de gala' }), 201);
  assert.equal((await c.post('/offerings', { member_id: beto.id, fund_id: fundC, amount: 10, date: '2026-02-08', goods_value: 20 })).status, 400);
  ok(await c.post('/noncash', { member_id: beto.id, date: '2026-03-01', description: 'Refrigerador usado para la cocina' }), 201);

  const tax = ok(await c.get('/reports/tax?year=2026'));
  const row = tax.members.find((m: any) => m.id === `h:${h.id}`);
  assert.ok(row, 'joint statement row');
  assert.equal(row.name, 'Familia Ruiz');
  assert.equal(row.deductible, 270);
  assert.equal(row.goods, 30);
  assert.equal(row.quid_pro_quo, true);
  assert.equal(row.noncash, 1);
  assert.deepEqual(row.emails, ['ana@ruiz.test', 'beto@ruiz.test']);
  assert.ok(!tax.members.some((m: any) => m.id === ana.id || m.id === beto.id));
  const pdf = await c.get(`/reports/tax/statements.pdf?year=2026&memberId=h:${h.id}`);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  // Turning off the joint statement gives each person their own again.
  ok(await c.patch(`/households/${h.id}`, { name: 'Familia Ruiz', joint_statement: false }));
  const tax2 = ok(await c.get('/reports/tax?year=2026'));
  assert.equal(tax2.members.find((m: any) => m.id === beto.id).deductible, 70);
  assert.equal(tax2.members.find((m: any) => m.id === ana.id).deductible, 200);
});

test('v3 · pledges toward a goal show what each person has given', async () => {
  const goal = ok(await c.post('/goals', { name: 'Techo nuevo', fund_id: fundC, target_amount: 5000, start_date: '2026-01-01', end_date: '2026-12-31' }), 201);
  const jose = ok(await c.get('/members')).find((x: any) => x.first_name === 'José');
  ok(await c.put(`/goals/${goal.id}/pledges`, { member_id: jose.id, amount: 1000 }));
  ok(await c.put(`/goals/${goal.id}/pledges`, { member_id: jose.id, amount: 1200, notes: 'En 12 meses' }));
  const pledges = ok(await c.get(`/goals/${goal.id}/pledges`));
  assert.equal(pledges.length, 1);
  assert.equal(pledges[0].amount, 1200);
  assert.equal(pledges[0].given, 140);
  const g = ok(await c.get('/goals')).find((x: any) => x.id === goal.id);
  assert.equal(g.pledged, 1200);
  assert.equal((await b.put(`/goals/${goal.id}/pledges`, { member_id: jose.id, amount: 5 })).status, 404);
});

test('v3 · online giving files: Zelle in a bank export, PayPal and Tithe.ly, without saving anything twice', async () => {
  const { parseOnline, fromBankDescription, matchMember } = await import('../lib/online.js');
  assert.deepEqual(fromBankDescription('Zelle payment from JOSE GARCIA on 05/02 Conf# abc12345'), { name: 'Jose Garcia', reference: 'abc12345' });
  assert.equal(matchMember({ name: 'J Garcia', email: null }, [{ id: '1', name: 'José García', email: null, first_name: 'José', last_name: 'García' }])?.by, 'similar');

  const bank = 'Date,Description,Amount\n05/02/2026,Zelle payment from JOSE GARCIA on 05/02 Conf# abc12345,50.00\n05/03/2026,Zelle payment from UNKNOWN PERSON Conf# zz998877,20.00\n05/04/2026,ELECTRIC CO PAYMENT,-80.00\n05/05/2026,DEPOSIT,300.00\n';
  const parsed = parseOnline((await import('../lib/csv.js')).parseCsv(bank));
  assert.equal(parsed.source, 'zelle');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.skipped.length, 2);

  const pre = ok(await c.form('/data/import/online/preview', {}, { name: 'banco.csv', type: 'text/csv', data: bank }));
  assert.equal(pre.method, 'transfer');
  assert.equal(pre.rows[0].member_name, 'José García');
  assert.equal(pre.rows[1].member_id, null);
  const rows = pre.rows.map((r: any) => ({ ...r, fund_id: r.fund_id || fundC, method: pre.method }));
  const first = ok(await c.post('/data/import/online/commit', { source: pre.source, rows }));
  assert.deepEqual(first, { created: 2, duplicates: 0 });
  const again = ok(await c.post('/data/import/online/commit', { source: pre.source, rows }));
  assert.deepEqual(again, { created: 0, duplicates: 2 });
  assert.ok(ok(await c.form('/data/import/online/preview', {}, { name: 'banco.csv', type: 'text/csv', data: bank })).rows.every((r: any) => r.duplicate));

  const paypal = '"Date","Time","Name","Type","Status","Currency","Gross","Fee","Net","From Email Address","Transaction ID","Note"\n"05/06/2026","10:00:00","Ana Ruiz","Donation Payment","Completed","USD","25.00","-1.03","23.97","ana@ruiz.test","9XY12345AB","Diezmo"\n"05/07/2026","10:00:00","Ana Ruiz","Donation Payment","Refunded","USD","10.00","0","10","ana@ruiz.test","9XY99999AB",""\n';
  const pp = ok(await c.form('/data/import/online/preview', {}, { name: 'paypal.csv', type: 'text/csv', data: paypal }));
  assert.equal(pp.source, 'paypal');
  assert.equal(pp.method, 'card');
  assert.equal(pp.rows.length, 1);
  assert.equal(pp.rows[0].matched_by, 'email');
  assert.equal(pp.rows[0].fee, 1.03);
  assert.equal(pp.rows[0].fund_id, fundC); // "Diezmo" in the note goes to the tithes fund

  const tithely = 'Date,First Name,Last Name,Email,Amount,Giving Type,Transaction ID\n2026-05-08,Beto,Ruiz,,40,Ofrendas,ch_1\n';
  const tl = ok(await c.form('/data/import/online/preview', {}, { name: 'tithely.csv', type: 'text/csv', data: tithely }));
  assert.equal(tl.source, 'tithely');
  assert.equal(tl.rows[0].member_name, 'Beto Ruiz');
  assert.equal(tl.rows[0].fund_id, offeringsFundC);
  assert.equal((await c.form('/data/import/online/preview', {}, { name: 'x.csv', type: 'text/csv', data: 'Hola,Adios\n1,2\n' })).body.error, 'csv_missing_columns');
  assert.equal((await b.post('/data/import/online/commit', { source: 'bank', rows })).status, 400);
});

test('v3 · offline entries carry a reference, so sending them twice saves them once', async () => {
  const ref = 'offline:2b0f6a1e-7d8c-4c38-9d61-0f3b2a4c5d6e';
  const first = ok(await c.post('/offerings', { fund_id: fundC, amount: 9, date: '2026-05-10', external_ref: ref }), 201);
  const second = ok(await c.post('/offerings', { fund_id: fundC, amount: 9, date: '2026-05-10', external_ref: ref }));
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);
  // The same reference in another church is a different gift.
  const fundB = ok(await b.get('/funds'))[0].id;
  ok(await b.post('/offerings', { fund_id: fundB, amount: 9, date: '2026-05-10', external_ref: ref }), 201);
});

test('v3 · a personal giving link shows a member their own giving, until it is revoked', async () => {
  const jose = ok(await c.get('/members')).find((x: any) => x.first_name === 'José');
  const link = ok(await c.post(`/links/${jose.id}`, { days: 30 }), 201);
  const token = link.url.split('/mi-ofrenda/')[1];
  assert.match(token, /^[A-Za-z0-9_-]{30,}$/);
  const anon = client();
  const page = ok(await anon.get(`/public/giving/${token}?year=2026`));
  assert.equal(page.church, 'Iglesia C');
  assert.equal(page.first_name, 'José');
  assert.equal(page.total, 190); // 40 merged + 100 check + 50 Zelle
  assert.ok(page.gifts.every((g: any) => !('member_id' in g)));
  const st = await anon.get(`/public/giving/${token}/statement.pdf?year=2026`);
  assert.equal(st.body.subarray(0, 4).toString(), '%PDF');
  assert.ok(ok(await c.get(`/links/${jose.id}`)).last_viewed_at);
  assert.equal((await anon.get('/public/giving/not-a-real-token-at-all-123')).body.error, 'link_invalid');
  assert.equal((await b.post(`/links/${jose.id}`, {})).status, 404);
  assert.equal((await c.post(`/links/${jose.id}`, { send: 'email' })).body.error, 'email_not_configured');

  // A new link replaces the old one; revoking stops it.
  const second = ok(await c.post(`/links/${jose.id}`, {}), 201);
  assert.equal((await anon.get(`/public/giving/${token}`)).status, 404);
  const token2 = second.url.split('/mi-ofrenda/')[1];
  ok(await anon.get(`/public/giving/${token2}`));
  ok(await c.del(`/links/${jose.id}`));
  assert.equal((await anon.get(`/public/giving/${token2}`)).status, 404);
});

test('v3 · one search box finds members, checks, counts and expenses', async () => {
  const s = ok(await c.get('/search?q=garcia'));
  assert.equal(s.members[0].name, 'José García');
  assert.equal(ok(await c.get('/search?q=555')).offerings[0].check_number, '555');
  assert.ok(ok(await c.get('/search?q=mayo')).batches.some((x: any) => x.name === 'Culto 3 de mayo'));
  assert.equal(ok(await c.get('/search?q=Pastor')).expenses[0].payee, 'Pastor');
  assert.equal(ok(await c.get('/search?q=12')).members[0].envelope_number, '12');
  assert.equal(ok(await b.get('/search?q=garcia')).members.length, 0);
  assert.equal(ok(await c.get('/search?q=a')).members.length, 0);
  const setup = ok(await c.get('/setup'));
  assert.equal(setup.total, setup.steps.length);
  assert.ok(setup.steps.find((x: any) => x.key === 'members').done);
  assert.ok(setup.steps.find((x: any) => x.key === 'backup').done);
  assert.equal(setup.steps.find((x: any) => x.key === 'logo').done, false);
});

test('v3 · AI reads photos of the notebook, and each church can turn AI off', async () => {
  const jpg = await (await import('sharp')).default({ create: { width: 40, height: 30, channels: 3, background: '#eee' } }).jpeg().toBuffer();
  const n = geminiRequests.length;
  const read = ok(await a.form('/ai/read-image', { kind: 'ledger' }, { name: 'cuaderno.jpg', type: 'image/jpeg', data: jpg }));
  assert.equal(read.rows.length, 2);
  assert.equal(read.rows[0].member_id, memberA);
  const sent = geminiRequests[n].body.contents[0].parts;
  assert.equal(sent[0].inlineData.mimeType, 'image/jpeg');
  assert.ok(sent[0].inlineData.data.length > 100);
  assert.equal((await a.form('/ai/read-image', {}, { name: 'x.txt', type: 'text/plain', data: 'hola' })).body.error, 'file_not_image');

  const org = ok(await c.get('/org'));
  ok(await c.patch('/org', { ...org, ai_enabled: false }));
  assert.equal(ok(await c.get('/auth/me')).features.ai, false);
  assert.equal(ok(await c.get('/ai/status')).enabled, false);
  const off = await c.post('/ai/parse-offerings', { text: 'Ana 5' });
  assert.equal(off.status, 403);
  assert.equal(off.body.error, 'ai_disabled');
  ok(await c.patch('/org', { ...org, ai_enabled: true }));
  assert.equal(ok(await c.get('/auth/me')).features.ai, true);
});

test('v3 · importing members never breaks on a repeated envelope number', async () => {
  const csv = 'Nombre,Apellido,Sobre\nRosa,Uno,900\nRosa,Dos,900\nRosa,Tres,12\n';
  const r = ok(await c.form('/data/import/members', {}, { name: 'm.csv', type: 'text/csv', data: csv }));
  assert.equal(r.created, 3);
  assert.equal(r.envelopeConflicts, 2); // the second "900" and "12" (José García's) are left empty
  const rows = ok(await c.get('/members')).filter((m: any) => m.first_name === 'Rosa');
  assert.deepEqual(rows.map((m: any) => m.envelope_number).sort(), ['900', null, null].sort());
});
