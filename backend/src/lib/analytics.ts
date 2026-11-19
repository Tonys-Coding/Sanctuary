import { one, q } from '../db';
import { todayIn } from '../http';
import { fiscalLabel, fiscalMonths, fiscalRange, fiscalYearOf, minusYear } from './period';
import { fullName } from '../routes/members';
import { GOALS } from '../routes/goals';

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

export interface Insight {
  type: string;
  tone: 'good' | 'bad' | 'neutral';
  data: Record<string, unknown>;
}

export async function dashboard(orgId: string, yearParam?: number) {
  const org = await one('SELECT timezone, fiscal_year_start FROM organizations WHERE id = $1', [orgId]);
  const fys: number = org.fiscal_year_start || 1;
  const now = todayIn(org.timezone || 'UTC');
  const currentYear = fiscalYearOf(now, fys);
  const year = yearParam && yearParam >= 1990 && yearParam <= currentYear ? yearParam : currentYear;
  const isCurrent = year === currentYear;
  const { start, end } = fiscalRange(year, fys);
  const prev = fiscalRange(year - 1, fys);
  // "ref" is the last day we have data for in the selected year: today, or the year's last day.
  const ref = isCurrent ? now : end;
  const refMonth = Number(ref.slice(5, 7));
  const months = fiscalMonths(year, fys);
  const refIndex = months.findIndex((m) => m.year === Number(ref.slice(0, 4)) && m.month === refMonth);
  const range = [orgId, start, end];
  const IN = 'date >= $2::date AND date <= $3::date';
  const fyExpr = `(extract(year FROM date)::int - CASE WHEN extract(month FROM date) < ${fys} THEN 1 ELSE 0 END)`;

  const [monthRows, ytdPrev, yearAgg, prevGivers, byFund, byMethod, topMembers, yearly, recent, goals, windows, newGivers, lapsed, loose] = await Promise.all([
    q(`SELECT extract(year FROM date)::int AS y, extract(month FROM date)::int AS m, sum(amount) AS total, count(*) AS count,
              count(DISTINCT member_id) AS givers
       FROM offerings WHERE org_id = $1 AND date >= $2::date AND date <= $3::date GROUP BY 1, 2`, [orgId, prev.start, end]),
    one(`SELECT COALESCE(sum(amount), 0) AS total FROM offerings WHERE org_id = $1 AND date >= $2::date AND date <= $3::date`, [orgId, prev.start, minusYear(ref)]),
    one(`SELECT COALESCE(sum(amount), 0) AS total, count(*) AS count, COALESCE(avg(amount), 0) AS average, count(DISTINCT member_id) AS givers
       FROM offerings WHERE org_id = $1 AND ${IN}`, range),
    one(`SELECT count(DISTINCT member_id) AS givers FROM offerings WHERE org_id = $1 AND ${IN}`, [orgId, prev.start, prev.end]),
    q(`SELECT f.id, f.name, f.color_slot, sum(o.amount) AS total FROM offerings o JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 AND o.date >= $2::date AND o.date <= $3::date GROUP BY f.id ORDER BY total DESC`, range),
    q(`SELECT method, sum(amount) AS total, count(*) AS count FROM offerings WHERE org_id = $1 AND ${IN} GROUP BY method ORDER BY total DESC`, range),
    q(`SELECT m.id, ${fullName} AS name, m.avatar_file, sum(o.amount) AS total, count(*) AS count
       FROM offerings o JOIN members m ON m.id = o.member_id
       WHERE o.org_id = $1 AND o.date >= $2::date AND o.date <= $3::date GROUP BY m.id ORDER BY total DESC LIMIT 8`, range),
    q(`SELECT ${fyExpr} AS year, sum(amount) AS total, count(*) AS count FROM offerings WHERE org_id = $1 GROUP BY 1 ORDER BY 1`, [orgId]),
    q(`SELECT o.id, o.amount, o.date, o.method, CASE WHEN m.id IS NULL THEN NULL ELSE ${fullName} END AS member_name, m.avatar_file AS member_avatar,
              f.name AS fund_name, f.color_slot AS fund_color
       FROM offerings o LEFT JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 ORDER BY o.date DESC, o.created_at DESC LIMIT 8`, [orgId]),
    q(`${GOALS} AND g.end_date >= (SELECT org_today($1)) - 30 ORDER BY g.end_date LIMIT 4`, [orgId]),
    one(`SELECT COALESCE(sum(amount) FILTER (WHERE date > $2::date - 30), 0) AS last30,
                COALESCE(sum(amount) FILTER (WHERE date <= $2::date - 30), 0) AS prev30
         FROM offerings WHERE org_id = $1 AND date > $2::date - 60 AND date <= $2::date`, [orgId, ref]),
    one(`SELECT count(*) AS count FROM (SELECT member_id FROM offerings WHERE org_id = $1 AND member_id IS NOT NULL
           GROUP BY member_id HAVING min(date) > $2::date - 60 AND min(date) <= $2::date) t`, [orgId, ref]),
    q(`SELECT m.id, ${fullName} AS name, max(o.date) AS last_date
       FROM offerings o JOIN members m ON m.id = o.member_id AND m.archived_at IS NULL AND m.status = 'active'
       WHERE o.org_id = $1 AND o.date <= $2::date AND o.date > $2::date - 240
       GROUP BY m.id HAVING count(*) >= 3 AND max(o.date) <= $2::date - 60 ORDER BY max(o.date) DESC LIMIT 12`, [orgId, ref]),
    one(`SELECT COALESCE(sum(amount), 0) AS total FROM offerings WHERE org_id = $1 AND ${IN} AND member_id IS NULL`, range),
  ]);

  const [weekly, fundMonthly, giverRows, finance] = await Promise.all([
    // Last 12 weeks up to the reference day; each week is labelled by its Sunday.
    q(`SELECT to_char(g.w + interval '6 days', 'YYYY-MM-DD') AS sunday, COALESCE(sum(o.amount), 0) AS total, count(o.id) AS count
       FROM generate_series(date_trunc('week', $2::date) - interval '11 weeks', date_trunc('week', $2::date), interval '1 week') AS g(w)
       LEFT JOIN offerings o ON o.org_id = $1 AND o.date >= g.w AND o.date < g.w + interval '7 days'
       GROUP BY g.w ORDER BY g.w`, [orgId, ref]),
    q(`SELECT extract(year FROM o.date)::int AS y, extract(month FROM o.date)::int AS m, o.fund_id, sum(o.amount) AS total
       FROM offerings o WHERE o.org_id = $1 AND o.date >= $2::date AND o.date <= $3::date GROUP BY 1, 2, 3`, range),
    // How each giver of the year behaves: months with a gift, and whether this year is their first.
    q(`SELECT member_id, count(DISTINCT to_char(date, 'YYYY-MM')) AS months,
              (SELECT min(date) FROM offerings x WHERE x.org_id = $1 AND x.member_id = o.member_id) AS first_date
       FROM offerings o WHERE o.org_id = $1 AND member_id IS NOT NULL AND ${IN}
       GROUP BY member_id`, range),
    financeSummary(orgId, ref),
  ]);
  const celebrations = upcomingCelebrations(
    await q(`SELECT m.id, ${fullName} AS name, m.first_name, m.avatar_file, m.phone, m.email, m.sms_opt_in, m.birth_date, m.joined_date
             FROM members m WHERE m.org_id = $1 AND m.archived_at IS NULL AND m.status <> 'inactive'
               AND (m.birth_date IS NOT NULL OR m.joined_date IS NOT NULL)`, [orgId]),
    now,
  );
  const elapsed = refIndex >= 0 ? refIndex + 1 : 12;
  const regularMonths = Math.max(1, Math.round(elapsed * 0.75));
  const segments = { regular: 0, occasional: 0, new: 0 };
  for (const g of giverRows) {
    const first = String(g.first_date).slice(0, 10);
    if (first >= start && first <= end) segments.new++;
    else if (g.months >= regularMonths) segments.regular++;
    else segments.occasional++;
  }

  const cell = (y: number, m: number) => monthRows.find((r) => r.y === y && r.m === m);
  const monthly = months.map(({ year: y, month: m }) => ({
    month: m,
    year: y,
    total: cell(y, m)?.total ?? 0,
    previous: cell(y - 1, m)?.total ?? 0,
    count: cell(y, m)?.count ?? 0,
    givers: cell(y, m)?.givers ?? 0,
    byFund: Object.fromEntries(fundMonthly.filter((f) => f.y === y && f.m === m).map((f) => [f.fund_id, f.total])),
  }));
  const thisMonth = monthly[elapsed - 1].total;
  const prevMonth = elapsed > 1 ? monthly[elapsed - 2].total : (cell(months[0].year - (months[0].month === 1 ? 1 : 0), months[0].month === 1 ? 12 : months[0].month - 1)?.total ?? 0);
  const total = yearAgg.total as number;
  const label = (y: number) => fiscalLabel(y, fys);

  const insights: Insight[] = [];
  const ytd = pct(total, ytdPrev.total);
  if (ytd !== null) insights.push({ type: 'ytd', tone: ytd >= 0 ? 'good' : 'bad', data: { pct: ytd, previous: ytdPrev.total, year: label(year - 1) } });
  const d30 = pct(windows.last30, windows.prev30);
  if (d30 !== null && isCurrent) insights.push({ type: 'last30', tone: d30 >= 0 ? 'good' : 'bad', data: { pct: d30, amount: windows.last30, previous: windows.prev30 } });
  const best = monthly.reduce((a, b) => (b.total > a.total ? b : a), monthly[0]);
  if (best.total > 0) insights.push({ type: 'best_month', tone: 'neutral', data: { month: best.month, amount: best.total } });
  if (byFund[0] && total > 0) insights.push({ type: 'top_fund', tone: 'neutral', data: { name: byFund[0].name, share: Math.round((byFund[0].total / total) * 100) } });
  if (newGivers.count > 0) insights.push({ type: 'new_givers', tone: 'good', data: { count: newGivers.count } });
  if (lapsed.length > 0) insights.push({ type: 'lapsed', tone: 'bad', data: { count: lapsed.length, names: lapsed.slice(0, 3).map((l) => l.name), members: lapsed } });
  if (total > 0 && loose.total / total >= 0.25) insights.push({ type: 'loose_share', tone: 'neutral', data: { share: Math.round((loose.total / total) * 100) } });

  return {
    year, label: label(year), prevLabel: label(year - 1), fiscalStart: fys, start, end, isCurrent, ref, refMonth, elapsed,
    years: Array.from(new Set([currentYear, ...yearly.map((y) => y.year)])).filter((y) => y <= currentYear).sort((a, b) => b - a).map((y) => ({ year: y, label: label(y) })),
    kpis: {
      total, totalPrevSamePeriod: ytdPrev.total as number, ytdChange: ytd,
      thisMonth, prevMonth, monthChange: pct(thisMonth, prevMonth),
      count: yearAgg.count as number, average: yearAgg.average as number,
      givers: yearAgg.givers as number, giversPrev: prevGivers.givers as number,
      loose: loose.total as number,
    },
    monthly, byFund, byMethod, topMembers, yearly: yearly.map((y) => ({ ...y, label: label(y.year) })), recent, goals, insights,
    weekly, segments: { ...segments, regularMonths }, celebrations, finance,
  };
}

