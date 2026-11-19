import { Router } from 'express';
import { q, tx } from '../db';
import { HttpError, audit, isoDate, parse, todayIn } from '../http';
import { parseCsv, toCsv } from '../lib/csv';
import { upload } from '../lib/files';
import multer from 'multer';
import { buildBackup, listBackups, parseBackup, readBackupFile, restoreBackup, saveBackupFile } from '../lib/backup';
import { fullName } from './members';
import { z } from 'zod';
import { matchMember, methodFor, norm as onlineNorm, parseOnline } from '../lib/online';
import { method, money, optUuid, text } from '../lib/z';

const r = Router();
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Maps a header row to our fields by accepting the usual Spanish and English column names. */
function mapHeader(header: string[], aliases: Record<string, string[]>) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(aliases)) if (idx[field] === undefined && names.includes(n)) idx[field] = i;
  });
  return idx;
}

function readCsv(file?: Express.Multer.File) {
  if (!file) throw new HttpError(400, 'file_required');
  const rows = parseCsv(file.buffer.toString('utf8'));
  if (rows.length < 2) throw new HttpError(400, 'csv_empty');
  if (rows.length > 20001) throw new HttpError(400, 'csv_too_large');
  return rows;
}

/** Accepts 2026-03-15, 15/03/2026 (day first, as written in Spanish) and 3/15/2026 when the day is unambiguous. */
function parseDate(v: string): string | null {
  if (isoDate.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  let [a, b] = [Number(m[1]), Number(m[2])];
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (b > 12 && a <= 12) [a, b] = [b, a];
  if (b < 1 || b > 12 || a < 1 || a > 31) return null;
  return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
}

const parseAmount = (v: string) => {
  let s = v.replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Math.round(parseFloat(s) * 100) / 100;
  return n > 0 ? n : null;
};

const METHODS: Record<string, string> = {
  efectivo: 'cash', cash: 'cash', cheque: 'check', check: 'check', tarjeta: 'card', card: 'card',
  transferencia: 'transfer', transfer: 'transfer', zelle: 'transfer', otro: 'other', other: 'other',
};

r.post('/import/members', upload.single('file'), async (req, res) => {
  const rows = readCsv(req.file);
  const h = mapHeader(rows[0], {
    first_name: ['nombre', 'nombres', 'first name', 'firstname', 'name'], last_name: ['apellido', 'apellidos', 'last name', 'lastname'],
    email: ['correo', 'correo electronico', 'email', 'e mail'], phone: ['telefono', 'celular', 'phone', 'phone number'],
    address: ['direccion', 'address'], city: ['ciudad', 'city'], state: ['estado', 'state'], postal_code: ['codigo postal', 'zip', 'postal code', 'zip code'],
    envelope_number: ['sobre', 'numero de sobre', 'envelope', 'envelope number'], notes: ['notas', 'notes'],
  });
  if (h.first_name === undefined) throw new HttpError(400, 'csv_missing_columns', ['nombre']);
  const existing = new Set((await q(`SELECT ${fullName} AS n FROM members m WHERE org_id = $1`, [req.user.orgId])).map((m) => norm(m.n)));
  let created = 0;
  let skipped = 0;
  await tx(async (c) => {
    for (const row of rows.slice(1)) {
      const get = (k: string) => (h[k] === undefined ? '' : (row[h[k]] || '').trim());
      let first = get('first_name');
      let last = get('last_name');
      if (!first) { skipped++; continue; }
      if (h.last_name === undefined && first.includes(' ')) [first, last] = [first.split(' ')[0], first.split(' ').slice(1).join(' ')];
      const key = norm(`${first} ${last}`);
      if (existing.has(key)) { skipped++; continue; }
      existing.add(key);
      const email = /^\S+@\S+\.\S+$/.test(get('email')) ? get('email').toLowerCase() : null;
      await q(
        'INSERT INTO members (org_id, first_name, last_name, email, phone, address, city, state, postal_code, envelope_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [req.user.orgId, first.slice(0, 80), last.slice(0, 80), email, ...['phone', 'address', 'city', 'state', 'postal_code', 'envelope_number', 'notes'].map((k) => get(k) || null)],
        c,
      );
      created++;
    }
  });
  await audit(req, 'import', 'member', null, String(created));
  res.json({ created, skipped });
});

r.post('/import/offerings', upload.single('file'), async (req, res) => {
  const rows = readCsv(req.file);
  const h = mapHeader(rows[0], {
    date: ['fecha', 'date'], member: ['miembro', 'nombre', 'member', 'name', 'giver', 'dador'], amount: ['monto', 'cantidad', 'importe', 'amount', 'total'],
    fund: ['fondo', 'categoria', 'tipo', 'fund', 'category'], method: ['metodo', 'forma de pago', 'method'], check_number: ['cheque', 'numero de cheque', 'check', 'check number'], notes: ['notas', 'notes'],
  });
  const missing = ['date', 'amount'].filter((k) => h[k] === undefined);
  if (missing.length) throw new HttpError(400, 'csv_missing_columns', missing);

  const members = new Map((await q(`SELECT id, ${fullName} AS n FROM members m WHERE org_id = $1`, [req.user.orgId])).map((m) => [norm(m.n), m.id as string]));
  const funds = await q('SELECT id, name FROM funds WHERE org_id = $1 ORDER BY archived_at NULLS FIRST, sort_order', [req.user.orgId]);
  const fundMap = new Map(funds.map((f) => [norm(f.name), f.id as string]));
  const anonymous = new Set(['', 'anonimo', 'anonymous', 'ofrenda suelta', 'loose offering', 'suelta']);
  let created = 0;
  let newMembers = 0;
  let newFunds = 0;
  const errors: { line: number; reason: string }[] = [];

  await tx(async (c) => {
    for (let i = 1; i < rows.length; i++) {
      const get = (k: string) => (h[k] === undefined ? '' : (rows[i][h[k]] || '').trim());
      const date = parseDate(get('date'));
      const amount = parseAmount(get('amount'));
      if (!date || !amount) { errors.push({ line: i + 1, reason: !date ? 'date' : 'amount' }); continue; }

      let memberId: string | null = null;
      const name = get('member');
      if (!anonymous.has(norm(name))) {
        memberId = members.get(norm(name)) ?? null;
        if (!memberId) {
          const [first, ...rest] = name.split(' ');
          memberId = (await q('INSERT INTO members (org_id, first_name, last_name) VALUES ($1,$2,$3) RETURNING id', [req.user.orgId, first.slice(0, 80), rest.join(' ').slice(0, 80)], c))[0].id;
          members.set(norm(name), memberId!);
          newMembers++;
        }
      }
      const fundName = get('fund');
      let fundId = fundName ? fundMap.get(norm(fundName)) : funds[0]?.id;
      if (!fundId) {
        fundId = (await q('INSERT INTO funds (org_id, name, color_slot, sort_order) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.orgId, (fundName || 'General').slice(0, 80), (fundMap.size % 8) + 1, fundMap.size + 1], c))[0].id;
        fundMap.set(norm(fundName || 'General'), fundId!);
        if (!funds.length) funds.push({ id: fundId, name: fundName });
        newFunds++;
      }
      await q(
        'INSERT INTO offerings (org_id, member_id, fund_id, amount, date, method, check_number, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [req.user.orgId, memberId, fundId, amount, date, METHODS[norm(get('method'))] || 'cash', get('check_number') || null, get('notes').slice(0, 500) || null, req.user.id],
        c,
      );
      created++;
    }
  });
  await audit(req, 'import', 'offering', null, String(created));
  res.json({ created, newMembers, newFunds, errors: errors.slice(0, 50), errorCount: errors.length });
});

// ─── Online giving (Zelle, Tithe.ly, Square, PayPal, bank exports) ───────────

/** Step 1: read the file and show what would be saved — matched members, the fund, and gifts already in Sanctuary. */
r.post('/import/online/preview', upload.single('file'), async (req, res) => {
  const rows = readCsv(req.file);
  const forced = ['tithely', 'square', 'paypal', 'zelle', 'bank', 'other'].includes(req.body?.source) ? req.body.source : undefined;
  const parsed = parseOnline(rows, forced);
  if (parsed.missing.length) throw new HttpError(400, 'csv_missing_columns', parsed.missing);
  const [members, funds, existing] = await Promise.all([
    q(`SELECT id, ${fullName} AS name, email, first_name, last_name FROM members m WHERE org_id = $1 AND archived_at IS NULL`, [req.user.orgId]),
    q('SELECT id, name FROM funds WHERE org_id = $1 AND archived_at IS NULL ORDER BY sort_order', [req.user.orgId]),
    q('SELECT external_ref FROM offerings WHERE org_id = $1 AND external_ref = ANY($2::text[])', [req.user.orgId, parsed.rows.map((r) => r.external_ref)]),
  ]);
  const already = new Set(existing.map((e) => e.external_ref));
  const fundByName = new Map(funds.map((f) => [onlineNorm(f.name), f.id]));
  const tithes = funds.find((f) => /diezmo|tithe/i.test(f.name));
  res.json({
    source: parsed.source,
    method: methodFor(parsed.source),
    skipped: parsed.skipped.slice(0, 100),
    skippedCount: parsed.skipped.length,
    rows: parsed.rows.map((r) => {
      const m = matchMember(r, members);
      const fundGuess = r.fund ? fundByName.get(onlineNorm(r.fund)) : /diezmo|tithe/i.test(r.memo || '') ? tithes?.id : undefined;
      return { ...r, member_id: m?.member.id ?? null, member_name: m?.member.name ?? null, matched_by: m?.by ?? null, fund_id: fundGuess ?? null, duplicate: already.has(r.external_ref) };
    }),
  });
});

/** Step 2: save the reviewed gifts. Ones already imported are skipped by their reference. */
r.post('/import/online/commit', async (req, res) => {
  const b = parse(z.object({
    source: z.string().max(20),
    rows: z.array(z.object({
      date: z.string().regex(isoDate), member_id: optUuid, fund_id: z.string().uuid(), amount: money, method: method.default('card'),
      external_ref: z.string().min(3).max(200), memo: text(300), fee: z.number().nullish(),
    })).min(1).max(5000),
  }), req.body);
  const owned = async (table: string, ids: string[]) =>
    new Set((await q(`SELECT id FROM ${table} WHERE org_id = $1 AND id = ANY($2::uuid[])`, [req.user.orgId, ids])).map((x) => x.id));
  const memberIds = await owned('members', b.rows.flatMap((r) => (r.member_id ? [r.member_id] : [])));
  const fundIds = await owned('funds', b.rows.map((r) => r.fund_id));
  let created = 0;
  let duplicates = 0;
  await tx(async (c) => {
    for (const row of b.rows) {
      if (!fundIds.has(row.fund_id) || (row.member_id && !memberIds.has(row.member_id))) throw new HttpError(400, 'invalid_input');
      const note = [row.memo, row.fee ? `${req.user.language === 'es' ? 'Comisión' : 'Fee'}: ${row.fee.toFixed(2)}` : null].filter(Boolean).join(' · ').slice(0, 500) || null;
      const ins = await q(
        `INSERT INTO offerings (org_id, member_id, fund_id, amount, date, method, notes, external_ref, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (org_id, external_ref) WHERE external_ref IS NOT NULL DO NOTHING RETURNING id`,
        [req.user.orgId, row.member_id ?? null, row.fund_id, row.amount, row.date, row.method, note, row.external_ref, req.user.id], c);
      if (ins.length) created++; else duplicates++;
    }
  });
  await audit(req, 'import', 'offering', null, `${b.source} · ${created}`);
  res.json({ created, duplicates });
});

r.get('/export/members.csv', async (req, res) => {
  const rows = await q('SELECT * FROM members WHERE org_id = $1 AND archived_at IS NULL ORDER BY first_name, last_name', [req.user.orgId]);
  const es = req.user.language === 'es';
  res.type('text/csv').attachment(es ? 'miembros.csv' : 'members.csv').send(
    toCsv(
      es ? ['Nombre', 'Apellido', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'Estado', 'Código postal', 'Sobre', 'Notas'] : ['First name', 'Last name', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Envelope', 'Notes'],
      rows.map((m) => [m.first_name, m.last_name, m.email, m.phone, m.address, m.city, m.state, m.postal_code, m.envelope_number, m.notes]),
    ),
  );
});

/** Complete copy of the church's data as one JSON file — a simple backup anyone can keep. */
r.get('/export/backup.json', async (req, res) => {
  await audit(req, 'export', 'backup', null, '');
  res.attachment(`sanctuary-respaldo-${todayIn(req.user.tz)}.json`).json(await buildBackup(req.user.orgId));
});

// ─── Backups kept on the server ──────────────────────────────────────────────

r.get('/backups', async (req, res) => {
  res.json(await listBackups(req.user.orgId));
});

r.post('/backups', async (req, res) => {
  const name = await saveBackupFile(req.user.orgId, 'manual');
  await audit(req, 'create', 'backup', null, name);
  res.status(201).json({ name });
});

r.get('/backups/:name', async (req, res) => {
  const data = await readBackupFile(req.user.orgId, String(req.params.name));
  res.attachment(String(req.params.name).replace(/\.gz$/, '')).json(data);
});

const bigUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

/**
 * Replaces all the church's data with a backup: one kept on the server (`backup`) or an uploaded file.
 * The person must type RESTAURAR (or RESTORE) to confirm.
 */
r.post('/restore', bigUpload.single('file'), async (req, res) => {
  const confirm = String(req.body?.confirm || '').trim().toUpperCase();
  if (confirm !== 'RESTAURAR' && confirm !== 'RESTORE') throw new HttpError(400, 'restore_confirm');
  const name = typeof req.body?.backup === 'string' ? req.body.backup : '';
  const data = name ? await readBackupFile(req.user.orgId, name) : req.file ? await parseBackup(req.file.buffer) : null;
  if (!data) throw new HttpError(400, 'file_required');
  const result = await restoreBackup(req.user.orgId, data);
  await audit(req, 'restore', 'backup', null, `${name || req.file?.originalname || ''} · ${result.counts.offerings} · ${result.safety}`);
  res.json(result);
});

export default r;
