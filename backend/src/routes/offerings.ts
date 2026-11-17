import { Request, Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, isoDate, notFound, parse } from '../http';
import { date, method, money, optUuid, text, uuid } from '../lib/z';
import { fullName } from './members';
import { toCsv } from '../lib/csv';

const r = Router();

const schema = z.object({
  member_id: optUuid,
  fund_id: uuid,
  batch_id: optUuid,
  amount: money,
  date,
  method: method.default('cash'),
  check_number: text(40),
  notes: text(500),
});

/** Every id a client sends must belong to the caller's church. */
async function assertOwned(orgId: string, b: { member_id?: string | null; fund_id: string; batch_id?: string | null }) {
  const row = await one(
    `SELECT EXISTS(SELECT 1 FROM funds WHERE id = $2 AND org_id = $1) AS fund,
            ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM members WHERE id = $3 AND org_id = $1)) AS member,
            ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM batches WHERE id = $4 AND org_id = $1)) AS batch`,
    [orgId, b.fund_id, b.member_id ?? null, b.batch_id ?? null],
  );
  if (!row.fund || !row.member || !row.batch) throw new HttpError(400, 'invalid_input');
}

const SELECT = `SELECT o.id, o.amount, o.date, o.method, o.check_number, o.notes, o.member_id, o.fund_id, o.batch_id, o.created_at,
       CASE WHEN m.id IS NULL THEN NULL ELSE ${fullName} END AS member_name, m.avatar_file AS member_avatar,
       f.name AS fund_name, f.color_slot AS fund_color, b.name AS batch_name
  FROM offerings o
  LEFT JOIN members m ON m.id = o.member_id
  JOIN funds f ON f.id = o.fund_id
  LEFT JOIN batches b ON b.id = o.batch_id`;

export function offeringFilters(req: Request) {
  const s = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string).trim() : '');
  const where = ['o.org_id = $1'];
  const params: unknown[] = [req.user.orgId];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (isoDate.test(s('from'))) add('o.date >= ?', s('from'));
  if (isoDate.test(s('to'))) add('o.date <= ?', s('to'));
  if (s('memberId') === 'none') where.push('o.member_id IS NULL');
  else if (s('memberId')) add('o.member_id = ?', s('memberId'));
  if (s('fundId')) add('o.fund_id = ?', s('fundId'));
  if (s('batchId')) add('o.batch_id = ?', s('batchId'));
  if (s('method')) add('o.method = ?', s('method'));
  if (s('q')) {
    params.push(s('q'));
    const i = `$${params.length}`;
    where.push(`(${fullName} ILIKE '%' || ${i} || '%' OR o.notes ILIKE '%' || ${i} || '%' OR o.check_number = ${i})`);
  }
  return { where: where.join(' AND '), params };
}

r.get('/', async (req, res) => {
  const { where, params } = offeringFilters(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const [rows, agg] = await Promise.all([
    q(`${SELECT} WHERE ${where} ORDER BY o.date DESC, o.created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    one(`SELECT count(*) AS count, COALESCE(sum(o.amount), 0) AS total FROM offerings o LEFT JOIN members m ON m.id = o.member_id WHERE ${where}`, params),
  ]);
  res.json({ rows, count: agg.count, total: agg.total });
});

r.get('/export.csv', async (req, res) => {
  const { where, params } = offeringFilters(req);
  const rows = await q(`${SELECT} WHERE ${where} ORDER BY o.date DESC, o.created_at DESC`, params);
  const es = req.user.language === 'es';
  const csv = toCsv(
    es ? ['Fecha', 'Miembro', 'Fondo', 'Método', 'Monto', 'Cheque', 'Conteo', 'Notas'] : ['Date', 'Member', 'Fund', 'Method', 'Amount', 'Check', 'Count', 'Notes'],
    rows.map((o) => [o.date, o.member_name || (es ? 'Ofrenda suelta' : 'Loose offering'), o.fund_name, o.method, o.amount.toFixed(2), o.check_number, o.batch_name, o.notes]),
  );
  res.type('text/csv').attachment(es ? 'ofrendas.csv' : 'offerings.csv').send(csv);
});

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  await assertOwned(req.user.orgId, b);
  const o = await one(
    `INSERT INTO offerings (org_id, member_id, fund_id, batch_id, amount, date, method, check_number, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [req.user.orgId, b.member_id ?? null, b.fund_id, b.batch_id ?? null, b.amount, b.date, b.method, b.check_number ?? null, b.notes ?? null, req.user.id],
  );
  const row = await one(`${SELECT} WHERE o.id = $1`, [o.id]);
  await audit(req, 'create', 'offering', o.id, `${row.member_name || '—'} · ${row.fund_name} · ${b.amount.toFixed(2)}`);
  res.status(201).json(row);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  await assertOwned(req.user.orgId, b);
  const o = await one(
    `UPDATE offerings SET member_id=$3, fund_id=$4, batch_id=$5, amount=$6, date=$7, method=$8, check_number=$9, notes=$10, updated_at=now()
     WHERE id = $1 AND org_id = $2 RETURNING id`,
    [req.params.id, req.user.orgId, b.member_id ?? null, b.fund_id, b.batch_id ?? null, b.amount, b.date, b.method, b.check_number ?? null, b.notes ?? null],
  );
  if (!o) throw notFound();
  const row = await one(`${SELECT} WHERE o.id = $1`, [o.id]);
  await audit(req, 'update', 'offering', o.id, `${row.member_name || '—'} · ${row.fund_name} · ${b.amount.toFixed(2)}`);
  res.json(row);
});

r.delete('/:id', async (req, res) => {
  const row = await one(`${SELECT} WHERE o.id = $1 AND o.org_id = $2`, [req.params.id, req.user.orgId]);
  if (!row) throw notFound();
  await q('DELETE FROM offerings WHERE id = $1', [row.id]);
  await audit(req, 'delete', 'offering', row.id, `${row.member_name || '—'} · ${row.fund_name} · ${row.amount.toFixed(2)} · ${row.date}`);
  res.json({ ok: true });
});

export default r;
