import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, diff, notFound, parse, snapshot } from '../http';
import { date, text, uuid } from '../lib/z';
import { fullName } from './members';

// Gifts of goods (furniture, food, equipment…). The church records a description, never a value.
const r = Router();
const schema = z.object({ member_id: uuid, date, description: z.string().trim().min(2).max(500), notes: text(1000) });
const SELECT = `SELECT g.*, ${fullName} AS member_name FROM noncash_gifts g JOIN members m ON m.id = g.member_id WHERE g.org_id = $1`;

r.get('/', async (req, res) => {
  const member = typeof req.query.member === 'string' && /^[0-9a-f-]{36}$/.test(req.query.member) ? req.query.member : null;
  const year = Number(req.query.year) || null;
  res.json(await q(`${SELECT} AND ($2::uuid IS NULL OR g.member_id = $2) AND ($3::int IS NULL OR extract(year FROM g.date) = $3)
    ORDER BY g.date DESC LIMIT 500`, [req.user.orgId, member, year]));
});

async function checkMember(orgId: string, id: string) {
  if (!(await one('SELECT 1 FROM members WHERE id = $1 AND org_id = $2', [id, orgId]))) throw new HttpError(400, 'invalid_member');
}

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  await checkMember(req.user.orgId, b.member_id);
  const row = await one('INSERT INTO noncash_gifts (org_id, member_id, date, description, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.user.orgId, b.member_id, b.date, b.description, b.notes ?? null, req.user.id]);
  const full = await one(`${SELECT} AND g.id = $2`, [req.user.orgId, row.id]);
  await audit(req, 'create', 'noncash_gift', row.id, `${full.member_name} · ${b.description.slice(0, 60)}`);
  res.status(201).json(full);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  const before = await one('SELECT * FROM noncash_gifts WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  await checkMember(req.user.orgId, b.member_id);
  const row = await one('UPDATE noncash_gifts SET member_id = $2, date = $3, description = $4, notes = $5 WHERE id = $1 RETURNING *',
    [before.id, b.member_id, b.date, b.description, b.notes ?? null]);
  await audit(req, 'update', 'noncash_gift', row.id, b.description.slice(0, 60), diff(before, row, ['member_id', 'date', 'description', 'notes']));
  res.json(await one(`${SELECT} AND g.id = $2`, [req.user.orgId, row.id]));
});

r.delete('/:id', async (req, res) => {
  const row = await one('DELETE FROM noncash_gifts WHERE id = $1 AND org_id = $2 RETURNING *', [req.params.id, req.user.orgId]);
  if (!row) throw notFound();
  await audit(req, 'delete', 'noncash_gift', row.id, row.description.slice(0, 60), snapshot(row, ['member_id', 'date', 'description']));
  res.json({ ok: true });
});

export default r;
