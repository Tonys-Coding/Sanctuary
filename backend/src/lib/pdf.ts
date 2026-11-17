import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { env } from '../env';
import { Column, Lang, Report, fmtCell, fmtDate, fmtMoney } from './reports';
import { today } from '../http';

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
  return finish(doc, `${org.name} · ${lang === 'es' ? 'Generado el' : 'Generated on'} ${fmtDate(today(), lang)}`);
}

// ─── Tax statements ──────────────────────────────────────────────────────────

export interface StatementData {
  member: { full_name: string; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; envelope_number?: string | null };
  year: number;
  gifts: { date: string; fund: string; method: string; check?: string | null; amount: number }[];
  total: number;
}

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
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`${es ? 'Fecha de emisión' : 'Issued'}: ${fmtDate(today(), lang)}`);
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

  const cols: Column[] = [
    { key: 'date', label: es ? 'Fecha' : 'Date', kind: 'date' },
    { key: 'fund', label: es ? 'Fondo' : 'Fund', kind: 'text' },
    { key: 'method', label: es ? 'Método' : 'Method', kind: 'text' },
    { key: 'amount', label: es ? 'Monto' : 'Amount', kind: 'money' },
  ];
  table(doc, cols, s.gifts as any, { date: es ? 'Total deducible' : 'Total deductible', amount: s.total }, org.currency, lang);

  if (doc.y > doc.page.height - 190) doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(`${es ? 'Total de contribuciones' : 'Total contributions'} ${s.year}: ${fmtMoney(s.total, org.currency, lang)}`, M, doc.y, { width: right - M });
  doc.y += 12;
  doc.font('Helvetica').fontSize(10).fillColor(INK).text(org.statement_note || DEFAULT_STATEMENT_NOTE[lang], { width: right - M, lineGap: 2 });
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