/**
 * Money in and out for the month of `ref`, and the running balance (opening balance + all income
 * − all expenses since the opening date). Expenses are part of v3; returns zeros until there are any.
 */
export async function financeSummary(orgId: string, ref: string) {
  const monthStart = ref.slice(0, 8) + '01';
  const row = await one(
    `SELECT o.opening_balance, o.opening_balance_date,
       (SELECT COALESCE(sum(amount), 0) FROM offerings WHERE org_id = $1 AND date >= $2::date AND date <= $3::date) AS income_month,
       (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE org_id = $1 AND date >= $2::date AND date <= $3::date) AS expenses_month,
       (SELECT COALESCE(sum(amount), 0) FROM offerings WHERE org_id = $1 AND date >= COALESCE(o.opening_balance_date, '1900-01-01') AND date <= $3::date) AS income_all,
       (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE org_id = $1 AND date >= COALESCE(o.opening_balance_date, '1900-01-01') AND date <= $3::date) AS expenses_all,
       (SELECT count(*) FROM expenses WHERE org_id = $1) AS expense_count
     FROM organizations o WHERE o.id = $1`,
    [orgId, monthStart, ref],
  );
  const balance = Math.round(((row.opening_balance || 0) + row.income_all - row.expenses_all) * 100) / 100;
  return {
    incomeMonth: row.income_month as number, expensesMonth: row.expenses_month as number,
    balance, openingBalance: row.opening_balance as number | null, openingDate: row.opening_balance_date as string | null,
    tracksExpenses: row.expense_count > 0 || row.opening_balance != null,
  };
}

