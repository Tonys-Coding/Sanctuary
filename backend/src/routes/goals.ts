import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, notFound, parse } from '../http';
import { date, money, optUuid, text } from '../lib/z';

const r = Router();
const schema = z
  .object({ name: z.string().trim().min(1).max(120), description: text(1000), fund_id: optUuid, target_amount: money, start_date: date, end_date: date })
  .refine((g) => g.end_date >= g.start_date, { message: 'end before start', path: ['end_date'] });

export const GOALS = `SELECT g.*, f.name AS fund_name, f.color_slot AS fund_color,
    COALESCE((SELECT sum(o.amount) FROM offerings o WHERE o.org_id = g.org_id AND o.date BETWEEN g.start_date AND g.end_date
              AND (g.fund_id IS NULL OR o.fund_id = g.fund_id)), 0) AS raised,
    (SELECT count(DISTINCT o.member_id) FROM offerings o WHERE o.org_id = g.org_id AND o.date BETWEEN g.start_date AND g.end_date
              AND (g.fund_id IS NULL OR o.fund_id = g.fund_id)) AS givers
  FROM goals g LEFT JOIN funds f ON f.id = g.fund_id WHERE g.org_id = $1`;

r.get('/', async (req, res) => {
  res.json(await q(`${GOALS} ORDER BY g.end_date DESC`, [req.user.orgId]));
});

async function checkFund(orgId: string, fundId?: string | null) {
  if (fundId && !(await one('SELECT 1 FROM funds WHERE id = $1 AND org_id = $2', [fundId, orgId]))) throw new HttpError(400, 'invalid_input');
}

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  await checkFund(req.user.orgId, b.fund_id);
  const g = await one(
    'INSERT INTO goals (org_id, name, description, fund_id, target_amount, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.user.orgId, b.name, b.description ?? null, b.fund_id ?? null, b.target_amount, b.start_date, b.end_date],
  );
  await audit(req, 'create', 'goal', g.id, g.name);
  res.status(201).json(g);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  await checkFund(req.user.orgId, b.fund_id);
  const g = await one(
    'UPDATE goals SET name=$3, description=$4, fund_id=$5, target_amount=$6, start_date=$7, end_date=$8 WHERE id=$1 AND org_id=$2 RETURNING *',
    [req.params.id, req.user.orgId, b.name, b.description ?? null, b.fund_id ?? null, b.target_amount, b.start_date, b.end_date],
  );
  if (!g) throw notFound();
  await audit(req, 'update', 'goal', g.id, g.name);
  res.json(g);
});

r.delete('/:id', async (req, res) => {
  const g = await one('DELETE FROM goals WHERE id = $1 AND org_id = $2 RETURNING id, name', [req.params.id, req.user.orgId]);
  if (!g) throw notFound();
  await audit(req, 'delete', 'goal', g.id, g.name);
  res.json({ ok: true });
});

export default r;
