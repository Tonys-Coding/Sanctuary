import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { HttpError, audit, diff, isTimeZone, notFound, parse, todayIn } from '../http';
import { features } from '../env';
import { boardRecipients, previousMonth, sendBoardReport } from '../lib/boardReport';
import { text } from '../lib/z';
import { removeFile, saveImage, upload } from '../lib/files';
import { newInviteCode } from './auth';

const r = Router();

const orgSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legal_name: text(200), tax_id: text(40), address: text(), city: text(100), state: text(100), postal_code: text(20),
  country: z.string().trim().min(2).max(60).default('US'),
  phone: text(40), email: text(200), pastor_name: text(120), treasurer_name: text(120),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  statement_note: text(2000),
  timezone: z.string().trim().refine(isTimeZone, 'unknown time zone').default('UTC'),
  fiscal_year_start: z.coerce.number().int().min(1).max(12).default(1),
  idle_minutes: z.coerce.number().int().min(0).max(240).default(15),
  opening_balance: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().min(-99_999_999).max(99_999_999).nullish()),
  opening_balance_date: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish()),
  board_emails: text(2000),
  board_report_enabled: z.boolean().default(false),
  board_report_day: z.coerce.number().int().min(1).max(28).default(5),
  board_report_lang: z.enum(['es', 'en']).default('es'),
  ai_enabled: z.boolean().default(true),
});
const ORG_COLS = Object.keys(orgSchema.shape);

r.get('/', async (req, res) => {
  res.json(await one('SELECT * FROM organizations WHERE id = $1', [req.user.orgId]));
});

r.patch('/', async (req, res) => {
  const body = parse(orgSchema, req.body) as Record<string, unknown>;
  const before = await one('SELECT * FROM organizations WHERE id = $1', [req.user.orgId]);
  const sets = ORG_COLS.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const org = await one(`UPDATE organizations SET ${sets} WHERE id = $1 RETURNING *`, [req.user.orgId, ...ORG_COLS.map((c) => body[c] ?? null)]);
  await audit(req, 'update', 'org', req.user.orgId, org.name, diff(before, org, ORG_COLS));
  res.json(org);
});

/** Sends last month's treasurer report to the board right now (to try the settings). */
r.post('/board-report/test', async (req, res) => {
  if (!features().email) throw new HttpError(503, 'email_not_configured');
  const org = await one('SELECT board_emails FROM organizations WHERE id = $1', [req.user.orgId]);
  if (!boardRecipients(org.board_emails).length) throw new HttpError(400, 'board_emails_required');
  const sent = await sendBoardReport(req.user.orgId, previousMonth(todayIn(req.user.tz)), req.user.id);
  await audit(req, 'send', 'board_report', null, String(sent));
  res.json({ sent });
});

r.post('/logo', upload.single('file'), async (req, res) => {
  const name = await saveImage(req.user.orgId, req.file, 'logo');
  const old = await one('SELECT logo_file FROM organizations WHERE id = $1', [req.user.orgId]);
  const org = await one('UPDATE organizations SET logo_file = $2 WHERE id = $1 RETURNING *', [req.user.orgId, name]);
  await removeFile(req.user.orgId, old?.logo_file);
  await audit(req, 'update', 'org', req.user.orgId, 'logo');
  res.json(org);
});

r.delete('/logo', async (req, res) => {
  const old = await one('SELECT logo_file FROM organizations WHERE id = $1', [req.user.orgId]);
  const org = await one('UPDATE organizations SET logo_file = NULL WHERE id = $1 RETURNING *', [req.user.orgId]);
  await removeFile(req.user.orgId, old?.logo_file);
  res.json(org);
});

r.get('/team', async (req, res) => {
  res.json(await q('SELECT id, full_name, email, avatar_file, last_login_at, created_at FROM users WHERE org_id = $1 ORDER BY created_at', [req.user.orgId]));
});

r.delete('/team/:id', async (req, res) => {
  if (req.params.id === req.user.id) throw new HttpError(400, 'cannot_remove_self');
  const u = await one('DELETE FROM users WHERE id = $1 AND org_id = $2 RETURNING full_name', [req.params.id, req.user.orgId]);
  if (!u) throw notFound();
  await audit(req, 'delete', 'user', req.params.id, u.full_name);
  res.json({ ok: true });
});

r.get('/invitations', async (req, res) => {
  res.json(
    await q(
      `SELECT i.id, i.code, i.note, i.max_uses, i.uses, i.expires_at, i.revoked_at, i.created_at, u.full_name AS created_by_name,
              (i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now()) AND (i.max_uses IS NULL OR i.uses < i.max_uses)) AS active
       FROM invitations i LEFT JOIN users u ON u.id = i.created_by WHERE i.org_id = $1 ORDER BY i.created_at DESC`,
      [req.user.orgId],
    ),
  );
});

r.post('/invitations', async (req, res) => {
  const body = parse(
    z.object({ note: text(120), maxUses: z.coerce.number().int().min(1).max(500).nullish(), expiresInDays: z.coerce.number().int().min(1).max(365).nullish() }),
    req.body,
  );
  const inv = await one(
    `INSERT INTO invitations (org_id, code, note, max_uses, expires_at, created_by)
     VALUES ($1,$2,$3,$4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + make_interval(days => $5::int) END, $6) RETURNING *`,
    [req.user.orgId, newInviteCode(), body.note ?? null, body.maxUses ?? null, body.expiresInDays ?? null, req.user.id],
  );
  await audit(req, 'create', 'invitation', inv.id, body.note || inv.code.slice(0, 4) + '…');
  res.status(201).json(inv);
});

r.delete('/invitations/:id', async (req, res) => {
  const inv = await one('UPDATE invitations SET revoked_at = now() WHERE id = $1 AND org_id = $2 AND revoked_at IS NULL RETURNING id, note', [req.params.id, req.user.orgId]);
  if (!inv) throw notFound();
  await audit(req, 'delete', 'invitation', inv.id, inv.note || '');
  res.json({ ok: true });
});

r.get('/activity', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  res.json(await q('SELECT id, user_name, action, entity, entity_id, summary, changes, created_at FROM audit_log WHERE org_id = $1 ORDER BY id DESC LIMIT $2', [req.user.orgId, limit]));
});

r.get('/emails', async (req, res) => {
  res.json(await q('SELECT id, recipient, subject, kind, status, error, created_at FROM email_log WHERE org_id = $1 ORDER BY created_at DESC LIMIT 100', [req.user.orgId]));
});

export default r;
