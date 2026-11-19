import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import { PoolClient } from 'pg';
import { env } from '../env';
import { one, q, tx } from '../db';
import { HttpError } from '../http';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Everything that belongs to a church, in the order it can be inserted (parents before children).
 * Logs (activity, e-mails, texts) and personal links are not part of a backup.
 */
export const TABLES = [
  'households', 'members', 'funds', 'expense_categories', 'budgets', 'deposits',
  'batches', 'offerings', 'goals', 'pledges', 'expenses', 'noncash_gifts', 'tax_statements',
] as const;

/** Which columns point at which table, so ids can be renumbered on restore. */
const FKS: Record<string, Record<string, string>> = {
  members: { household_id: 'households' },
  budgets: { category_id: 'expense_categories' },
  batches: { deposit_id: 'deposits' },
  offerings: { member_id: 'members', fund_id: 'funds', batch_id: 'batches' },
  goals: { fund_id: 'funds' },
  pledges: { goal_id: 'goals', member_id: 'members' },
  expenses: { category_id: 'expense_categories', fund_id: 'funds' },
  noncash_gifts: { member_id: 'members' },
  tax_statements: { member_id: 'members' },
};

const ORG_FIELDS = [
  'name', 'legal_name', 'tax_id', 'address', 'city', 'state', 'postal_code', 'country', 'phone', 'email', 'pastor_name', 'treasurer_name',
  'currency', 'statement_note', 'timezone', 'fiscal_year_start', 'idle_minutes', 'opening_balance', 'opening_balance_date',
  'board_emails', 'board_report_enabled', 'board_report_day', 'board_report_lang', 'ai_enabled',
];

export async function buildBackup(orgId: string) {
  const out: Record<string, unknown> = { app: 'Sanctuary', version: 3, exported_at: new Date().toISOString() };
  out.organizations = await q('SELECT * FROM organizations WHERE id = $1', [orgId]);
  for (const t of TABLES) out[t] = await q(`SELECT * FROM ${t} WHERE org_id = $1`, [orgId]);
  return out;
}

// ─── Files on disk ───────────────────────────────────────────────────────────

const backupDir = (orgId: string) => path.join(env.backupDir, orgId);
const NAME = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(auto|manual|before-restore)\.json\.gz$/;
const KEEP: Record<string, number> = { auto: 14, manual: 20, 'before-restore': 5 };

export async function saveBackupFile(orgId: string, kind: 'auto' | 'manual' | 'before-restore') {
  const dir = backupDir(orgId);
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const name = `${stamp}-${kind}.json.gz`;
  await fs.writeFile(path.join(dir, name), await gzip(JSON.stringify(await buildBackup(orgId))));
  // Keep only the most recent copies of each kind.
  const same = (await listBackups(orgId)).filter((b) => b.kind === kind);
  for (const old of same.slice(KEEP[kind])) await fs.rm(path.join(dir, old.name), { force: true });
  return name;
}

