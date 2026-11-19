import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../env';
import { q } from '../db';
import { HttpError } from '../http';

let transport: Transporter | null = null;
function getTransport() {
  if (!env.smtp.host) return null;
  // SMTP_HOST=test keeps messages in memory (automated tests and demos), nothing leaves the machine.
  if (env.smtp.host === 'test') return (transport ??= nodemailer.createTransport({ streamTransport: true, buffer: true }));
  transport ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
  replyTo?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Wraps plain text in a simple, readable HTML e-mail. */
export function letterHtml(churchName: string, body: string, button?: { label: string; url: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const btn = button
    ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#c2570c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600;display:inline-block">${esc(button.label)}</a></p>`
    : '';
  return `<div style="background:#f6f1e7;padding:32px 16px;font-family:Verdana,Geneva,sans-serif;font-size:16px;color:#2a221a">
  <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #e6dccb;border-radius:14px;padding:32px">
    <p style="margin:0 0 24px;font-size:20px;font-weight:700">${esc(churchName)}</p>${paragraphs}${btn}
  </div></div>`;
}

/** Sends one e-mail and records the outcome. Returns false (never throws) on delivery failure. */
export async function sendMail(ctx: { orgId: string; userId?: string | null; kind: string }, mail: Mail): Promise<boolean> {
  const t = getTransport();
  if (!t) throw new HttpError(503, 'email_not_configured');
  let status = 'sent';
  let error: string | null = null;
  try {
    await t.sendMail({ from: env.smtp.from, ...mail });
  } catch (e: any) {
    status = 'failed';
    error = String(e?.message || e).slice(0, 500);
    console.error('E-mail failed:', error);
  }
  await q('INSERT INTO email_log (org_id, recipient, subject, kind, status, error, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    ctx.orgId, mail.to, mail.subject.slice(0, 300), ctx.kind, status, error, ctx.userId ?? null,
  ]);
  return status === 'sent';
}
