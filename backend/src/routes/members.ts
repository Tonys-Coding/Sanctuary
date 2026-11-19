import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';
import { optDate, optUuid, text, uuid } from '../lib/z';
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
  sms_opt_in: z.boolean().default(false),
  household_id: optUuid,
});
const COLS = Object.keys(schema.shape);
const AUDIT_COLS = [...Object.keys(schema.shape)];

/** Envelope numbers identify people at counting time, so two active members can never share one. */
async function checkMember(orgId: string, body: Record<string, any>, selfId?: string) {
  if (body.envelope_number) {
    const clash = await one(
      `SELECT ${fullName} AS name FROM members m WHERE m.org_id = $1 AND m.envelope_number = $2 AND m.archived_at IS NULL AND ($3::uuid IS NULL OR m.id <> $3)`,
      [orgId, body.envelope_number, selfId ?? null],
    );
    if (clash) throw new HttpError(409, 'envelope_taken', { name: clash.name, envelope: body.envelope_number });
  }
  if (body.household_id && !(await one('SELECT 1 FROM households WHERE id = $1 AND org_id = $2', [body.household_id, orgId]))) {
    throw new HttpError(400, 'invalid_input');
  }
}

// Names compared without accents, case or extra spaces: "José  Pérez" = "jose perez".
const NORM = (a: string) => `regexp_replace(translate(lower(trim(${a}.first_name || ' ' || ${a}.last_name)), 'áéíóúüñàèìòùç', 'aeiouunaeiouc'), '\\s+', ' ', 'g')`;
export const fullName = "trim(m.first_name || ' ' || m.last_name)";

