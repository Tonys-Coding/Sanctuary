import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { one, q } from '../db';
import { env, features } from '../env';
import { HttpError, audit, notFound, parse } from '../http';
import { text } from '../lib/z';
import { DEFAULT_BIRTHDAY_MESSAGE, normalizePhone, personalize, recipientsFor, segments, sendDue } from '../lib/sms';
import { fullName } from './members';

const r = Router();

r.get('/', async (req, res) => {
  const [rows, org] = await Promise.all([
    q(
      `SELECT s.id, s.batch_id, s.member_id, s.to_phone, s.body, s.kind, s.status, s.send_at, s.sent_at, s.error, s.created_at,
              CASE WHEN m.id IS NULL THEN NULL ELSE ${fullName} END AS member_name, m.avatar_file AS member_avatar
       FROM sms_messages s LEFT JOIN members m ON m.id = s.member_id
       WHERE s.org_id = $1 AND (s.status = 'scheduled' OR s.created_at > now() - interval '90 days')
       ORDER BY s.send_at DESC, s.created_at DESC LIMIT 1000`,
      [req.user.orgId],
    ),
    one('SELECT sms_birthday_enabled, sms_birthday_message FROM organizations WHERE id = $1', [req.user.orgId]),
  ]);
  res.json({
    enabled: features().sms,
    countryCode: env.smsCountryCode,
    birthday: { enabled: org.sms_birthday_enabled, message: org.sms_birthday_message || DEFAULT_BIRTHDAY_MESSAGE[req.user.language] },
    messages: rows,
  });
});

/**
 * Sends (or schedules) one text to each chosen member. Only members who agreed to receive
 * texts and have a usable phone number get one; the rest are reported back by name.
 */
r.post('/', async (req, res) => {
  const body = parse(
    z.object({
      memberIds: z.array(z.string().uuid()).min(1).max(1000),
      message: z.string().trim().min(2).max(1000),
      sendAt: z.string().datetime({ offset: true }).nullish(),
      kind: z.enum(['manual', 'reminder', 'birthday']).default('manual'),
    }),
    req.body,
  );
  if (!features().sms) throw new HttpError(503, 'sms_not_configured');
  const sendAt = body.sendAt ? new Date(body.sendAt) : null;
  if (sendAt && sendAt.getTime() > Date.now() + 366 * 864e5) throw new HttpError(400, 'invalid_input');
  const later = !!sendAt && sendAt.getTime() > Date.now() + 30_000;

  const batchId = crypto.randomUUID();
  const people = await recipientsFor(req.user.orgId, body.memberIds);
  const skipped: { name: string; reason: 'no_consent' | 'no_phone' }[] = [];
  const ids: string[] = [];
  for (const p of people) {
    const to = normalizePhone(p.phone);
    if (!p.sms_opt_in) { skipped.push({ name: p.name, reason: 'no_consent' }); continue; }
    if (!to) { skipped.push({ name: p.name, reason: 'no_phone' }); continue; }
    const row = await one(
      'INSERT INTO sms_messages (org_id, member_id, to_phone, body, kind, send_at, created_by, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [req.user.orgId, p.id, to, personalize(body.message, p.first_name), body.kind, sendAt ?? new Date(), req.user.id, batchId],
    );
    ids.push(row.id);
  }
  if (!later && ids.length) await sendDue(req.user.orgId);
  const result = ids.length ? await q('SELECT status, count(*)::int AS n FROM sms_messages WHERE id = ANY($1::uuid[]) GROUP BY status', [ids]) : [];
  const count = (s: string) => result.find((x) => x.status === s)?.n || 0;
  await audit(req, later ? 'schedule' : 'send', 'sms', null, `${ids.length} · ${body.message.slice(0, 80)}`);
  res.json({ queued: ids.length, sent: count('sent'), failed: count('failed'), scheduled: count('scheduled'), skipped, segments: segments(body.message) });
});

/** Cancels every text of a send that has not gone out yet. */
r.delete('/batch/:batchId', async (req, res) => {
  const rows = await q("UPDATE sms_messages SET status = 'canceled' WHERE batch_id = $1 AND org_id = $2 AND status = 'scheduled' RETURNING id", [req.params.batchId, req.user.orgId]);
  if (!rows.length) throw notFound();
  await audit(req, 'delete', 'sms', null, String(rows.length));
  res.json({ canceled: rows.length });
});

r.delete('/:id', async (req, res) => {
  const row = await one("UPDATE sms_messages SET status = 'canceled' WHERE id = $1 AND org_id = $2 AND status = 'scheduled' RETURNING id", [req.params.id, req.user.orgId]);
  if (!row) throw notFound();
  res.json({ ok: true });
});

r.patch('/birthday', async (req, res) => {
  const b = parse(z.object({ enabled: z.boolean(), message: text(500) }), req.body);
  await q('UPDATE organizations SET sms_birthday_enabled = $2, sms_birthday_message = $3 WHERE id = $1', [req.user.orgId, b.enabled, b.message ?? null]);
  await audit(req, 'update', 'org', req.user.orgId, b.enabled ? 'sms birthday on' : 'sms birthday off');
  res.json({ ok: true });
});

export default r;
