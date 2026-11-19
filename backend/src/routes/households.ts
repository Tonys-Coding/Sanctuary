import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';
import { uuid } from '../lib/z';
import { fullName } from './members';

const r = Router();
const schema = z.object({
  name: z.string().trim().min(1).max(160),
  joint_statement: z.boolean().default(true),
  member_ids: z.array(uuid).max(30).optional(),
});

const LIST = `SELECT h.*, COALESCE(json_agg(json_build_object('id', m.id, 'name', ${fullName}, 'avatar_file', m.avatar_file, 'email', m.email)
    ORDER BY m.first_name) FILTER (WHERE m.id IS NOT NULL), '[]') AS members
  FROM households h LEFT JOIN members m ON m.household_id = h.id AND m.archived_at IS NULL
  WHERE h.org_id = $1`;

r.get('/', async (req, res) => {
  res.json(await q(`${LIST} GROUP BY h.id ORDER BY h.name`, [req.user.orgId]));
});

async function setMembers(orgId: string, householdId: string, ids: string[], c: any) {
  const found = await q('SELECT id FROM members WHERE org_id = $1 AND id = ANY($2::uuid[])', [orgId, ids], c);
  if (found.length !== new Set(ids).size) throw new HttpError(400, 'invalid_member');
  await q('UPDATE members SET household_id = NULL WHERE household_id = $1 AND NOT (id = ANY($2::uuid[]))', [householdId, ids], c);
  await q('UPDATE members SET household_id = $1 WHERE org_id = $2 AND id = ANY($3::uuid[])', [householdId, orgId, ids], c);
}

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  const h = await tx(async (c) => {
    const row = await one('INSERT INTO households (org_id, name, joint_statement) VALUES ($1,$2,$3) RETURNING *', [req.user.orgId, b.name, b.joint_statement], c);
    if (b.member_ids?.length) await setMembers(req.user.orgId, row.id, b.member_ids, c);
    return row;
  });
  await audit(req, 'create', 'household', h.id, h.name);
  res.status(201).json(await one(`${LIST} AND h.id = $2 GROUP BY h.id`, [req.user.orgId, h.id]));
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  const before = await one('SELECT * FROM households WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  const h = await tx(async (c) => {
    const row = await one('UPDATE households SET name = $2, joint_statement = $3 WHERE id = $1 RETURNING *', [before.id, b.name, b.joint_statement], c);
    if (b.member_ids) await setMembers(req.user.orgId, row.id, b.member_ids, c);
    return row;
  });
  await audit(req, 'update', 'household', h.id, h.name, diff(before, h, ['name', 'joint_statement']));
  res.json(await one(`${LIST} AND h.id = $2 GROUP BY h.id`, [req.user.orgId, h.id]));
});

// Members stay; they simply no longer belong to a household.
r.delete('/:id', async (req, res) => {
  const h = await one('DELETE FROM households WHERE id = $1 AND org_id = $2 RETURNING id, name', [req.params.id, req.user.orgId]);
  if (!h) throw notFound();
  await audit(req, 'delete', 'household', h.id, h.name);
  res.json({ ok: true });
});

export default r;
