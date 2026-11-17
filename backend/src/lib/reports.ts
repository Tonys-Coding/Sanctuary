import { z } from 'zod';
import { one, q } from '../db';
import { HttpError } from '../http';
import { date, method, optUuid } from './z';
import { fullName } from '../routes/members';

export type Lang = 'es' | 'en';
export type ColKind = 'text' | 'money' | 'number' | 'date' | 'percent';

export interface Column { key: string; label: string; kind: ColKind }
export interface Section { title?: string; columns: Column[]; rows: Record<string, unknown>[]; total?: Record<string, unknown> }
export interface Report {
  type: string;
  title: string;
  subtitle: string;
  from: string;
  to: string;
  highlights: { label: string; value: number; kind: ColKind }[];
  sections: Section[];
}

export const reportSpec = z.object({
  type: z.enum(['summary', 'by_member', 'by_fund', 'by_month', 'by_method', 'transactions', 'member', 'batches']),
  from: date,
  to: date,
  fundId: optUuid,
  memberId: optUuid,
  method: z.preprocess((v) => (v === '' ? null : v), method.nullish()),
});
export type ReportSpec = z.infer<typeof reportSpec>;

const T = {
  es: {
    titles: { summary: 'Resumen general', by_member: 'Ofrendas por miembro', by_fund: 'Ofrendas por fondo', by_month: 'Ofrendas por mes', by_method: 'Ofrendas por método de pago', transactions: 'Detalle de ofrendas', member: 'Estado de ofrendas', batches: 'Conteos de cultos' },
    total: 'Total', count: 'Registros', average: 'Promedio', givers: 'Dadores', member: 'Miembro', fund: 'Fondo', month: 'Mes', method: 'Método', date: 'Fecha',
    amount: 'Monto', share: '% del total', last: 'Última ofrenda', envelope: 'Sobre', loose: 'Ofrenda suelta (sin nombre)', notes: 'Notas', check: 'Cheque',
    service: 'Culto', attendance: 'Asistencia', countedBy: 'Contado por', status: 'Estado', open: 'Abierto', closed: 'Cerrado',
    byFund: 'Por fondo', byMonth: 'Por mes', byMethod: 'Por método de pago', topMembers: 'Miembros que más aportaron',
    period: (a: string, b: string) => `Del ${a} al ${b}`,
    methods: { cash: 'Efectivo', check: 'Cheque', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' },
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  },
  en: {
    titles: { summary: 'Giving summary', by_member: 'Giving by member', by_fund: 'Giving by fund', by_month: 'Giving by month', by_method: 'Giving by payment method', transactions: 'Offering detail', member: 'Giving statement', batches: 'Service counts' },
    total: 'Total', count: 'Records', average: 'Average', givers: 'Givers', member: 'Member', fund: 'Fund', month: 'Month', method: 'Method', date: 'Date',
    amount: 'Amount', share: '% of total', last: 'Last gift', envelope: 'Envelope', loose: 'Loose offering (no name)', notes: 'Notes', check: 'Check',
    service: 'Service', attendance: 'Attendance', countedBy: 'Counted by', status: 'Status', open: 'Open', closed: 'Closed',
    byFund: 'By fund', byMonth: 'By month', byMethod: 'By payment method', topMembers: 'Top contributing members',
    period: (a: string, b: string) => `${a} to ${b}`,
    methods: { cash: 'Cash', check: 'Check', card: 'Card', transfer: 'Transfer', other: 'Other' },
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  },
};
export const serverStrings = T;

export function fmtDate(iso: string, lang: Lang) {
  const [y, m, d] = iso.split('-').map(Number);
  return lang === 'es' ? `${d} de ${T.es.months[m - 1]} de ${y}` : `${T.en.months[m - 1]} ${d}, ${y}`;
}
export function fmtMoney(n: number, currency: string, lang: Lang) {
  try {
    return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency }).format(n);
  } catch {
    return n.toFixed(2);
  }
}
export function fmtCell(v: unknown, kind: ColKind, currency: string, lang: Lang): string {
  if (v == null || v === '') return '';
  if (kind === 'money') return fmtMoney(Number(v), currency, lang);
  if (kind === 'percent') return `${v}%`;
  if (kind === 'date') return fmtDate(String(v), lang);
  if (kind === 'number') return Number(v).toLocaleString(lang === 'es' ? 'es-US' : 'en-US');
  return String(v);
}

