import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { HttpError, audit, diff, notFound, parse, snapshot } from '../http';
import { date, method, money, optUuid, text, uuid } from '../lib/z';
import { removeFile, saveReceipt, upload } from '../lib/files';
import { fiscalLabel, fiscalMonths, fiscalRange, fiscalYearOf } from '../lib/period';
import { todayIn } from '../http';
import { balanceAt } from '../lib/reports';

const r = Router();

const DEFAULT_CATEGORIES = {
  es: ['Salarios y honorarios', 'Alquiler o hipoteca', 'Servicios (luz, agua, gas, internet)', 'Mantenimiento y reparaciones', 'Misiones', 'Ministerios y eventos', 'Ayuda a necesitados', 'Oficina y materiales', 'Otros gastos'],
  en: ['Salaries and honoraria', 'Rent or mortgage', 'Utilities (power, water, gas, internet)', 'Maintenance and repairs', 'Missions', 'Ministries and events', 'Benevolence', 'Office and supplies', 'Other expenses'],
};

// ─── Categories ──────────────────────────────────────────────────────────────

const catSchema = z.object({ name: z.string().trim().min(1).max(80), color_slot: z.coerce.number().int().min(1).max(8).default(1) });

r.get('/categories', async (req, res) => {
  let rows = await q('SELECT * FROM expense_categories WHERE org_id = $1 AND ($2 OR archived_at IS NULL) ORDER BY archived_at NULLS FIRST, sort_order, created_at', [req.user.orgId, req.query.all === '1']);
  if (!rows.length && !(await one('SELECT 1 FROM expense_categories WHERE org_id = $1', [req.user.orgId]))) {
    // A church starting to track expenses gets the usual categories, which it can rename or archive.
    await tx(async (c) => {
      for (const [i, name] of DEFAULT_CATEGORIES[req.user.language].entries()) {
        await q('INSERT INTO expense_categories (org_id, name, color_slot, sort_order) VALUES ($1,$2,$3,$4)', [req.user.orgId, name, (i % 8) + 1, i + 1], c);
      }
    });
    rows = await q('SELECT * FROM expense_categories WHERE org_id = $1 ORDER BY sort_order', [req.user.orgId]);
  }
  res.json(rows);
});

r.post('/categories', async (req, res) => {
  const b = parse(catSchema, req.body);
  const row = await one(
    `INSERT INTO expense_categories (org_id, name, color_slot, sort_order)
     VALUES ($1,$2,$3,(SELECT COALESCE(max(sort_order), 0) + 1 FROM expense_categories WHERE org_id = $1)) RETURNING *`,
    [req.user.orgId, b.name, b.color_slot],
  );
  await audit(req, 'create', 'expense_category', row.id, row.name);
  res.status(201).json(row);
});

r.patch('/categories/:id', async (req, res) => {
  const b = parse(catSchema.extend({ archived: z.boolean().optional() }), req.body);
  const before = await one('SELECT * FROM expense_categories WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  const row = await one(
    `UPDATE expense_categories SET name = $3, color_slot = $4,
       archived_at = CASE WHEN $5::boolean IS NULL THEN archived_at WHEN $5 THEN COALESCE(archived_at, now()) ELSE NULL END
     WHERE id = $1 AND org_id = $2 RETURNING *`,
    [before.id, req.user.orgId, b.name, b.color_slot, b.archived ?? null],
  );
  await audit(req, 'update', 'expense_category', row.id, row.name, diff(before, row, ['name', 'color_slot', 'archived_at']));
  res.json(row);
});

