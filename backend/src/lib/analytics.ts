import { one, q } from '../db';
import { today } from '../http';
import { fullName } from '../routes/members';
import { GOALS } from '../routes/goals';

const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

export interface Insight {
  type: string;
  tone: 'good' | 'bad' | 'neutral';
  data: Record<string, unknown>;
}

export async function dashboard(orgId: string, yearParam?: number) {
  const now = today();
  const currentYear = Number(now.slice(0, 4));
  const year = yearParam && yearParam >= 1990 && yearParam <= currentYear ? yearParam : currentYear;
  const isCurrent = year === currentYear;
  // "ref" is the last day we have data for in the selected year: today, or Dec 31 of a past year.
  const ref = isCurrent ? now : `${year}-12-31`;
  const refMonth = Number(ref.slice(5, 7));
  const p = [orgId, year];

  const [monthRows, ytdPrev, yearAgg, prevGivers, byFund, byMethod, topMembers, yearly, recent, goals, windows, newGivers, lapsed, loose] = await Promise.all([
    q(`SELECT extract(year FROM date)::int AS y, extract(month FROM date)::int AS m, sum(amount) AS total, count(*) AS count,
              count(DISTINCT member_id) AS givers
       FROM offerings WHERE org_id = $1 AND extract(year FROM date) IN ($2::int, $2::int - 1) GROUP BY 1, 2`, p),
    one(`SELECT COALESCE(sum(amount), 0) AS total FROM offerings WHERE org_id = $1 AND date >= make_date($2::int - 1, 1, 1) AND date <= ($3::date - interval '1 year')`, [orgId, year, ref]),
    one(`SELECT COALESCE(sum(amount), 0) AS total, count(*) AS count, COALESCE(avg(amount), 0) AS average, count(DISTINCT member_id) AS givers
       FROM offerings WHERE org_id = $1 AND extract(year FROM date) = $2::int`, p),
    one(`SELECT count(DISTINCT member_id) AS givers FROM offerings WHERE org_id = $1 AND extract(year FROM date) = $2::int - 1`, p),
    q(`SELECT f.id, f.name, f.color_slot, sum(o.amount) AS total FROM offerings o JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int GROUP BY f.id ORDER BY total DESC`, p),
    q(`SELECT method, sum(amount) AS total, count(*) AS count FROM offerings WHERE org_id = $1 AND extract(year FROM date) = $2::int GROUP BY method ORDER BY total DESC`, p),
    q(`SELECT m.id, ${fullName} AS name, m.avatar_file, sum(o.amount) AS total, count(*) AS count
       FROM offerings o JOIN members m ON m.id = o.member_id
       WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int GROUP BY m.id ORDER BY total DESC LIMIT 8`, p),
    q(`SELECT extract(year FROM date)::int AS year, sum(amount) AS total, count(*) AS count FROM offerings WHERE org_id = $1 GROUP BY 1 ORDER BY 1`, [orgId]),
    q(`SELECT o.id, o.amount, o.date, o.method, CASE WHEN m.id IS NULL THEN NULL ELSE ${fullName} END AS member_name, m.avatar_file AS member_avatar,
              f.name AS fund_name, f.color_slot AS fund_color
       FROM offerings o LEFT JOIN members m ON m.id = o.member_id JOIN funds f ON f.id = o.fund_id
       WHERE o.org_id = $1 ORDER BY o.date DESC, o.created_at DESC LIMIT 8`, [orgId]),
    q(`${GOALS} AND g.end_date >= current_date - 30 ORDER BY g.end_date LIMIT 4`, [orgId]),
    one(`SELECT COALESCE(sum(amount) FILTER (WHERE date > $2::date - 30), 0) AS last30,
                COALESCE(sum(amount) FILTER (WHERE date <= $2::date - 30), 0) AS prev30
         FROM offerings WHERE org_id = $1 AND date > $2::date - 60 AND date <= $2::date`, [orgId, ref]),
    one(`SELECT count(*) AS count FROM (SELECT member_id FROM offerings WHERE org_id = $1 AND member_id IS NOT NULL
           GROUP BY member_id HAVING min(date) > $2::date - 60 AND min(date) <= $2::date) t`, [orgId, ref]),
    q(`SELECT m.id, ${fullName} AS name, max(o.date) AS last_date
       FROM offerings o JOIN members m ON m.id = o.member_id AND m.archived_at IS NULL AND m.status = 'active'
       WHERE o.org_id = $1 AND o.date <= $2::date AND o.date > $2::date - 240
       GROUP BY m.id HAVING count(*) >= 3 AND max(o.date) <= $2::date - 60 ORDER BY max(o.date) DESC LIMIT 12`, [orgId, ref]),
    one(`SELECT COALESCE(sum(amount), 0) AS total FROM offerings WHERE org_id = $1 AND extract(year FROM date) = $2::int AND member_id IS NULL`, p),
  ]);

  const [weekly, fundMonthly, giverRows] = await Promise.all([
    // Last 12 weeks up to the reference day; each week is labelled by its Sunday.
    q(`SELECT to_char(g.w + interval '6 days', 'YYYY-MM-DD') AS sunday, COALESCE(sum(o.amount), 0) AS total, count(o.id) AS count
       FROM generate_series(date_trunc('week', $2::date) - interval '11 weeks', date_trunc('week', $2::date), interval '1 week') AS g(w)
       LEFT JOIN offerings o ON o.org_id = $1 AND o.date >= g.w AND o.date < g.w + interval '7 days'
       GROUP BY g.w ORDER BY g.w`, [orgId, ref]),
    q(`SELECT extract(month FROM o.date)::int AS m, o.fund_id, sum(o.amount) AS total
       FROM offerings o WHERE o.org_id = $1 AND extract(year FROM o.date) = $2::int GROUP BY 1, 2`, p),
    // How each giver of the year behaves: months with a gift, and whether this year is their first.
    q(`SELECT member_id, count(DISTINCT extract(month FROM date)) AS months,
              (SELECT min(date) FROM offerings x WHERE x.org_id = $1 AND x.member_id = o.member_id) AS first_date
       FROM offerings o WHERE o.org_id = $1 AND member_id IS NOT NULL AND extract(year FROM date) = $2::int
       GROUP BY member_id`, p),
  ]);
  const celebrations = upcomingCelebrations(
    await q(`SELECT m.id, ${fullName} AS name, m.first_name, m.avatar_file, m.phone, m.email, m.sms_opt_in, m.birth_date, m.joined_date
             FROM members m WHERE m.org_id = $1 AND m.archived_at IS NULL AND m.status <> 'inactive'
               AND (m.birth_date IS NOT NULL OR m.joined_date IS NOT NULL)`, [orgId]),
    now,
  );
  const regularMonths = Math.max(1, Math.round(refMonth * 0.75));
  const segments = { regular: 0, occasional: 0, new: 0 };
  for (const g of giverRows) {
    if (Number(String(g.first_date).slice(0, 4)) === year) segments.new++;
    else if (g.months >= regularMonths) segments.regular++;
    else segments.occasional++;
  }

  const cell = (y: number, m: number) => monthRows.find((r) => r.y === y && r.m === m);
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total: cell(year, i + 1)?.total ?? 0,
    previous: cell(year - 1, i + 1)?.total ?? 0,
    count: cell(year, i + 1)?.count ?? 0,
    givers: cell(year, i + 1)?.givers ?? 0,
    byFund: Object.fromEntries(fundMonthly.filter((f) => f.m === i + 1).map((f) => [f.fund_id, f.total])),
  }));
  const thisMonth = monthly[refMonth - 1].total;
  const prevMonth = refMonth === 1 ? cell(year - 1, 12)?.total ?? 0 : monthly[refMonth - 2].total;
  const total = yearAgg.total as number;

  const insights: Insight[] = [];
  const ytd = pct(total, ytdPrev.total);
  if (ytd !== null) insights.push({ type: 'ytd', tone: ytd >= 0 ? 'good' : 'bad', data: { pct: ytd, previous: ytdPrev.total, year: year - 1 } });
  const d30 = pct(windows.last30, windows.prev30);
  if (d30 !== null && isCurrent) insights.push({ type: 'last30', tone: d30 >= 0 ? 'good' : 'bad', data: { pct: d30, amount: windows.last30, previous: windows.prev30 } });
  const best = monthly.reduce((a, b) => (b.total > a.total ? b : a), monthly[0]);
  if (best.total > 0) insights.push({ type: 'best_month', tone: 'neutral', data: { month: best.month, amount: best.total } });
  if (byFund[0] && total > 0) insights.push({ type: 'top_fund', tone: 'neutral', data: { name: byFund[0].name, share: Math.round((byFund[0].total / total) * 100) } });
  if (newGivers.count > 0) insights.push({ type: 'new_givers', tone: 'good', data: { count: newGivers.count } });
  if (lapsed.length > 0) insights.push({ type: 'lapsed', tone: 'bad', data: { count: lapsed.length, names: lapsed.slice(0, 3).map((l) => l.name), members: lapsed } });
  if (total > 0 && loose.total / total >= 0.25) insights.push({ type: 'loose_share', tone: 'neutral', data: { share: Math.round((loose.total / total) * 100) } });

  return {
    year, isCurrent, ref, refMonth,
    years: Array.from(new Set([currentYear, ...yearly.map((y) => y.year)])).sort((a, b) => b - a),
    kpis: {
      total, totalPrevSamePeriod: ytdPrev.total as number, ytdChange: ytd,
      thisMonth, prevMonth, monthChange: pct(thisMonth, prevMonth),
      count: yearAgg.count as number, average: yearAgg.average as number,
      givers: yearAgg.givers as number, giversPrev: prevGivers.givers as number,
      loose: loose.total as number,
    },
    monthly, byFund, byMethod, topMembers, yearly, recent, goals, insights,
    weekly, segments: { ...segments, regularMonths }, celebrations,
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
