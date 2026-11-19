import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { env } from '../env';
import { Column, Lang, Report, fmtCell, fmtDate, fmtMoney } from './reports';
import { todayIn } from '../http';

type Doc = PDFKit.PDFDocument;
const INK = '#221b14';
const MUTED = '#6f6457';
const LINE = '#d9cfc0';
const ACCENT = '#b4530a';
const M = 54; // page margin

const DEFAULT_LOGO = [path.join(__dirname, '..', '..', 'assets', 'logo.png'), path.join(__dirname, '..', 'assets', 'logo.png')].find((f) => fs.existsSync(f));

function logoFor(org: any): string | undefined {
  if (org.logo_file) {
    const f = path.join(env.uploadDir, org.id, org.logo_file);
    if (fs.existsSync(f)) return f;
  }
  return DEFAULT_LOGO;
}

function finish(doc: Doc, footer: string): Promise<Buffer> {
  // Footers are stamped at the end, once the page count is known.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin would make pdfkit add a blank page, so lift the margin while stamping.
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    const y = doc.page.height - 38;
    const pageLabel = `${i + 1} / ${range.count}`;
    doc.text(footer, M, y, { lineBreak: false });
    doc.text(pageLabel, doc.page.width - M - doc.widthOfString(pageLabel), y, { lineBreak: false });
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function newDoc(title: string): Doc {
  return new PDFDocument({ size: 'LETTER', margins: { top: M, bottom: 60, left: M, right: M }, bufferPages: true, info: { Title: title, Creator: 'Sanctuary' } });
}

function letterhead(doc: Doc, org: any) {
  const logo = logoFor(org);
  const top = doc.y;
  let x = M;
  if (logo) {
    try { doc.image(logo, M, top, { fit: [52, 52] }); x = M + 66; } catch { /* unreadable image: skip */ }
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(org.legal_name || org.name, x, top + 4);
  const lines = [
    [org.address, [org.city, org.state, org.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    [org.phone, org.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED);
  for (const l of lines) doc.text(l, x);
  doc.y = Math.max(doc.y, top + 58) + 8;
  doc.moveTo(M, doc.y).lineTo(doc.page.width - M, doc.y).lineWidth(1).strokeColor(LINE).stroke();
  doc.y += 18;
  doc.x = M;
}

function table(doc: Doc, columns: Column[], rows: Record<string, unknown>[], total: Record<string, unknown> | undefined, currency: string, lang: Lang) {
  const width = doc.page.width - M * 2;
  const numeric = (c: Column) => c.kind === 'money' || c.kind === 'number' || c.kind === 'percent';
  const weight = (c: Column) => (c.kind === 'money' ? 1.25 : c.kind === 'number' || c.kind === 'percent' ? 0.8 : c.kind === 'date' ? 1.5 : c.key === 'notes' ? 1.6 : c.key === 'envelope' || c.key === 'method' ? 0.9 : 2);
  const totalWeight = columns.reduce((a, c) => a + weight(c), 0);
  const widths = columns.map((c) => (weight(c) / totalWeight) * width);
  const pad = 4;

  const drawRow = (cells: string[], opts: { bold?: boolean; header?: boolean; shade?: boolean }) => {
    doc.font(opts.bold || opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.header ? 8.5 : 9.5);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t || ' ', { width: widths[i] - pad * 2 }))) + pad * 2;
    if (doc.y + h > doc.page.height - 64) {
      doc.addPage();
      if (!opts.header) header();
    }
    const y = doc.y;
    if (opts.shade) doc.rect(M, y, width, h).fill('#f6f1e8');
    doc.font(opts.bold || opts.header ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.header ? 8.5 : 9.5).fillColor(opts.header ? MUTED : INK);
    let x = M;
    cells.forEach((t, i) => {
      doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align: numeric(columns[i]) ? 'right' : 'left' });
      x += widths[i];
    });
    doc.y = y + h;
    doc.moveTo(M, doc.y).lineTo(M + width, doc.y).lineWidth(opts.header || opts.bold ? 1 : 0.5).strokeColor(LINE).stroke();
  };
  const header = () => drawRow(columns.map((c) => c.label.toUpperCase()), { header: true });

  header();
  rows.forEach((r, i) => drawRow(columns.map((c) => fmtCell(r[c.key], c.kind, currency, lang)), { shade: i % 2 === 1 }));
  if (total) drawRow(columns.map((c) => fmtCell(total[c.key], c.kind === 'date' ? 'text' : c.kind, currency, lang)), { bold: true });
  doc.x = M;
  doc.y += 18;
}