r.delete('/categories/:id', async (req, res) => {
  const c = await one('SELECT id, name FROM expense_categories WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!c) throw notFound();
  if (await one('SELECT 1 FROM expenses WHERE category_id = $1 LIMIT 1', [c.id])) throw new HttpError(409, 'category_in_use');
  await q('DELETE FROM expense_categories WHERE id = $1', [c.id]);
  await audit(req, 'delete', 'expense_category', c.id, c.name);
  res.json({ ok: true });
});

// ─── Budget ──────────────────────────────────────────────────────────────────

async function fiscal(orgId: string, tz: string, yearParam?: unknown) {
  const org = await one('SELECT fiscal_year_start FROM organizations WHERE id = $1', [orgId]);
  const fys = org.fiscal_year_start || 1;
  const current = fiscalYearOf(todayIn(tz), fys);
  const year = Number(yearParam) >= 2000 && Number(yearParam) <= 2100 ? Number(yearParam) : current;
  return { year, fys, current, ...fiscalRange(year, fys), label: fiscalLabel(year, fys) };
}

/** Budget vs. spending per category for a fiscal year, month by month. */
r.get('/summary', async (req, res) => {
  const f = await fiscal(req.user.orgId, req.user.tz, req.query.year);
  const today = todayIn(req.user.tz);
  const [cats, monthly, income, years, balance] = await Promise.all([
    q(`SELECT c.id, c.name, c.color_slot, c.archived_at, b.amount AS budget,
         COALESCE((SELECT sum(amount) FROM expenses e WHERE e.category_id = c.id AND e.date BETWEEN $2 AND $3), 0) AS spent
       FROM expense_categories c LEFT JOIN budgets b ON b.category_id = c.id AND b.year = $4
       WHERE c.org_id = $1 ORDER BY c.archived_at NULLS FIRST, c.sort_order, c.name`, [req.user.orgId, f.start, f.end, f.year]),
    q(`SELECT extract(year FROM date)::int AS y, extract(month FROM date)::int AS m, sum(amount) AS total
       FROM expenses WHERE org_id = $1 AND date BETWEEN $2 AND $3 GROUP BY 1, 2`, [req.user.orgId, f.start, f.end]),
    q(`SELECT extract(year FROM date)::int AS y, extract(month FROM date)::int AS m, sum(amount) AS total
       FROM offerings WHERE org_id = $1 AND date BETWEEN $2 AND $3 GROUP BY 1, 2`, [req.user.orgId, f.start, f.end]),
    q(`SELECT DISTINCT extract(year FROM date)::int AS y, extract(month FROM date)::int AS m FROM expenses WHERE org_id = $1`, [req.user.orgId]),
    balanceAt(req.user.orgId, today),
  ]);
  const key = (y: number, m: number) => `${y}-${m}`;
  const exp = new Map(monthly.map((x) => [key(x.y, x.m), x.total]));
  const inc = new Map(income.map((x) => [key(x.y, x.m), x.total]));
  const fyYears = new Set<number>([f.current, ...years.map((x) => fiscalYearOf(`${x.y}-${String(x.m).padStart(2, '0')}-01`, f.fys))]);
  res.json({
    year: f.year, label: f.label, start: f.start, end: f.end, balance,
    years: [...fyYears].sort((a, b) => b - a).map((y) => ({ year: y, label: fiscalLabel(y, f.fys) })),
    categories: cats.filter((c) => !c.archived_at || c.spent > 0 || c.budget),
    months: fiscalMonths(f.year, f.fys).map(({ year, month }) => ({ year, month, expenses: exp.get(key(year, month)) || 0, income: inc.get(key(year, month)) || 0 })),
    totals: { budget: cats.reduce((a, c) => a + (c.budget || 0), 0), spent: cats.reduce((a, c) => a + c.spent, 0), income: income.reduce((a, x) => a + x.total, 0) },
  });
});

r.put('/budget', async (req, res) => {
  const b = parse(z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    amounts: z.array(z.object({ category_id: uuid, amount: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(99_999_999).nullish()) })).max(200),
  }), req.body);
  const owned = new Set((await q('SELECT id FROM expense_categories WHERE org_id = $1', [req.user.orgId])).map((c) => c.id));
  if (b.amounts.some((a) => !owned.has(a.category_id))) throw new HttpError(400, 'invalid_category');
  await tx(async (c) => {
    for (const a of b.amounts) {
      if (a.amount === null || a.amount === undefined) await q('DELETE FROM budgets WHERE category_id = $1 AND year = $2', [a.category_id, b.year], c);
      else await q(`INSERT INTO budgets (org_id, category_id, year, amount) VALUES ($1,$2,$3,$4)
                    ON CONFLICT (category_id, year) DO UPDATE SET amount = EXCLUDED.amount`, [req.user.orgId, a.category_id, b.year, Math.round(a.amount * 100) / 100], c);
    }
  });
  await audit(req, 'update', 'budget', null, String(b.year));
  res.json({ ok: true });
});

// ─── Expenses ────────────────────────────────────────────────────────────────

const schema = z.object({
  date,
  category_id: uuid,
  fund_id: optUuid,
  payee: z.string().trim().min(1).max(160),
  amount: money,
  method: method.default('check'),
  reference: text(120),
  notes: text(1000),
});
const FIELDS = ['date', 'category_id', 'fund_id', 'payee', 'amount', 'method', 'reference', 'notes'];
const SELECT = `SELECT e.*, c.name AS category, c.color_slot, f.name AS fund FROM expenses e
  JOIN expense_categories c ON c.id = e.category_id LEFT JOIN funds f ON f.id = e.fund_id WHERE e.org_id = $1`;