r.get('/', async (req, res) => {
  const search = String(req.query.q || '').trim();
  const rows = await q(
    `SELECT m.*, ${fullName} AS full_name,
            COALESCE(s.total_year, 0) AS total_year, COALESCE(s.total_all, 0) AS total_all,
            COALESCE(s.count, 0) AS offering_count, s.last_date
     FROM members m
     LEFT JOIN (
       SELECT member_id, sum(amount) FILTER (WHERE date >= fy_start($1)) AS total_year,
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
    `SELECT member_id, (extract(year FROM age(date_trunc('month', org_today($1)), date_trunc('month', date))) * 12
              + extract(month FROM age(date_trunc('month', org_today($1)), date_trunc('month', date))))::int AS ago,
            sum(amount) AS total
     FROM offerings WHERE org_id = $1 AND member_id IS NOT NULL AND date >= date_trunc('month', org_today($1)) - interval '11 months'
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

/** Pairs of members that look like the same person, with the reasons. */
r.get('/duplicates', async (req, res) => {
  const rows = await q(
    `SELECT a.id AS a_id, b.id AS b_id,
            ${NORM('a')} = ${NORM('b')} AS same_name,
            (a.email IS NOT NULL AND lower(a.email) = lower(b.email)) AS same_email,
            (length(regexp_replace(COALESCE(a.phone, ''), '\\D', '', 'g')) >= 7
              AND regexp_replace(a.phone, '\\D', '', 'g') = regexp_replace(COALESCE(b.phone, ''), '\\D', '', 'g')) AS same_phone,
            (a.envelope_number IS NOT NULL AND a.envelope_number = b.envelope_number) AS same_envelope
     FROM members a JOIN members b ON b.org_id = a.org_id AND a.id < b.id AND b.archived_at IS NULL
     WHERE a.org_id = $1 AND a.archived_at IS NULL
       AND (${NORM('a')} = ${NORM('b')}
            OR (a.email IS NOT NULL AND lower(a.email) = lower(b.email))
            OR (length(regexp_replace(COALESCE(a.phone, ''), '\\D', '', 'g')) >= 7
                AND regexp_replace(a.phone, '\\D', '', 'g') = regexp_replace(COALESCE(b.phone, ''), '\\D', '', 'g'))
            OR (a.envelope_number IS NOT NULL AND a.envelope_number = b.envelope_number))
       AND NOT EXISTS (SELECT 1 FROM member_not_duplicates d WHERE d.a = a.id AND d.b = b.id)
     LIMIT 100`,
    [req.user.orgId],
  );
  if (!rows.length) return void res.json([]);
  const ids = [...new Set(rows.flatMap((r) => [r.a_id, r.b_id]))];
  const people = await q(
    `SELECT m.id, ${fullName} AS full_name, m.email, m.phone, m.envelope_number, m.avatar_file, m.status, m.created_at,
            (SELECT count(*) FROM offerings o WHERE o.member_id = m.id)::int AS offering_count,
            (SELECT COALESCE(sum(amount), 0) FROM offerings o WHERE o.member_id = m.id) AS total_all
     FROM members m WHERE m.id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  res.json(rows.map((r) => ({
    a: byId.get(r.a_id), b: byId.get(r.b_id),
    reasons: [r.same_name && 'name', r.same_email && 'email', r.same_phone && 'phone', r.same_envelope && 'envelope'].filter(Boolean),
  })));
});

r.post('/duplicates/dismiss', async (req, res) => {
  const b = parse(z.object({ a: uuid, b: uuid }), req.body);
  const [x, y] = [b.a, b.b].sort();
  const ok = await one('SELECT count(*)::int AS n FROM members WHERE org_id = $1 AND id = ANY($2::uuid[])', [req.user.orgId, [x, y]]);
  if (ok.n !== 2) throw notFound();
  await q('INSERT INTO member_not_duplicates (org_id, a, b) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.user.orgId, x, y]);
  res.json({ ok: true });
});

/**
 * Merges another member into this one: their offerings, texts, statements, pledges, gifts and links
 * move here, empty fields are filled from theirs, and the other record is removed.
 */
r.post('/:id/merge', async (req, res) => {
  const { other_id } = parse(z.object({ other_id: uuid }), req.body);
  if (other_id === req.params.id) throw new HttpError(400, 'invalid_input');
  const result = await tx(async (c) => {
    const keep = await one('SELECT * FROM members WHERE id = $1 AND org_id = $2 FOR UPDATE', [req.params.id, req.user.orgId], c);
    const other = await one('SELECT * FROM members WHERE id = $1 AND org_id = $2 FOR UPDATE', [other_id, req.user.orgId], c);
    if (!keep || !other) throw notFound();
    const counts: Record<string, number> = {};
    const move = async (table: string) => {
      const r = await q(`UPDATE ${table} SET member_id = $1 WHERE member_id = $2 RETURNING 1`, [keep.id, other.id], c);
      counts[table] = r.length;
    };
    await move('offerings');
    await move('sms_messages');
    await move('noncash_gifts');
    await move('member_links');
    // A year or goal that both people have keeps the surviving record's row.
    await q('DELETE FROM tax_statements t WHERE t.member_id = $2 AND EXISTS (SELECT 1 FROM tax_statements k WHERE k.member_id = $1 AND k.year = t.year)', [keep.id, other.id], c);
    await move('tax_statements');
    await q(`UPDATE pledges p SET amount = p.amount + o.amount FROM pledges o WHERE p.member_id = $1 AND o.member_id = $2 AND p.goal_id = o.goal_id`, [keep.id, other.id], c);
    await q('DELETE FROM pledges o WHERE o.member_id = $2 AND EXISTS (SELECT 1 FROM pledges p WHERE p.member_id = $1 AND p.goal_id = o.goal_id)', [keep.id, other.id], c);
    await move('pledges');
    const fill = ['email', 'phone', 'address', 'city', 'state', 'postal_code', 'birth_date', 'joined_date', 'envelope_number', 'avatar_file', 'household_id'];
    const merged: Record<string, any> = {};
    for (const f of fill) merged[f] = keep[f] ?? other[f] ?? null;
    merged.joined_date = [keep.joined_date, other.joined_date].filter(Boolean).sort()[0] ?? null;
    merged.notes = [keep.notes, other.notes].filter(Boolean).join('\n') || null;
    merged.sms_opt_in = keep.sms_opt_in || other.sms_opt_in;
    // Free the envelope number before it moves over, so the uniqueness rule is never broken mid-way.
    await q('DELETE FROM members WHERE id = $1', [other.id], c);
    const cols = Object.keys(merged);
    await q(`UPDATE members SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`, [keep.id, ...cols.map((k) => merged[k])], c);
    return { keep, other, counts };
  });
  await audit(req, 'merge', 'member', result.keep.id,
    `${result.keep.first_name} ${result.keep.last_name}`.trim() + ' ← ' + `${result.other.first_name} ${result.other.last_name}`.trim(),
    { offerings: [result.counts.offerings, null] });
  res.json({ ok: true, moved: result.counts });
});

r.post('/', async (req, res) => {
  const body = parse(schema, req.body) as Record<string, unknown>;
  await checkMember(req.user.orgId, body);
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
              COALESCE(sum(amount) FILTER (WHERE date >= fy_start($1)),0) AS total_year,
              COALESCE(sum(amount) FILTER (WHERE date >= (fy_start($1) - interval '1 year') AND date < fy_start($1)),0) AS total_last_year,
              min(date) AS first_date, max(date) AS last_date, COALESCE(max(amount),0) AS largest
       FROM offerings WHERE org_id = $1 AND member_id = $2`, args),
    q(
      `SELECT to_char(g.month, 'YYYY-MM') AS month, COALESCE(sum(o.amount), 0) AS total
       FROM generate_series(date_trunc('month', org_today($1)) - interval '11 months', date_trunc('month', org_today($1)), interval '1 month') AS g(month)
       LEFT JOIN offerings o ON o.org_id = $1 AND o.member_id = $2 AND date_trunc('month', o.date) = g.month
       GROUP BY g.month ORDER BY g.month`, args),
    q(
      `SELECT f.id, f.name, f.color_slot, sum(o.amount) AS total FROM offerings o JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 AND o.member_id = $2 GROUP BY f.id ORDER BY total DESC`, args),
    q(`SELECT extract(year FROM date)::int AS year, sum(amount) AS total FROM offerings WHERE org_id = $1 AND member_id = $2 GROUP BY 1 ORDER BY 1 DESC`, args),
  ]);
  const household = m.household_id
    ? {
        ...(await one('SELECT id, name, joint_statement FROM households WHERE id = $1', [m.household_id])),
        members: await q(`SELECT m.id, ${fullName} AS full_name, m.avatar_file FROM members m WHERE m.household_id = $1 AND m.id <> $2 AND m.archived_at IS NULL ORDER BY m.first_name`, [m.household_id, m.id]),
      }
    : null;
  res.json({ member: m, stats, monthly, byFund, yearly, household });
});

r.patch('/:id', async (req, res) => {
  const body = parse(schema, req.body) as Record<string, unknown>;
  await checkMember(req.user.orgId, body, String(req.params.id));
  const before = await one('SELECT * FROM members WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  const m = await one(
    `UPDATE members SET ${COLS.map((c, i) => `${c} = $${i + 3}`).join(', ')} WHERE id = $1 AND org_id = $2 RETURNING *`,
    [req.params.id, req.user.orgId, ...COLS.map((c) => body[c] ?? null)],
  );
  if (!m) throw notFound();
  await audit(req, 'update', 'member', m.id, `${m.first_name} ${m.last_name}`.trim(), diff(before, m, AUDIT_COLS));
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