const sum = (rows: any[], k: string) => Math.round(rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) * 100) / 100;
const withShare = (rows: any[]) => {
  const t = sum(rows, 'total');
  return rows.map((r) => ({ ...r, share: t > 0 ? Math.round((r.total / t) * 1000) / 10 : 0 }));
};

export async function buildReport(orgId: string, lang: Lang, spec: ReportSpec): Promise<Report> {
  if (spec.to < spec.from) throw new HttpError(400, 'invalid_range');
  const t = T[lang];
  const where = ['o.org_id = $1', 'o.date >= $2', 'o.date <= $3'];
  const params: unknown[] = [orgId, spec.from, spec.to];
  const filters: string[] = [];
  if (spec.fundId) {
    const f = await one('SELECT name FROM funds WHERE id = $1 AND org_id = $2', [spec.fundId, orgId]);
    if (!f) throw new HttpError(400, 'invalid_input');
    params.push(spec.fundId); where.push(`o.fund_id = $${params.length}`); filters.push(`${t.fund}: ${f.name}`);
  }
  let memberName = '';
  if (spec.memberId) {
    const m = await one(`SELECT ${fullName} AS name FROM members m WHERE id = $1 AND org_id = $2`, [spec.memberId, orgId]);
    if (!m) throw new HttpError(400, 'invalid_input');
    memberName = m.name;
    params.push(spec.memberId); where.push(`o.member_id = $${params.length}`); filters.push(`${t.member}: ${m.name}`);
  } else if (spec.type === 'member') throw new HttpError(400, 'member_required');
  if (spec.method) { params.push(spec.method); where.push(`o.method = $${params.length}`); filters.push(`${t.method}: ${t.methods[spec.method]}`); }
  const W = where.join(' AND ');
  const FROM = 'FROM offerings o LEFT JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id';

  const agg = await one(`SELECT COALESCE(sum(o.amount),0) AS total, count(*) AS count, COALESCE(avg(o.amount),0) AS average, count(DISTINCT o.member_id) AS givers ${FROM} WHERE ${W}`, params);
  const byFund = () => q(`SELECT f.name AS fund, sum(o.amount) AS total, count(*) AS count ${FROM} WHERE ${W} GROUP BY f.id ORDER BY total DESC`, params);
  const byMonth = async () =>
    (await q(`SELECT to_char(date_trunc('month', o.date), 'YYYY-MM') AS ym, sum(o.amount) AS total, count(*) AS count, count(DISTINCT o.member_id) AS givers ${FROM} WHERE ${W} GROUP BY 1 ORDER BY 1`, params))
      .map((r) => ({ ...r, month: `${t.months[Number(r.ym.slice(5)) - 1]} ${r.ym.slice(0, 4)}` }));
  const byMethod = async () =>
    (await q(`SELECT o.method AS m, sum(o.amount) AS total, count(*) AS count ${FROM} WHERE ${W} GROUP BY 1 ORDER BY total DESC`, params))
      .map((r) => ({ ...r, method: t.methods[r.m as keyof typeof t.methods] }));
  const byMember = (limit?: number) =>
    q(`SELECT COALESCE(${fullName}, $${params.length + 1}) AS member, m.envelope_number AS envelope, sum(o.amount) AS total, count(*) AS count, avg(o.amount) AS average, max(o.date) AS last
       ${FROM} WHERE ${W} GROUP BY m.id ORDER BY total DESC ${limit ? `LIMIT ${limit}` : ''}`, [...params, t.loose]);
  const transactions = async () =>
    (await q(`SELECT o.date, COALESCE(${fullName}, $${params.length + 1}) AS member, f.name AS fund, o.method AS m, o.check_number AS check, o.notes, o.amount AS total
       ${FROM} WHERE ${W} ORDER BY o.date, o.created_at`, [...params, t.loose]))
      .map((r) => ({ ...r, method: t.methods[r.m as keyof typeof t.methods] }));

  const c = (key: string, label: string, kind: ColKind = 'text'): Column => ({ key, label, kind });
  const totalRow = (rows: any[], first: string, extra: Record<string, unknown> = {}) => ({ [first]: t.total, total: sum(rows, 'total'), count: sum(rows, 'count'), ...extra });
  const fundCols = [c('fund', t.fund), c('count', t.count, 'number'), c('share', t.share, 'percent'), c('total', t.total, 'money')];
  const monthCols = [c('month', t.month), c('count', t.count, 'number'), c('givers', t.givers, 'number'), c('total', t.total, 'money')];
  const methodCols = [c('method', t.method), c('count', t.count, 'number'), c('share', t.share, 'percent'), c('total', t.total, 'money')];
  const memberCols = [c('member', t.member), c('envelope', t.envelope), c('count', t.count, 'number'), c('average', t.average, 'money'), c('last', t.last, 'date'), c('total', t.total, 'money')];
  const txCols = [c('date', t.date, 'date'), c('member', t.member), c('fund', t.fund), c('method', t.method), c('notes', t.notes), c('total', t.amount, 'money')];

  const sections: Section[] = [];
  switch (spec.type) {
    case 'summary': {
      const [a, b, d, e] = await Promise.all([byFund(), byMonth(), byMethod(), byMember(10)]);
      sections.push({ title: t.byFund, columns: fundCols, rows: withShare(a), total: totalRow(a, 'fund') });
      sections.push({ title: t.byMonth, columns: monthCols, rows: b, total: totalRow(b, 'month') });
      sections.push({ title: t.byMethod, columns: methodCols, rows: withShare(d), total: totalRow(d, 'method') });
      sections.push({ title: t.topMembers, columns: memberCols, rows: e });
      break;
    }
    case 'by_fund': { const a = await byFund(); sections.push({ columns: fundCols, rows: withShare(a), total: totalRow(a, 'fund') }); break; }
    case 'by_month': { const a = await byMonth(); sections.push({ columns: monthCols, rows: a, total: totalRow(a, 'month') }); break; }
    case 'by_method': { const a = await byMethod(); sections.push({ columns: methodCols, rows: withShare(a), total: totalRow(a, 'method') }); break; }
    case 'by_member': { const a = await byMember(); sections.push({ columns: memberCols, rows: a, total: totalRow(a, 'member') }); break; }
    case 'transactions': { const a = await transactions(); sections.push({ columns: txCols, rows: a, total: { date: t.total, total: sum(a, 'total') } }); break; }
    case 'member': {
      const [a, b] = await Promise.all([byFund(), transactions()]);
      sections.push({ title: t.byFund, columns: fundCols, rows: withShare(a), total: totalRow(a, 'fund') });
      sections.push({ title: t.titles.transactions, columns: txCols.filter((x) => x.key !== 'member'), rows: b, total: { date: t.total, total: sum(b, 'total') } });
      break;
    }
    case 'batches': {
      const rows = (await q(
        `SELECT b.date, b.name AS service, b.attendance, b.counted_by, b.status AS s, COALESCE(sum(o.amount), 0) AS total, count(o.id) AS count
         FROM batches b LEFT JOIN offerings o ON o.batch_id = b.id WHERE b.org_id = $1 AND b.date >= $2 AND b.date <= $3 GROUP BY b.id ORDER BY b.date`,
        [orgId, spec.from, spec.to],
      )).map((r) => ({ ...r, status: r.s === 'closed' ? t.closed : t.open }));
      sections.push({
        columns: [c('date', t.date, 'date'), c('service', t.service), c('attendance', t.attendance, 'number'), c('counted_by', t.countedBy), c('status', t.status), c('count', t.count, 'number'), c('total', t.total, 'money')],
        rows, total: { date: t.total, total: sum(rows, 'total'), count: sum(rows, 'count') },
      });
      break;
    }
  }

  const title = spec.type === 'member' ? `${t.titles.member} · ${memberName}` : t.titles[spec.type];
  return {
    type: spec.type, title, from: spec.from, to: spec.to,
    subtitle: [t.period(fmtDate(spec.from, lang), fmtDate(spec.to, lang)), ...(spec.type === 'batches' ? [] : filters)].join(' · '),
    highlights: spec.type === 'batches' ? [] : [
      { label: t.total, value: agg.total, kind: 'money' },
      { label: t.count, value: agg.count, kind: 'number' },
      { label: t.average, value: agg.average, kind: 'money' },
      ...(spec.type === 'member' ? [] : [{ label: t.givers, value: agg.givers, kind: 'number' as ColKind }]),
    ],
    sections,
  };
}

export function reportToRows(report: Report): { header: string[]; rows: unknown[][] } {
  // CSV carries the most detailed section (the last one) with raw numbers.
  const s = report.sections[report.sections.length - 1];
  return { header: s.columns.map((c) => c.label), rows: s.rows.map((r) => s.columns.map((c) => (c.kind === 'money' && r[c.key] != null ? Number(r[c.key]).toFixed(2) : r[c.key]))) };
}