async function check(orgId: string, b: z.infer<typeof schema>) {
  if (!(await one('SELECT 1 FROM expense_categories WHERE id = $1 AND org_id = $2', [b.category_id, orgId]))) throw new HttpError(400, 'invalid_category');
  if (b.fund_id && !(await one('SELECT 1 FROM funds WHERE id = $1 AND org_id = $2', [b.fund_id, orgId]))) throw new HttpError(400, 'invalid_fund');
}

r.get('/', async (req, res) => {
  const where: string[] = [];
  const params: unknown[] = [req.user.orgId];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (typeof req.query.from === 'string' && req.query.from) add('e.date >= ?', req.query.from);
  if (typeof req.query.to === 'string' && req.query.to) add('e.date <= ?', req.query.to);
  if (typeof req.query.category === 'string' && req.query.category) add('e.category_id = ?', req.query.category);
  if (typeof req.query.q === 'string' && req.query.q.trim()) add("(e.payee ILIKE ? OR e.reference ILIKE $X OR e.notes ILIKE $X)".replace(/\$X/g, `$${params.length + 1}`), `%${req.query.q.trim()}%`);
  const rows = await q(`${SELECT}${where.map((w) => ` AND ${w}`).join('')} ORDER BY e.date DESC, e.created_at DESC LIMIT 500`, params);
  res.json(rows);
});

/** Payees used before, so the form can suggest them. */
r.get('/payees', async (req, res) => {
  res.json(await q(`SELECT payee, (array_agg(category_id ORDER BY date DESC))[1] AS category_id, count(*)::int AS uses
    FROM expenses WHERE org_id = $1 GROUP BY payee ORDER BY uses DESC, payee LIMIT 200`, [req.user.orgId]));
});

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  await check(req.user.orgId, b);
  const row = await one(
    `INSERT INTO expenses (org_id, date, category_id, fund_id, payee, amount, method, reference, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [req.user.orgId, b.date, b.category_id, b.fund_id ?? null, b.payee, b.amount, b.method, b.reference ?? null, b.notes ?? null, req.user.id],
  );
  const full = await one(`${SELECT} AND e.id = $2`, [req.user.orgId, row.id]);
  await audit(req, 'create', 'expense', row.id, `${full.payee} · ${full.amount}`);
  res.status(201).json(full);
});

r.patch('/:id', async (req, res) => {
  const b = parse(schema, req.body);
  const before = await one('SELECT * FROM expenses WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  await check(req.user.orgId, b);
  const row = await one(
    `UPDATE expenses SET date=$3, category_id=$4, fund_id=$5, payee=$6, amount=$7, method=$8, reference=$9, notes=$10, updated_at=now()
     WHERE id = $1 AND org_id = $2 RETURNING *`,
    [before.id, req.user.orgId, b.date, b.category_id, b.fund_id ?? null, b.payee, b.amount, b.method, b.reference ?? null, b.notes ?? null],
  );
  await audit(req, 'update', 'expense', row.id, `${row.payee} · ${row.amount}`, diff(before, row, FIELDS));
  res.json(await one(`${SELECT} AND e.id = $2`, [req.user.orgId, row.id]));
});

r.post('/:id/receipt', upload.single('file'), async (req, res) => {
  const before = await one('SELECT id, receipt_file FROM expenses WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  const name = await saveReceipt(req.user.orgId, req.file);
  await q('UPDATE expenses SET receipt_file = $2, updated_at = now() WHERE id = $1', [before.id, name]);
  await removeFile(req.user.orgId, before.receipt_file);
  res.json({ receipt_file: name });
});

r.delete('/:id/receipt', async (req, res) => {
  const before = await one('SELECT id, receipt_file FROM expenses WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!before) throw notFound();
  await q('UPDATE expenses SET receipt_file = NULL WHERE id = $1', [before.id]);
  await removeFile(req.user.orgId, before.receipt_file);
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  const row = await one('DELETE FROM expenses WHERE id = $1 AND org_id = $2 RETURNING *', [req.params.id, req.user.orgId]);
  if (!row) throw notFound();
  await removeFile(req.user.orgId, row.receipt_file);
  await audit(req, 'delete', 'expense', row.id, `${row.payee} · ${row.amount}`, snapshot(row, FIELDS));
  res.json(row);
});

export default r;
