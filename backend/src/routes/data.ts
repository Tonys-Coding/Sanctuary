import { Router } from 'express';
import { q, tx } from '../db';
import { HttpError, audit, isoDate } from '../http';
import { parseCsv, toCsv } from '../lib/csv';
import { upload } from '../lib/files';
import { fullName } from './members';

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
  const tables = ['organizations', 'members', 'funds', 'batches', 'offerings', 'goals', 'tax_statements'];
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: 'Sanctuary' };
  for (const t of tables) out[t] = await q(`SELECT * FROM ${t} WHERE ${t === 'organizations' ? 'id' : 'org_id'} = $1`, [req.user.orgId]);
  await audit(req, 'export', 'backup', null, '');
  res.attachment(`sanctuary-respaldo-${new Date().toISOString().slice(0, 10)}.json`).json(out);
});

export default r;
