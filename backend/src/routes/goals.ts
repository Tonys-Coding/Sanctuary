import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';
import { date, money, optUuid, text } from '../lib/z';
import { fullName } from './members';

const r = Router();
const schema = z
  .object({ name: z.string().trim().min(1).max(120), description: text(1000), fund_id: optUuid, target_amount: money, start_date: date, end_date: date })
  .refine((g) => g.end_date >= g.start_date, { message: 'end before start', path: ['end_date'] });

export const GOALS = `SELECT g.*, f.name AS fund_name, f.color_slot AS fund_color,
    COALESCE((SELECT sum(o.amount) FROM offerings o WHERE o.org_id = g.org_id AND o.date BETWEEN g.start_date AND g.end_date
              AND (g.fund_id IS NULL OR o.fund_id = g.fund_id)), 0) AS raised,
    (SELECT count(DISTINCT o.member_id) FROM offerings o WHERE o.org_id = g.org_id AND o.date BETWEEN g.start_date AND g.end_date
              AND (g.fund_id IS NULL OR o.fund_id = g.fund_id)) AS givers,
    COALESCE((SELECT sum(amount) FROM pledges p WHERE p.goal_id = g.id), 0) AS pledged,
    (SELECT count(*)::int FROM pledges p WHERE p.goal_id = g.id) AS pledge_count
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
  const before = await one('SELECT * FROM goals WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  const g = await one(
    'UPDATE goals SET name=$3, description=$4, fund_id=$5, target_amount=$6, start_date=$7, end_date=$8 WHERE id=$1 AND org_id=$2 RETURNING *',
    [req.params.id, req.user.orgId, b.name, b.description ?? null, b.fund_id ?? null, b.target_amount, b.start_date, b.end_date],
  );
  if (!g) throw notFound();
  await audit(req, 'update', 'goal', g.id, g.name, diff(before, g, ['name', 'description', 'fund_id', 'target_amount', 'start_date', 'end_date']));
  res.json(g);
});

// ─── Pledges ("compromisos"): what each person promised toward a goal, and how much they have given ──

r.get('/:id/pledges', async (req, res) => {
  const g = await one('SELECT * FROM goals WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!g) throw notFound();
  res.json(await q(
    `SELECT p.id, p.member_id, p.amount, p.notes, p.created_at, ${fullName} AS member_name, m.avatar_file, m.email, m.phone,
       COALESCE((SELECT sum(o.amount) FROM offerings o WHERE o.member_id = p.member_id AND o.date BETWEEN $2 AND $3
                 AND ($4::uuid IS NULL OR o.fund_id = $4)), 0) AS given
     FROM pledges p JOIN members m ON m.id = p.member_id WHERE p.goal_id = $1 ORDER BY ${fullName}`,
    [g.id, g.start_date, g.end_date, g.fund_id]));
});

r.put('/:id/pledges', async (req, res) => {
  const b = parse(z.object({ member_id: z.string().uuid(), amount: money, notes: text(500) }), req.body);
  const g = await one('SELECT id, name FROM goals WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!g) throw notFound();
  const m = await one(`SELECT ${fullName} AS name FROM members m WHERE id = $1 AND org_id = $2`, [b.member_id, req.user.orgId]);
  if (!m) throw new HttpError(400, 'invalid_member');
  const p = await one(
    `INSERT INTO pledges (org_id, goal_id, member_id, amount, notes) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (goal_id, member_id) DO UPDATE SET amount = EXCLUDED.amount, notes = EXCLUDED.notes RETURNING *`,
    [req.user.orgId, g.id, b.member_id, b.amount, b.notes ?? null]);
  await audit(req, 'update', 'pledge', p.id, `${g.name} · ${m.name} · ${b.amount}`);
  res.json(p);
});

r.delete('/:id/pledges/:pledgeId', async (req, res) => {
  const p = await one('DELETE FROM pledges WHERE id = $1 AND goal_id = $2 AND org_id = $3 RETURNING id, amount', [req.params.pledgeId, req.params.id, req.user.orgId]);
  if (!p) throw notFound();
  await audit(req, 'delete', 'pledge', p.id, String(p.amount));
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  const g = await one('DELETE FROM goals WHERE id = $1 AND org_id = $2 RETURNING id, name', [req.params.id, req.user.orgId]);
  if (!g) throw notFound();
  await audit(req, 'delete', 'goal', g.id, g.name);
  res.json({ ok: true });
});

export default r;
