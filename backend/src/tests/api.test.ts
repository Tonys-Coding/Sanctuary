// End-to-end API tests. They run against a real Postgres database (TEST_DATABASE_URL)
// and a stand-in Gemini server, so no API key or network access is needed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const geminiRequests: any[] = [];
const fakeGemini = http.createServer((req, res) => {
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
  return { get: (p: string) => call('GET', p), post: (p: string, b?: unknown) => call('POST', p, b ?? {}), patch: (p: string, b: unknown) => call('PATCH', p, b), del: (p: string) => call('DELETE', p) };
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
