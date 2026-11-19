import { Router } from 'express';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { HttpError, audit, diff, notFound, parse } from '../http';
import { date, text, uuid } from '../lib/z';
import { depositSlipPdf } from '../lib/pdf';
import { fullName } from './members';
import { Lang } from '../lib/reports';

const r = Router();

// Only cash and checks travel to the bank in the envelope; card and transfer gifts arrive on their own.
const TOTALS = `SELECT b.deposit_id,
    COALESCE(sum(o.amount) FILTER (WHERE o.method = 'cash'), 0) AS cash,
    COALESCE(sum(o.amount) FILTER (WHERE o.method = 'check'), 0) AS checks,
    count(*) FILTER (WHERE o.method = 'check')::int AS check_count
  FROM batches b LEFT JOIN offerings o ON o.batch_id = b.id`;

const LIST = `SELECT d.*, COALESCE(t.cash, 0) AS cash, COALESCE(t.checks, 0) AS checks, COALESCE(t.check_count, 0) AS check_count,
    COALESCE(t.cash, 0) + COALESCE(t.checks, 0) AS total,
    (SELECT count(*)::int FROM batches b WHERE b.deposit_id = d.id) AS batch_count
  FROM deposits d LEFT JOIN (${TOTALS} WHERE b.org_id = $1 AND b.deposit_id IS NOT NULL GROUP BY b.deposit_id) t ON t.deposit_id = d.id
  WHERE d.org_id = $1`;

const PENDING = `SELECT b.id, b.date, b.name, b.closed_at,
    COALESCE(sum(o.amount) FILTER (WHERE o.method = 'cash'), 0) AS cash,
    COALESCE(sum(o.amount) FILTER (WHERE o.method = 'check'), 0) AS checks
  FROM batches b LEFT JOIN offerings o ON o.batch_id = b.id
  WHERE b.org_id = $1 AND b.status = 'closed' AND b.deposit_id IS NULL GROUP BY b.id ORDER BY b.date`;

const schema = z.object({
  date,
  account: text(120),
  reference: text(120),
  notes: text(1000),
  batch_ids: z.array(uuid).max(100).default([]),
});

r.get('/', async (req, res) => {
  const [deposits, pending] = await Promise.all([
    q(`${LIST} ORDER BY d.date DESC, d.created_at DESC LIMIT 200`, [req.user.orgId]),
    q(PENDING, [req.user.orgId]),
  ]);
  res.json({ deposits, pending });
});

/** Checks the counts can go in this deposit: closed, this church's, and not in another deposit. */
async function attachBatches(orgId: string, depositId: string, ids: string[], c: any) {
  if (!ids.length) return;
  const rows = await q('SELECT id, status, deposit_id FROM batches WHERE org_id = $1 AND id = ANY($2::uuid[])', [orgId, ids], c);
  if (rows.length !== new Set(ids).size) throw new HttpError(400, 'invalid_batch');
  if (rows.some((b) => b.status !== 'closed')) throw new HttpError(409, 'batch_not_closed');
  if (rows.some((b) => b.deposit_id && b.deposit_id !== depositId)) throw new HttpError(409, 'batch_already_deposited');
  await q('UPDATE batches SET deposit_id = $1 WHERE org_id = $2 AND id = ANY($3::uuid[])', [depositId, orgId, ids], c);
}

r.post('/', async (req, res) => {
  const b = parse(schema, req.body);
  if (!b.batch_ids.length) throw new HttpError(400, 'deposit_needs_batches');
  const row = await tx(async (c) => {
    const d = await one(
      'INSERT INTO deposits (org_id, date, account, reference, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.orgId, b.date, b.account ?? null, b.reference ?? null, b.notes ?? null, req.user.id], c,
    );
    await attachBatches(req.user.orgId, d.id, b.batch_ids, c);
    return d;
  });
  const full = await one(`${LIST} AND d.id = $2`, [req.user.orgId, row.id]);
  await audit(req, 'create', 'deposit', row.id, `${row.date} · ${full.total}`);
  res.status(201).json(full);
});

async function detail(orgId: string, id: string) {
  const d = await one(`${LIST} AND d.id = $2`, [orgId, id]);
  if (!d) return null;
  const [batches, checks] = await Promise.all([
    q(`SELECT b.id, b.date, b.name, b.denominations,
         COALESCE(sum(o.amount) FILTER (WHERE o.method = 'cash'), 0) AS cash,
         COALESCE(sum(o.amount) FILTER (WHERE o.method = 'check'), 0) AS checks
       FROM batches b LEFT JOIN offerings o ON o.batch_id = b.id WHERE b.deposit_id = $1 GROUP BY b.id ORDER BY b.date, b.created_at`, [id]),
    q(`SELECT o.id, o.amount, o.check_number, COALESCE(${fullName}, '') AS name
       FROM offerings o JOIN batches b ON b.id = o.batch_id LEFT JOIN members m ON m.id = o.member_id
       WHERE b.deposit_id = $1 AND o.method = 'check' ORDER BY b.date, o.created_at`, [id]),
  ]);
  const denom = new Map<number, number>();
  for (const b of batches) for (const [k, v] of Object.entries(b.denominations || {})) denom.set(Number(k), (denom.get(Number(k)) || 0) + Number(v));
  const denominations = [...denom.entries()].filter(([, n]) => n > 0).sort((a, b) => b[0] - a[0]).map(([value, count]) => ({ value, count }));
  return { ...d, batches: batches.map(({ denominations: _d, ...b }) => b), check_list: checks, denominations };
}

