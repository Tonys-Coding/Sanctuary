import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, ZodType } from 'zod';
import { env } from './env';
import { one, q } from './db';

/** An error whose `code` is a translation key the frontend knows how to show. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, public detail?: unknown) {
    super(code);
  }
}
export const notFound = () => new HttpError(404, 'not_found');

export interface SessionUser {
  id: string;
  orgId: string;
  name: string;
  email: string;
  language: 'es' | 'en';
  /** The church's IANA time zone, e.g. "America/Chicago". */
  tz: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}

const COOKIE = 'sanctuary_session';
const WEEK = 7 * 24 * 3600 * 1000;

export function startSession(res: Response, userId: string, version: number) {
  const token = jwt.sign({ sub: userId, v: version }, env.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.isProd, maxAge: WEEK, path: '/' });
}
export function endSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) throw new HttpError(401, 'unauthenticated');
  let payload: { sub: string; v: number };
  try {
    payload = jwt.verify(token, env.jwtSecret) as any;
  } catch {
    throw new HttpError(401, 'unauthenticated');
  }
  const u = await one(
    `SELECT u.id, u.org_id, u.full_name, u.email, u.language, u.session_version, o.timezone
     FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`,
    [payload.sub],
  );
  if (!u || u.session_version !== payload.v) throw new HttpError(401, 'unauthenticated');
  req.user = { id: u.id, orgId: u.org_id, name: u.full_name, email: u.email, language: u.language === 'en' ? 'en' : 'es', tz: u.timezone || 'UTC' };
  next();
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_input', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

/** Records who did what. `changes` holds the before and after of each field that changed. */
export async function audit(req: Request, action: string, entity: string, entityId: string | null, summary: string, changes?: Changes | null) {
  await q(
    'INSERT INTO audit_log (org_id, user_id, user_name, action, entity, entity_id, summary, changes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [req.user.orgId, req.user.id, req.user.name, action, entity, entityId, summary.slice(0, 300), changes && Object.keys(changes).length ? JSON.stringify(changes) : null],
  );
}

export type Changes = Record<string, [unknown, unknown]>;
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** The fields whose value differs between two versions of a record, as { field: [before, after] }. */
export function diff(before: Record<string, any>, after: Record<string, any>, fields: string[]): Changes {
  const out: Changes = {};
  for (const f of fields) if (!same(before?.[f], after?.[f])) out[f] = [before?.[f] ?? null, after?.[f] ?? null];
  return out;
}
/** A deleted record, kept in the log so it can be looked up later. */
export const snapshot = (row: Record<string, any>, fields: string[]): Changes =>
  Object.fromEntries(fields.filter((f) => row[f] != null && row[f] !== '').map((f) => [f, [row[f], null]]));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, detail: err.detail });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'file_too_large' });
    return;
  }
  if (err?.code === '22P02') {
    // malformed uuid in a path or body → treat as not found
    res.status(404).json({ error: 'not_found' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}

export const isoDate = /^\d{4}-\d{2}-\d{2}$/;
/** The date (YYYY-MM-DD) in the given time zone, not the server's. */
export function todayIn(tz: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}
/** The hour (0–23) in the given time zone. */
export function hourIn(tz: string, at = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(at));
  } catch {
    return at.getUTCHours();
  }
}
export const isTimeZone = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } };
