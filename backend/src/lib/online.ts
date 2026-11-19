import crypto from 'crypto';
import { isoDate } from '../http';

/** Where an online-giving file came from. "bank" is any bank statement export (Zelle usually arrives that way). */
export type OnlineSource = 'tithely' | 'square' | 'paypal' | 'zelle' | 'bank' | 'other';

export interface OnlineRow {
  line: number;
  date: string;
  name: string | null;
  email: string | null;
  amount: number;
  fee: number | null;
  reference: string | null;
  memo: string | null;
  fund: string | null;
  external_ref: string;
}

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();

const ALIASES: Record<string, string[]> = {
  date: ['date', 'fecha', 'transaction date', 'posted date', 'posting date', 'created', 'created at', 'donation date', 'payment date', 'fecha de transaccion'],
  first: ['first name', 'firstname', 'nombre'],
  last: ['last name', 'lastname', 'apellido', 'apellidos'],
  name: ['name', 'customer name', 'donor', 'donor name', 'giver', 'payer', 'from', 'sender', 'nombre completo', 'cliente', 'full name'],
  email: ['email', 'from email address', 'donor email', 'customer email', 'correo', 'correo electronico', 'e mail'],
  amount: ['amount', 'gross', 'gross amount', 'total', 'monto', 'importe', 'gross sales', 'total collected', 'donation amount', 'credit', 'credits', 'deposit', 'deposits', 'credit amount', 'abono', 'deposito', 'amount received'],
  fee: ['fee', 'fees', 'processing fee', 'comision'],
  reference: ['transaction id', 'payment id', 'reference', 'referencia', 'confirmation', 'confirmation number', 'reference number', 'id', 'transaction number', 'numero de referencia'],
  memo: ['memo', 'note', 'notes', 'description', 'descripcion', 'subject', 'item', 'details', 'concepto', 'detalle'],
  fund: ['fund', 'fondo', 'giving type', 'designation', 'campaign', 'category', 'categoria'],
  status: ['status', 'estado'],
};

function mapHeader(header: string[]) {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(ALIASES)) if (idx[field] === undefined && names.includes(n)) idx[field] = i;
  });
  return idx;
}

/** Guesses the service from the column names (and the descriptions, for Zelle in a bank export). */
export function detectSource(header: string[], sample: string[][]): OnlineSource {
  const h = header.map(norm);
  if (h.includes('from email address') || (h.includes('gross') && h.includes('net') && h.includes('type'))) return 'paypal';
  if (h.includes('gross sales') || h.includes('total collected') || (h.includes('payment id') && h.includes('customer name'))) return 'square';
  if (h.includes('giving type') || h.some((x) => x.includes('tithe ly') || x.includes('tithely'))) return 'tithely';
  if (sample.some((r) => r.some((c) => /zelle/i.test(c)))) return 'zelle';
  if (h.some((x) => ['description', 'descripcion', 'details', 'concepto'].includes(x))) return 'bank';
  return 'other';
}

export const methodFor = (s: OnlineSource) => (s === 'zelle' || s === 'bank' ? 'transfer' : s === 'other' ? 'other' : 'card');