export async function listBackups(orgId: string) {
  const dir = backupDir(orgId);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of await fs.readdir(dir)) {
    const m = name.match(NAME);
    if (!m) continue;
    const stat = await fs.stat(path.join(dir, name));
    out.push({ name, kind: m[2], created_at: m[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3Z'), size: stat.size });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function readBackupFile(orgId: string, name: string) {
  if (!NAME.test(name)) throw new HttpError(404, 'not_found');
  const file = path.join(backupDir(orgId), name);
  if (!existsSync(file)) throw new HttpError(404, 'not_found');
  return parseBackup(await fs.readFile(file));
}

/** Accepts a backup as plain JSON or gzip-compressed JSON. */
export async function parseBackup(buf: Buffer): Promise<Record<string, any>> {
  let data: any;
  try {
    const raw = buf[0] === 0x1f && buf[1] === 0x8b ? await gunzip(buf) : buf;
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'backup_invalid');
  }
  if (data?.app !== 'Sanctuary' || !Array.isArray(data.members) || !Array.isArray(data.offerings) || !Array.isArray(data.funds)) {
    throw new HttpError(400, 'backup_invalid');
  }
  return data;
}

/** Once a day per church (checked every hour): an automatic copy. */
export async function autoBackups() {
  const orgs = await q('SELECT id FROM organizations');
  let made = 0;
  for (const o of orgs) {
    const last = (await listBackups(o.id)).find((b) => b.kind === 'auto');
    if (last && Date.now() - new Date(last.created_at).getTime() < 23.5 * 3600e3) continue;
    await saveBackupFile(o.id, 'auto');
    made++;
  }
  return made;
}

// ─── Restore ─────────────────────────────────────────────────────────────────

async function columnsOf(c: PoolClient, table: string) {
  const rows = await q("SELECT column_name FROM information_schema.columns WHERE table_schema = 'sanctuary' AND table_name = $1", [table], c);
  return new Set(rows.map((r) => r.column_name as string));
}

/**
 * Replaces the church's data with the backup. A safety copy of the current data is saved first,
 * and everything happens in one transaction: either the whole backup is restored, or nothing changes.
 * Every record gets a new id, so a backup can be restored on another server or more than once.
 */
export async function restoreBackup(orgId: string, data: Record<string, any>) {
  const safety = await saveBackupFile(orgId, 'before-restore');
  const counts: Record<string, number> = {};
  await tx(async (c) => {
    for (const t of [...TABLES].reverse()) await q(`DELETE FROM ${t} WHERE org_id = $1`, [orgId], c);
    await q('DELETE FROM member_links WHERE org_id = $1', [orgId], c);
    await q('DELETE FROM ai_cache WHERE org_id = $1', [orgId], c);

    const org = Array.isArray(data.organizations) ? data.organizations[0] : null;
    if (org) {
      const orgCols = await columnsOf(c, 'organizations');
      const fields = ORG_FIELDS.filter((f) => f in org && orgCols.has(f));
      if (fields.length) {
        await q(`UPDATE organizations SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`, [orgId, ...fields.map((f) => org[f])], c);
      }
    }

    const newIds: Record<string, Map<string, string>> = {};
    for (const t of TABLES) {
      const rows: any[] = Array.isArray(data[t]) ? data[t] : [];
      const cols = await columnsOf(c, t);
      const map = (newIds[t] = new Map());
      counts[t] = 0;
      for (const row of rows) {
        const rec: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) if (cols.has(k)) rec[k] = v;
        rec.org_id = orgId;
        if (cols.has('id')) {
          const id = crypto.randomUUID();
          if (row.id) map.set(row.id, id);
          rec.id = id;
        }
        for (const [col, target] of Object.entries(FKS[t] || {})) {
          if (rec[col] == null) continue;
          const mapped = newIds[target]?.get(rec[col]);
          rec[col] = mapped ?? null;
        }
        // Rows that would now point at nothing required are skipped (e.g. a gift whose member is missing).
        if ((t === 'offerings' && !rec.fund_id) || (t === 'pledges' && (!rec.goal_id || !rec.member_id)) ||
            (t === 'budgets' && !rec.category_id) || (t === 'expenses' && !rec.category_id) ||
            ((t === 'noncash_gifts' || t === 'tax_statements') && !rec.member_id)) continue;
        if ('created_by' in rec) rec.created_by = null;
        for (const f of ['avatar_file', 'receipt_file']) {
          if (rec[f] && !existsSync(path.join(env.uploadDir, orgId, String(rec[f])))) rec[f] = null;
        }
        if (typeof rec.denominations === 'object' && rec.denominations !== null) rec.denominations = JSON.stringify(rec.denominations);
        const keys = Object.keys(rec);
        await q(`INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})`, keys.map((k) => rec[k]), c);
        counts[t]++;
      }
    }
  });
  return { counts, safety };
}

export async function orgName(orgId: string) {
  return (await one('SELECT name FROM organizations WHERE id = $1', [orgId]))?.name as string;
}
