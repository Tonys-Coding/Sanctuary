import { Router } from 'express';
import { one, q } from '../db';
import { features } from '../env';
import { fullName } from './members';
import { listBackups } from '../lib/backup';

const r = Router();

/**
 * One box that finds anything: members (name, envelope, e-mail, phone), checks by number,
 * offerings by exact amount, counts by name or date, expenses by payee and deposits by reference.
 */
r.get('/search', async (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 80);
  if (raw.length < 2) return void res.json({ members: [], offerings: [], batches: [], expenses: [], deposits: [] });
  const like = `%${raw.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const digits = raw.replace(/\D/g, '');
  const amount = /^\$?\s*\d{1,7}([.,]\d{1,2})?$/.test(raw) ? Number(raw.replace(/[$\s]/g, '').replace(',', '.')) : null;
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  const o = req.user.orgId;
  const [members, offerings, batches, expenses, deposits] = await Promise.all([
    q(`SELECT m.id, ${fullName} AS name, m.envelope_number, m.email, m.phone, m.avatar_file, m.archived_at FROM members m
       WHERE m.org_id = $1 AND (translate(lower(${fullName}), 'áéíóúüñàèìòùç', 'aeiouunaeiouc') LIKE translate(lower($2), 'áéíóúüñàèìòùç', 'aeiouunaeiouc') OR m.envelope_number = $3 OR m.email ILIKE $2
         OR ($4 <> '' AND length($4) >= 4 AND regexp_replace(COALESCE(m.phone, ''), '\\D', '', 'g') LIKE '%' || $4 || '%'))
       ORDER BY m.archived_at NULLS FIRST, ${fullName} LIMIT 8`, [o, like, raw, digits]),
    q(`SELECT o.id, o.date, o.amount, o.method, o.check_number, o.batch_id, f.name AS fund, COALESCE(${fullName}, '') AS member_name, o.member_id
       FROM offerings o JOIN funds f ON f.id = o.fund_id LEFT JOIN members m ON m.id = o.member_id
       WHERE o.org_id = $1 AND ((o.check_number IS NOT NULL AND o.check_number = $2) OR ($3::numeric IS NOT NULL AND o.amount = $3) OR o.external_ref = $2)
       ORDER BY o.date DESC LIMIT 8`, [o, raw, amount]),
    q(`SELECT b.id, b.date, b.name, b.status FROM batches b WHERE b.org_id = $1 AND (b.name ILIKE $2 OR b.date = $3::date)
       ORDER BY b.date DESC LIMIT 6`, [o, like, dateIso]),
    q(`SELECT e.id, e.date, e.payee, e.amount FROM expenses e WHERE e.org_id = $1
       AND (e.payee ILIKE $2 OR e.reference = $3 OR ($4::numeric IS NOT NULL AND e.amount = $4)) ORDER BY e.date DESC LIMIT 6`, [o, like, raw, amount]),
    q(`SELECT d.id, d.date, d.reference, d.status FROM deposits d WHERE d.org_id = $1 AND (d.reference ILIKE $2 OR d.date = $3::date)
       ORDER BY d.date DESC LIMIT 4`, [o, like, dateIso]),
  ]);
  res.json({ members, offerings, batches, expenses, deposits });
});

/** "Primeros pasos": what a new church still has to set up, in the order that matters. */
r.get('/setup', async (req, res) => {
  const o = req.user.orgId;
  const c = await one(
    `SELECT org.legal_name, org.tax_id, org.address, org.city, org.timezone, org.logo_file, org.opening_balance, org.treasurer_name, org.pastor_name,
       (SELECT count(*)::int FROM members WHERE org_id = $1) AS members,
       (SELECT count(*)::int FROM batches WHERE org_id = $1) AS batches,
       (SELECT count(*)::int FROM offerings WHERE org_id = $1) AS offerings,
       (SELECT count(*)::int FROM users WHERE org_id = $1) AS users,
       (SELECT count(*)::int FROM invitations WHERE org_id = $1) AS invitations,
       (SELECT count(*)::int FROM audit_log WHERE org_id = $1 AND entity = 'fund') AS fund_changes,
       (SELECT count(*)::int FROM audit_log WHERE org_id = $1 AND entity = 'backup' AND action IN ('export', 'create')) AS backups
     FROM organizations org WHERE org.id = $1`, [o]);
  const f = features();
  const steps = [
    { key: 'church', done: !!(c.legal_name && c.tax_id && c.address && c.city), to: '/configuracion?tab=iglesia' },
    { key: 'timezone', done: c.timezone !== 'UTC', to: '/configuracion?tab=iglesia' },
    { key: 'signer', done: !!(c.treasurer_name || c.pastor_name), to: '/configuracion?tab=iglesia' },
    { key: 'logo', done: !!c.logo_file, to: '/configuracion?tab=iglesia' },
    { key: 'funds', done: c.fund_changes > 0 || c.offerings > 0, to: '/configuracion?tab=fondos' },
    { key: 'members', done: c.members > 0, to: '/miembros' },
    { key: 'first_count', done: c.batches > 0, to: '/conteos' },
    { key: 'team', done: c.users > 1 || c.invitations > 0, to: '/configuracion?tab=equipo' },
    { key: 'opening_balance', done: c.opening_balance !== null, to: '/configuracion?tab=finanzas' },
    { key: 'backup', done: c.backups > 0 || (await listBackups(o)).some((b: any) => b.kind === 'manual'), to: '/configuracion?tab=datos' },
    { key: 'email', done: f.email, to: '/ayuda', optional: true },
  ];
  res.json({ steps, done: steps.filter((s) => s.done).length, total: steps.length });
});

export default r;
