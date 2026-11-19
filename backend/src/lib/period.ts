// Fiscal years. A church whose year starts in July has fiscal year 2026 = Jul 1 2026 – Jun 30 2027.
// With the default start (January) a fiscal year is simply the calendar year.

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Which fiscal year a date belongs to, named by the calendar year it starts in. */
export function fiscalYearOf(dateIso: string, startMonth: number): number {
  const y = Number(dateIso.slice(0, 4));
  const m = Number(dateIso.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}

export function fiscalRange(fy: number, startMonth: number) {
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const endYear = startMonth === 1 ? fy : fy + 1;
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return { start: isoOf(fy, startMonth, 1), end: isoOf(endYear, endMonth, lastDay) };
}

/** "2026" for calendar years, "2026–27" otherwise. */
export const fiscalLabel = (fy: number, startMonth: number) => (startMonth === 1 ? String(fy) : `${fy}–${String(fy + 1).slice(2)}`);

/** The twelve months of a fiscal year in order, as calendar { year, month }. */
export function fiscalMonths(fy: number, startMonth: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const k = startMonth - 1 + i;
    return { year: fy + Math.floor(k / 12), month: (k % 12) + 1 };
  });
}

/** The same calendar day one year earlier (Feb 29 → Feb 28). */
export function minusYear(iso: string) {
  const y = Number(iso.slice(0, 4)) - 1;
  const m = Number(iso.slice(5, 7));
  const d = Math.min(Number(iso.slice(8, 10)), new Date(Date.UTC(y, m, 0)).getUTCDate());
  return isoOf(y, m, d);
}
