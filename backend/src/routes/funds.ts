import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';

const r = Router();
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  color_slot: z.coerce.number().int().min(1).max(8).default(1),
  tax_deductible: z.boolean().default(true),
});

r.get('/', async (req, res) => {
  res.json(
    await q(
      `SELECT f.*, COALESCE(s.total, 0) AS total_year, COALESCE(s.count, 0) AS offering_count
       FROM funds f LEFT JOIN (
         SELECT fund_id, sum(amount) FILTER (WHERE date >= fy_start($1)) AS total, count(*) AS count
         FROM offerings WHERE org_id = $1 GROUP BY fund_id) s ON s.fund_id = f.id
       WHERE f.org_id = $1 AND ($2 OR f.archived_at IS NULL) ORDER BY f.archived_at NULLS FIRST, f.sort_order, f.created_at`,
      [req.user.orgId, req.query.all === '1'],
    ),
  );
});

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  const f = await one(
    `INSERT INTO funds (org_id, name, color_slot, tax_deductible, sort_order)
     VALUES ($1,$2,$3,$4, (SELECT COALESCE(max(sort_order), 0) + 1 FROM funds WHERE org_id = $1)) RETURNING *`,
    [req.user.orgId, b.name, b.color_slot, b.tax_deductible],
  );
  await audit(req, 'create', 'fund', f.id, f.name);
  res.status(201).json(f);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema.extend({ archived: z.boolean().optional() }), req.body);
  const before = await one('SELECT * FROM funds WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  const f = await one(
    `UPDATE funds SET name = $3, color_slot = $4, tax_deductible = $5,
       archived_at = CASE WHEN $6::boolean IS NULL THEN archived_at WHEN $6 THEN COALESCE(archived_at, now()) ELSE NULL END
     WHERE id = $1 AND org_id = $2 RETURNING *`,
    [req.params.id, req.user.orgId, b.name, b.color_slot, b.tax_deductible, b.archived ?? null],
  );
  if (!f) throw notFound();
  await audit(req, 'update', 'fund', f.id, f.name, diff(before, f, ['name', 'tax_deductible', 'color_slot', 'archived_at']));
  res.json(f);
});

r.delete('/:id', async (req, res) => {
  const f = await one('SELECT id, name FROM funds WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!f) throw notFound();
  if (await one('SELECT 1 FROM offerings WHERE fund_id = $1 LIMIT 1', [f.id])) throw new HttpError(409, 'fund_in_use');
  await q('DELETE FROM funds WHERE id = $1', [f.id]);
  await audit(req, 'delete', 'fund', f.id, f.name);
  res.json({ ok: true });
});

export default r;
