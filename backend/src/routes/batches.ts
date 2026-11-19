import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';
import { date, text } from '../lib/z';

const r = Router();

const schema = z.object({
  date,
  name: z.string().trim().min(1).max(120),
  attendance: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).max(100000).nullish()),
  counted_by: text(200),
  notes: text(1000),
  // { "100": 3, "20": 12, "0.25": 8 … } → how many of each bill / coin were counted
  denominations: z.record(z.string().regex(/^\d+(\.\d+)?$/), z.coerce.number().int().min(0).max(100000)).default({}),
  status: z.enum(['open', 'closed']).default('open'),
  reopen_reason: text(300),
});

const LIST = `SELECT b.*, d.status AS deposit_status, d.date AS deposit_date, COALESCE(s.total, 0) AS total, COALESCE(s.cash, 0) AS cash_total, COALESCE(s.count, 0) AS offering_count
  FROM batches b LEFT JOIN (
    SELECT batch_id, sum(amount) AS total, sum(amount) FILTER (WHERE method = 'cash') AS cash, count(*) AS count
    FROM offerings WHERE org_id = $1 GROUP BY batch_id) s ON s.batch_id = b.id
  LEFT JOIN deposits d ON d.id = b.deposit_id
  WHERE b.org_id = $1`;

r.get('/', async (req, res) => {
  res.json(await q(`${LIST} ORDER BY b.date DESC, b.created_at DESC LIMIT 200`, [req.user.orgId]));
});

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  const row = await one(
    'INSERT INTO batches (org_id, date, name, attendance, counted_by, notes, denominations, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [req.user.orgId, b.date, b.name, b.attendance ?? null, b.counted_by ?? null, b.notes ?? null, JSON.stringify(b.denominations), req.user.id],
  );
  await audit(req, 'create', 'batch', row.id, `${row.name} · ${row.date}`);
  res.status(201).json(row);
});

r.get('/:id', async (req, res) => {
  const row = await one(`${LIST} AND b.id = $2`, [req.user.orgId, req.params.id]);
  if (!row) throw notFound();
  res.json(row);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  const before = await one(
    `SELECT b.*, d.status AS deposit_status FROM batches b LEFT JOIN deposits d ON d.id = b.deposit_id WHERE b.id = $1 AND b.org_id = $2`,
    [req.params.id, req.user.orgId],
  );
  if (!before) throw notFound();
  const reopening = before.status === 'closed' && b.status === 'open';
  if (before.status === 'closed' && !reopening) throw new HttpError(409, 'batch_closed', { name: before.name, date: before.date });
  if (reopening) {
    // A signed count is only reopened on purpose, and never once its money has gone to the bank.
    if (before.deposit_status && before.deposit_status !== 'pending') throw new HttpError(409, 'batch_deposited');
    if (!b.reopen_reason || b.reopen_reason.length < 3) throw new HttpError(400, 'reopen_reason_required');
  }
  const row = await one(
    `UPDATE batches SET date=$3, name=$4, attendance=$5, counted_by=$6, notes=$7, denominations=$8, status=$9,
       closed_at = CASE WHEN $9 = 'closed' THEN COALESCE(closed_at, now()) ELSE NULL END
     WHERE id = $1 AND org_id = $2 RETURNING *`,
    reopening
      ? [req.params.id, req.user.orgId, before.date, before.name, before.attendance, before.counted_by, before.notes, JSON.stringify(before.denominations), 'open']
      : [req.params.id, req.user.orgId, b.date, b.name, b.attendance ?? null, b.counted_by ?? null, b.notes ?? null, JSON.stringify(b.denominations), b.status],
  );
  const action = reopening ? 'reopen' : b.status === 'closed' ? 'close' : 'update';
  const summary = reopening ? `${row.name} · ${row.date} · ${b.reopen_reason}` : `${row.name} · ${row.date}`;
  await audit(req, action, 'batch', row.id, summary, diff(before, row, ['date', 'name', 'attendance', 'counted_by', 'notes', 'status']));
  res.json(row);
});

// Deleting a count keeps its offerings; they simply stop belonging to a count.
r.delete('/:id', async (req, res) => {
  const existing = await one('SELECT status, name, date FROM batches WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!existing) throw notFound();
  if (existing.status === 'closed') throw new HttpError(409, 'batch_closed', { name: existing.name, date: existing.date });
  const row = await one('DELETE FROM batches WHERE id = $1 AND org_id = $2 RETURNING id, name, date', [req.params.id, req.user.orgId]);
  if (!row) throw notFound();
  await audit(req, 'delete', 'batch', row.id, `${row.name} · ${row.date}`);
  res.json({ ok: true });
});

export default r;
