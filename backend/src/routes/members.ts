import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { audit, notFound, parse } from '../http';
import { optDate, text } from '../lib/z';
import { removeFile, saveImage, upload } from '../lib/files';

const r = Router();

const schema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().max(80).default(''),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().toLowerCase().email().max(200).nullish()),
  phone: text(40), address: text(), city: text(100), state: text(100), postal_code: text(20),
  birth_date: optDate, joined_date: optDate,
  status: z.enum(['active', 'inactive', 'visitor']).default('active'),
  church_role: z.enum(['pastor', 'leader', 'member', 'visitor']).default('member'),
  envelope_number: text(20), notes: text(2000),
});
const COLS = Object.keys(schema.shape);
export const fullName = "trim(m.first_name || ' ' || m.last_name)";

r.get('/', async (req, res) => {
  const search = String(req.query.q || '').trim();
  const rows = await q(
    `SELECT m.*, ${fullName} AS full_name,
            COALESCE(s.total_year, 0) AS total_year, COALESCE(s.total_all, 0) AS total_all,
            COALESCE(s.count, 0) AS offering_count, s.last_date
     FROM members m
     LEFT JOIN (
       SELECT member_id, sum(amount) FILTER (WHERE date >= date_trunc('year', current_date)) AS total_year,
              sum(amount) AS total_all, count(*) AS count, max(date) AS last_date
       FROM offerings WHERE org_id = $1 GROUP BY member_id
     ) s ON s.member_id = m.id
     WHERE m.org_id = $1 AND m.archived_at IS NULL
       AND ($2 = '' OR ${fullName} ILIKE '%' || $2 || '%' OR m.envelope_number = $2 OR m.email ILIKE '%' || $2 || '%')
     ORDER BY m.first_name, m.last_name`,
    [req.user.orgId, search],
  );
  // Last 12 months per member, for the small trend line and "gave in X of 12 months" on each card.
  const months = await q(
    `SELECT member_id, (extract(year FROM age(date_trunc('month', current_date), date_trunc('month', date))) * 12
              + extract(month FROM age(date_trunc('month', current_date), date_trunc('month', date))))::int AS ago,
            sum(amount) AS total
     FROM offerings WHERE org_id = $1 AND member_id IS NOT NULL AND date >= date_trunc('month', current_date) - interval '11 months'
     GROUP BY 1, 2`,
    [req.user.orgId],
  );
  const spark = new Map<string, number[]>();
  for (const row of months) {
    const arr = spark.get(row.member_id) || Array(12).fill(0);
    arr[11 - row.ago] = row.total;
    spark.set(row.member_id, arr);
  }
  res.json(rows.map((m) => {
    const s = spark.get(m.id) || Array(12).fill(0);
    return { ...m, spark: s, months_given: s.filter((v) => v > 0).length };
  }));
});

r.post('/', async (req, res) => {
  const body = parse(schema, req.body) as Record<string, unknown>;
  const m = await one(
    `INSERT INTO members (org_id, ${COLS.join(', ')}) VALUES ($1, ${COLS.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
    [req.user.orgId, ...COLS.map((c) => body[c] ?? null)],
  );
  await audit(req, 'create', 'member', m.id, `${m.first_name} ${m.last_name}`.trim());
  res.status(201).json(m);
});

r.get('/:id', async (req, res) => {
  const m = await one(`SELECT m.*, ${fullName} AS full_name FROM members m WHERE m.id = $1 AND m.org_id = $2`, [req.params.id, req.user.orgId]);
  if (!m) throw notFound();
  const args = [req.user.orgId, m.id];
  const [stats, monthly, byFund, yearly] = await Promise.all([
    one(
      `SELECT COALESCE(sum(amount),0) AS total_all, count(*) AS count, COALESCE(avg(amount),0) AS average,
              COALESCE(sum(amount) FILTER (WHERE date >= date_trunc('year', current_date)),0) AS total_year,
              COALESCE(sum(amount) FILTER (WHERE date >= date_trunc('year', current_date) - interval '1 year' AND date < date_trunc('year', current_date)),0) AS total_last_year,
              min(date) AS first_date, max(date) AS last_date, COALESCE(max(amount),0) AS largest
       FROM offerings WHERE org_id = $1 AND member_id = $2`, args),
    q(
      `SELECT to_char(g.month, 'YYYY-MM') AS month, COALESCE(sum(o.amount), 0) AS total
       FROM generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') AS g(month)
       LEFT JOIN offerings o ON o.org_id = $1 AND o.member_id = $2 AND date_trunc('month', o.date) = g.month
       GROUP BY g.month ORDER BY g.month`, args),
    q(
      `SELECT f.id, f.name, f.color_slot, sum(o.amount) AS total FROM offerings o JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 AND o.member_id = $2 GROUP BY f.id ORDER BY total DESC`, args),
    q(`SELECT extract(year FROM date)::int AS year, sum(amount) AS total FROM offerings WHERE org_id = $1 AND member_id = $2 GROUP BY 1 ORDER BY 1 DESC`, args),
  ]);
  res.json({ member: m, stats, monthly, byFund, yearly });
});

r.patch('/:id', async (req, res) => {
  const body = parse(schema, req.body) as Record<string, unknown>;
  const m = await one(
    `UPDATE members SET ${COLS.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND org_id = $2 RETURNING *`,
    [req.params.id, req.user.orgId, ...COLS.map((c) => body[c] ?? null)],
  );
  if (!m) throw notFound();
  await audit(req, 'update', 'member', m.id, `${m.first_name} ${m.last_name}`.trim());
  res.json(m);
});

// Members with recorded offerings are archived rather than erased, so past totals stay intact.
r.delete('/:id', async (req, res) => {
  const m = await one('SELECT id, first_name, last_name, avatar_file FROM members WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!m) throw notFound();
  const has = await one('SELECT 1 FROM offerings WHERE member_id = $1 LIMIT 1', [m.id]);
  if (has) await q('UPDATE members SET archived_at = now() WHERE id = $1', [m.id]);
  else {
    await q('DELETE FROM members WHERE id = $1', [m.id]);
    await removeFile(req.user.orgId, m.avatar_file);
  }
  await audit(req, 'delete', 'member', m.id, `${m.first_name} ${m.last_name}`.trim());
  res.json({ ok: true, archived: !!has });
});

r.post('/:id/avatar', upload.single('file'), async (req, res) => {
  const m = await one('SELECT id, avatar_file FROM members WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!m) throw notFound();
  const name = await saveImage(req.user.orgId, req.file, 'avatar');
  await q('UPDATE members SET avatar_file = $1 WHERE id = $2', [name, m.id]);
  await removeFile(req.user.orgId, m.avatar_file);
  res.json({ avatar_file: name });
});

r.delete('/:id/avatar', async (req, res) => {
  const m = await one('UPDATE members m SET avatar_file = NULL FROM members old WHERE m.id = $1 AND m.org_id = $2 AND old.id = m.id RETURNING old.avatar_file', [req.params.id, req.user.orgId]);
  if (!m) throw notFound();
  await removeFile(req.user.orgId, m.avatar_file);
  res.json({ ok: true });
});

export default r;