r.get('/:id', async (req, res) => {
  const d = await detail(req.user.orgId, String(req.params.id));
  if (!d) throw notFound();
  res.json(d);
});

r.get('/:id/slip.pdf', async (req, res) => {
  const d = await detail(req.user.orgId, String(req.params.id));
  if (!d) throw notFound();
  const lang: Lang = req.query.lang === 'en' || req.query.lang === 'es' ? req.query.lang : req.user.language;
  const org = await one('SELECT * FROM organizations WHERE id = $1', [req.user.orgId]);
  const pdf = await depositSlipPdf(org, { ...d, checks: d.check_list, checkTotal: d.checks }, lang);
  res.type('application/pdf').attachment(`${lang === 'es' ? 'deposito' : 'deposit'}-${d.date}.pdf`).send(pdf);
});

const patchSchema = schema.omit({ batch_ids: true }).partial().extend({
  batch_ids: z.array(uuid).max(100).optional(),
  status: z.enum(['pending', 'deposited', 'reconciled']).optional(),
  deposited_at: z.preprocess((v) => (v === '' ? null : v), date.nullish()),
  bank_amount: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(0).max(99_999_999).nullish()),
  reconcile_note: text(500),
});

/**
 * Edits a deposit and moves it along: pending → deposited (taken to the bank) → reconciled
 * (matches the bank statement). A difference between the slip and the bank needs a note.
 */
r.patch('/:id', async (req, res) => {
  const b = parse(patchSchema, req.body);
  const before = await one(`${LIST} AND d.id = $2`, [req.user.orgId, req.params.id]);
  if (!before) throw notFound();
  const status = b.status ?? before.status;
  if (before.status !== 'pending' && b.batch_ids) throw new HttpError(409, 'deposit_locked');
  const bankAmount = b.bank_amount !== undefined ? b.bank_amount : before.bank_amount;
  const note = b.reconcile_note !== undefined ? b.reconcile_note : before.reconcile_note;
  if (status === 'reconciled') {
    if (bankAmount === null || bankAmount === undefined) throw new HttpError(400, 'bank_amount_required');
    if (Math.abs(bankAmount - before.total) >= 0.005 && !note) throw new HttpError(400, 'reconcile_note_required', { difference: Math.round((bankAmount - before.total) * 100) / 100 });
  }
  const row = await tx(async (c) => {
    if (b.batch_ids) {
      if (!b.batch_ids.length) throw new HttpError(400, 'deposit_needs_batches');
      await q('UPDATE batches SET deposit_id = NULL WHERE deposit_id = $1 AND NOT (id = ANY($2::uuid[]))', [before.id, b.batch_ids], c);
      await attachBatches(req.user.orgId, before.id, b.batch_ids, c);
    }
    return one(
      `UPDATE deposits SET date = $3, account = $4, reference = $5, notes = $6, status = $7,
         deposited_at = CASE WHEN $7 = 'pending' THEN NULL ELSE COALESCE($8::date, deposited_at, date) END,
         bank_amount = $9, reconcile_note = $10,
         reconciled_at = CASE WHEN $7 = 'reconciled' THEN COALESCE(reconciled_at, now()) ELSE NULL END
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [before.id, req.user.orgId, b.date ?? before.date, b.account !== undefined ? b.account : before.account, b.reference !== undefined ? b.reference : before.reference,
        b.notes !== undefined ? b.notes : before.notes, status, b.deposited_at ?? null, bankAmount ?? null, note ?? null], c,
    );
  });
  const action = status !== before.status ? status === 'pending' ? 'reopen' : status === 'deposited' ? 'deposit' : 'reconcile' : 'update';
  await audit(req, action, 'deposit', row.id, `${row.date} · ${before.total}`, diff(before, row, ['date', 'account', 'reference', 'notes', 'status', 'bank_amount', 'reconcile_note']));
  res.json(await detail(req.user.orgId, row.id));
});

// Removing a deposit frees its counts so they can go in another one.
r.delete('/:id', async (req, res) => {
  const d = await one('SELECT id, date, status FROM deposits WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
  if (!d) throw notFound();
  if (d.status !== 'pending') throw new HttpError(409, 'deposit_locked');
  await tx(async (c) => {
    await q('UPDATE batches SET deposit_id = NULL WHERE deposit_id = $1', [d.id], c);
    await q('DELETE FROM deposits WHERE id = $1', [d.id], c);
  });
  await audit(req, 'delete', 'deposit', d.id, String(d.date));
  res.json({ ok: true });
});

export default r;