/**
 * Birthdays and membership anniversaries in the next 30 days (today included), soonest first.
 * Feb 29 dates fall on Feb 28 in years without one.
 */
export function upcomingCelebrations(rows: any[], todayIso: string, days = 30) {
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  const next = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number);
    for (const y of [ty, ty + 1]) {
      const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
      const day = m === 2 && d === 29 && !leap ? 28 : d;
      const t = Date.UTC(y, m - 1, day);
      if (t >= today) return { t, y };
    }
    return null;
  };
  const out: any[] = [];
  for (const r of rows) {
    for (const kind of ['birthday', 'anniversary'] as const) {
      const iso = kind === 'birthday' ? r.birth_date : r.joined_date;
      if (!iso) continue;
      const n = next(iso);
      if (!n) continue;
      const inDays = Math.round((n.t - today) / 864e5);
      const years = n.y - Number(iso.slice(0, 4));
      if (inDays > days || (kind === 'anniversary' && years < 1)) continue;
      out.push({
        member_id: r.id, name: r.name, first_name: r.first_name, avatar_file: r.avatar_file, kind,
        date: new Date(n.t).toISOString().slice(0, 10), in_days: inDays, years,
        can_text: !!(r.sms_opt_in && r.phone), phone: r.phone, email: r.email,
      });
    }
  }
  return out.sort((a, b) => a.in_days - b.in_days || a.name.localeCompare(b.name)).slice(0, 40);
}