export async function reportPdf(org: any, report: Report, lang: Lang, note?: string): Promise<Buffer> {
  const doc = newDoc(report.title);
  letterhead(doc, org);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(report.title);
  doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(report.subtitle);
  doc.y += 14;

  if (report.highlights.length) {
    const w = (doc.page.width - M * 2) / report.highlights.length;
    const y = doc.y;
    report.highlights.forEach((h, i) => {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(h.label.toUpperCase(), M + i * w, y, { width: w - 8 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(i === 0 ? ACCENT : INK).text(fmtCell(h.value, h.kind, org.currency, lang), M + i * w, y + 13, { width: w - 8 });
    });
    doc.x = M;
    doc.y = y + 48;
  }
  if (note) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(INK).text(note.replace(/[*_#`]/g, ''), M, doc.y, { width: doc.page.width - M * 2, lineGap: 2 });
    doc.y += 14;
  }
  const empty = lang === 'es' ? 'No hay registros en este periodo.' : 'No records in this period.';
  for (const s of report.sections) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    if (s.title) {
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(s.title, M);
      doc.y += 6;
    }
    if (s.rows.length) table(doc, s.columns, s.rows, s.total, org.currency, lang);
    else { doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(empty, M); doc.y += 14; }
  }
  return finish(doc, `${org.name} · ${lang === 'es' ? 'Generado el' : 'Generated on'} ${fmtDate(todayIn(org.timezone || 'UTC'), lang)}`);
}

// ─── Tax statements ──────────────────────────────────────────────────────────

export interface StatementData {
  member: { full_name: string; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; envelope_number?: string | null };
  year: number;
  /** goods = value of goods or services the giver received; deductible = amount − goods. giver = first name on joint statements. */
  gifts: { date: string; fund: string; method: string; check?: string | null; amount: number; goods?: number; deductible?: number; giver?: string }[];
  total: number;
  given?: number;
  goods?: number;
  noncash?: { date: string; description: string }[];
  quidProQuo?: boolean;
}

/** Used instead of the "no goods or services" sentence when some gifts did include something in return. */
export const GOODS_STATEMENT_NOTE: Record<Lang, string> = {
  es: 'Salvo los bienes o servicios indicados en esta constancia, no se entregaron bienes ni servicios a cambio de estas contribuciones, aparte de beneficios religiosos intangibles. Conserve esta constancia junto con sus documentos de impuestos.',
  en: 'Except for the goods or services listed on this statement, no goods or services were provided in exchange for these contributions, other than intangible religious benefits. Please keep this statement with your tax records.',
};
const QUID_PRO_QUO: Record<Lang, string> = {
  es: 'Aviso: algunas contribuciones de más de $75 incluyeron bienes o servicios (por ejemplo, una cena o un boleto). Según la ley federal, la cantidad deducible se limita a lo que usted aportó por encima del valor estimado de lo que recibió, que se indica para cada contribución.',
  en: 'Notice: some contributions over $75 included goods or services (for example, a dinner or a ticket). Under federal law, the deductible amount is limited to what you gave above the estimated value of what you received, shown for each contribution.',
};
const NONCASH: Record<Lang, string> = {
  es: 'La iglesia recibió estas donaciones en especie. Por ley, la iglesia las describe pero no les asigna un valor; el valor lo determina usted. No se entregaron bienes ni servicios a cambio.',
  en: 'The church received these gifts of property. By law, the church describes them but does not assign a value; you determine the value. No goods or services were provided in exchange.',
};

export const DEFAULT_STATEMENT_NOTE: Record<Lang, string> = {
  es: 'No se entregaron bienes ni servicios a cambio de estas contribuciones, salvo beneficios religiosos intangibles. Conserve esta constancia junto con sus documentos de impuestos.',
  en: 'No goods or services were provided in exchange for these contributions, other than intangible religious benefits. Please keep this statement with your tax records.',
};

function statementPage(doc: Doc, org: any, s: StatementData, lang: Lang) {
  const es = lang === 'es';
  letterhead(doc, org);
  const right = doc.page.width - M;
  const y0 = doc.y;
  doc.font('Helvetica-Bold').fontSize(17).fillColor(INK).text(es ? `Constancia de contribuciones ${s.year}` : `${s.year} Contribution Statement`, M, y0);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${es ? 'Fecha de emisión' : 'Issued'}: ${fmtDate(todayIn(org.timezone || 'UTC'), lang)}`);
  if (org.tax_id) doc.text(`${es ? 'Número de identificación fiscal (EIN)' : 'Tax ID (EIN)'}: ${org.tax_id}`);
  doc.y += 16;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(es ? 'CONTRIBUYENTE' : 'DONOR', M);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(s.member.full_name);
  doc.font('Helvetica').fontSize(10.5).fillColor(INK);
  if (s.member.address) doc.text(s.member.address);
  const cityLine = [s.member.city, s.member.state, s.member.postal_code].filter(Boolean).join(', ');
  if (cityLine) doc.text(cityLine);
  if (s.member.envelope_number) doc.fillColor(MUTED).text(`${es ? 'Sobre n.º' : 'Envelope no.'} ${s.member.envelope_number}`);
  doc.y += 16;

  const withGoods = (s.goods || 0) > 0;
  const joint = s.gifts.some((g) => g.giver);
  const cols: Column[] = [
    { key: 'date', label: es ? 'Fecha' : 'Date', kind: 'date' },
    ...(joint ? [{ key: 'giver', label: es ? 'Dador' : 'Giver', kind: 'text' as const }] : []),
    { key: 'fund', label: es ? 'Fondo' : 'Fund', kind: 'text' },
    { key: 'method', label: es ? 'Método' : 'Method', kind: 'text' },
    { key: 'amount', label: es ? 'Monto' : 'Amount', kind: 'money' },
    ...(withGoods ? [
      { key: 'goods', label: es ? 'Bienes recibidos' : 'Goods received', kind: 'money' as const },
      { key: 'deductible', label: es ? 'Deducible' : 'Deductible', kind: 'money' as const },
    ] : []),
  ];
  const rows = s.gifts.map((g) => ({ ...g, goods: g.goods || null }));
  table(doc, cols, rows as any, withGoods
    ? { date: es ? 'Totales' : 'Totals', amount: s.given, goods: s.goods, deductible: s.total }
    : { date: es ? 'Total deducible' : 'Total deductible', amount: s.total }, org.currency, lang);

  if (s.noncash?.length) {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(es ? 'Donaciones en especie' : 'Gifts of property', M);
    doc.y += 6;
    table(doc, [{ key: 'date', label: es ? 'Fecha' : 'Date', kind: 'date' }, { key: 'description', label: es ? 'Descripción' : 'Description', kind: 'text' }], s.noncash as any, undefined, org.currency, lang);
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(NONCASH[lang], M, doc.y - 8, { width: right - M, lineGap: 1.5 });
    doc.y += 12;
  }

  if (doc.y > doc.page.height - 190) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(`${es ? 'Total de contribuciones' : 'Total contributions'} ${s.year}: ${fmtMoney(s.total, org.currency, lang)}`, M, doc.y, { width: right - M });
  doc.y += 12;
  if (s.quidProQuo) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(QUID_PRO_QUO[lang], M, doc.y, { width: right - M, lineGap: 2 });
    doc.y += 8;
  }
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(withGoods ? GOODS_STATEMENT_NOTE[lang] : org.statement_note || DEFAULT_STATEMENT_NOTE[lang], M, doc.y, { width: right - M, lineGap: 2 });
  doc.y += 44;
  doc.moveTo(M, doc.y).lineTo(M + 220, doc.y).lineWidth(0.8).strokeColor(INK).stroke();
  doc.y += 6;
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(org.treasurer_name || org.pastor_name || '', M);
  doc.fillColor(MUTED).text(org.treasurer_name ? (es ? 'Tesorería' : 'Treasurer') : org.pastor_name ? 'Pastor' : es ? 'Firma autorizada' : 'Authorized signature');
}

export async function statementsPdf(org: any, statements: StatementData[], lang: Lang): Promise<Buffer> {
  const doc = newDoc(lang === 'es' ? 'Constancia de contribuciones' : 'Contribution Statement');
  statements.forEach((s, i) => {
    if (i > 0) doc.addPage();
    statementPage(doc, org, s, lang);
  });
  return finish(doc, org.legal_name || org.name);
}

// ─── Bank deposit slip ───────────────────────────────────────────────────────

export interface DepositSlip {
  date: string;
  account?: string | null;
  reference?: string | null;
  notes?: string | null;
  batches: { date: string; name: string; cash: number; checks: number }[];
  denominations: { value: number; count: number }[];
  checks: { name: string; check_number: string | null; amount: number }[];
  cash: number;
  checkTotal: number;
}

/** A printable summary to take to the bank with the envelope: cash by bill and coin, and each check. */
export async function depositSlipPdf(org: any, d: DepositSlip, lang: Lang): Promise<Buffer> {
  const es = lang === 'es';
  const doc = newDoc(es ? 'Hoja de depósito' : 'Deposit slip');
  letterhead(doc, org);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text(es ? 'Hoja de depósito bancario' : 'Bank deposit slip');
  const meta = [`${es ? 'Fecha' : 'Date'}: ${fmtDate(d.date, lang)}`, d.account && `${es ? 'Cuenta' : 'Account'}: ${d.account}`, d.reference && `${es ? 'Referencia' : 'Reference'}: ${d.reference}`].filter(Boolean).join('   ·   ');
  doc.font('Helvetica').fontSize(10.5).fillColor(MUTED).text(meta);
  doc.y += 14;

  const money = (n: number) => fmtMoney(n, org.currency, lang);
  const w = (doc.page.width - M * 2) / 3;
  const y = doc.y;
  [[es ? 'EFECTIVO' : 'CASH', d.cash], [es ? 'CHEQUES' : 'CHECKS', d.checkTotal], [es ? 'TOTAL A DEPOSITAR' : 'TOTAL DEPOSIT', d.cash + d.checkTotal]].forEach(([label, v], i) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(String(label), M + i * w, y, { width: w - 8 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(i === 2 ? ACCENT : INK).text(money(Number(v)), M + i * w, y + 13, { width: w - 8 });
  });
  doc.x = M;
  doc.y = y + 50;

  const section = (title: string) => { if (doc.y > doc.page.height - 150) doc.addPage(); doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(title, M); doc.y += 6; };
  section(es ? 'Conteos incluidos' : 'Counts included');
  table(doc, [
    { key: 'date', label: es ? 'Fecha' : 'Date', kind: 'date' }, { key: 'name', label: es ? 'Culto' : 'Service', kind: 'text' },
    { key: 'cash', label: es ? 'Efectivo' : 'Cash', kind: 'money' }, { key: 'checks', label: es ? 'Cheques' : 'Checks', kind: 'money' },
  ], d.batches as any, { date: 'Total', cash: d.cash, checks: d.checkTotal }, org.currency, lang);

  if (d.denominations.length) {
    section(es ? 'Efectivo por billete y moneda' : 'Cash by bill and coin');
    table(doc, [
      { key: 'label', label: es ? 'Denominación' : 'Denomination', kind: 'text' }, { key: 'count', label: es ? 'Cantidad' : 'Count', kind: 'number' },
      { key: 'total', label: 'Total', kind: 'money' },
    ], d.denominations.map((x) => ({ label: money(x.value), count: x.count, total: Math.round(x.value * x.count * 100) / 100 })),
    { label: 'Total', total: d.denominations.reduce((a, x) => a + x.value * x.count, 0) }, org.currency, lang);
  }
  if (d.checks.length) {
    section(es ? 'Cheques' : 'Checks');
    table(doc, [
      { key: 'name', label: es ? 'De' : 'From', kind: 'text' }, { key: 'check_number', label: es ? 'N.º de cheque' : 'Check no.', kind: 'text' },
      { key: 'amount', label: es ? 'Monto' : 'Amount', kind: 'money' },
    ], d.checks as any, { name: `${d.checks.length} ${es ? 'cheques' : 'checks'}`, amount: d.checkTotal }, org.currency, lang);
  }
  if (d.notes) { doc.font('Helvetica').fontSize(10).fillColor(INK).text(d.notes, M); doc.y += 10; }

  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.y += 30;
  const sig = (x: number, label: string) => {
    const yy = doc.y;
    doc.moveTo(x, yy).lineTo(x + 200, yy).lineWidth(0.8).strokeColor(INK).stroke();
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, x, yy + 6, { width: 200 });
    doc.y = yy;
  };
  sig(M, es ? 'Preparado por' : 'Prepared by');
  sig(M + 260, es ? 'Verificado por' : 'Verified by');
  return finish(doc, `${org.name} · ${es ? 'Hoja de depósito' : 'Deposit slip'} ${fmtDate(d.date, lang)}`);
}