export function parseDate(v: string): string | null {
  const s = v.trim().split(/[ T]/)[0];
  if (isoDate.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    // Online services are US-based: month first, unless that cannot be.
    let [mo, d] = [Number(m[1]), Number(m[2])];
    if (mo > 12 && d <= 12) [mo, d] = [d, mo];
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

export function parseMoney(v: string): number | null {
  if (!v) return null;
  const negative = /^\s*\(.*\)\s*$/.test(v) || /^\s*-/.test(v.replace(/[$€\s]/g, ''));
  let s = v.replace(/[^\d.,]/g, '');
  if (/,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Math.round(parseFloat(s) * 100) / 100;
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** "Zelle payment from JUAN PEREZ on 03/02 Conf# abc123" → { name: 'Juan Perez', reference: 'abc123' } */
export function fromBankDescription(desc: string) {
  const m = desc.match(/zelle\s+(?:payment\s+|transfer\s+|deposit\s+)?(?:from|de)\s+([a-zà-ÿ][a-zà-ÿ .,'&-]{1,60}?)(?=\s+(?:on|el|conf|ref|id|trans|for|para|memo)\b|\s+\d|[;:]|$)/i);
  const ref = desc.match(/(?:conf(?:irmation)?|ref(?:erence)?|id|trans(?:action)?)\s*(?:#|no\.?|number|:)?\s*([a-z0-9]{6,})/i);
  const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase()).trim();
  return { name: m ? title(m[1].replace(/[.,]+$/, '')) : null, reference: ref ? ref[1] : null };
}

const OK_STATUS = new Set(['', 'completed', 'complete', 'succeeded', 'success', 'successful', 'paid', 'settled', 'deposited', 'completado', 'pagado', 'cleared', 'posted']);

/**
 * Reads an exported file from an online-giving service or a bank into gifts. Withdrawals, refunds,
 * fees and failed payments are skipped. Every gift gets a stable external_ref so re-importing the same
 * file (or an overlapping one) never saves a gift twice.
 */
export function parseOnline(rows: string[][], forced?: OnlineSource) {
  const header = rows[0];
  const h = mapHeader(header);
  const source = forced || detectSource(header, rows.slice(1, 30));
  const missing = ['date', 'amount'].filter((k) => h[k] === undefined);
  const out: OnlineRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    if (missing.length) break;
    const get = (k: string) => (h[k] === undefined ? '' : (rows[i][h[k]] || '').trim());
    const status = norm(get('status'));
    if (!OK_STATUS.has(status)) { skipped.push({ line: i + 1, reason: 'status' }); continue; }
    const date = parseDate(get('date'));
    const amount = parseMoney(get('amount'));
    if (!date) { skipped.push({ line: i + 1, reason: 'date' }); continue; }
    if (amount === null || amount <= 0) { skipped.push({ line: i + 1, reason: 'not_income' }); continue; }
    const memo = get('memo') || null;
    let name = get('name') || [get('first'), get('last')].filter(Boolean).join(' ') || null;
    let reference = get('reference') || null;
    if (memo && (source === 'zelle' || source === 'bank')) {
      const d = fromBankDescription(memo);
      name = name || d.name;
      reference = reference || d.reference;
      if (source === 'zelle' && !/zelle/i.test(memo)) { skipped.push({ line: i + 1, reason: 'not_zelle' }); continue; }
    }
    const fee = parseMoney(get('fee'));
    let key = reference ? `online:${source}:${reference}` : `online:${source}:${crypto.createHash('sha1').update([date, amount.toFixed(2), norm(name || ''), norm(memo || '')].join('|')).digest('hex').slice(0, 20)}`;
    // Two identical rows without a reference (same person, same day, same amount) are two gifts.
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) key += `#${n}`;
    out.push({ line: i + 1, date, name, email: /^\S+@\S+\.\S+$/.test(get('email')) ? get('email').toLowerCase() : null, amount, fee: fee !== null ? Math.abs(fee) : null, reference, memo, fund: get('fund') || null, external_ref: key.slice(0, 200) });
  }
  return { source, missing, rows: out, skipped };
}

/** Finds the member a gift belongs to: by e-mail first, then by name (in either order). */
export function matchMember(row: { name: string | null; email: string | null }, members: { id: string; name: string; email: string | null; first_name: string; last_name: string }[]) {
  if (row.email) {
    const m = members.find((x) => x.email && x.email.toLowerCase() === row.email);
    if (m) return { member: m, by: 'email' as const };
  }
  if (!row.name) return null;
  const n = norm(row.name);
  const tokens = n.split(' ').filter(Boolean);
  let m = members.find((x) => norm(x.name) === n || norm(`${x.last_name} ${x.first_name}`) === n);
  if (m) return { member: m, by: 'name' as const };
  // "J. Perez" / "Juan A Perez": same last name and same first initial, if only one member fits.
  const candidates = members.filter((x) => {
    const first = norm(x.first_name).split(' ')[0];
    const last = norm(x.last_name).split(' ')[0];
    return !!first && !!last && tokens.includes(last) && tokens.some((t) => t[0] === first[0] && (t === first || t.length <= 2));
  });
  if (candidates.length === 1) return { member: candidates[0], by: 'similar' as const };
  return null;
}
