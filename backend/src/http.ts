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
    'SELECT id, org_id, full_name, email, language, session_version FROM users WHERE id = $1',
    [payload.sub],
  );
  if (!u || u.session_version !== payload.v) throw new HttpError(401, 'unauthenticated');
  req.user = { id: u.id, orgId: u.org_id, name: u.full_name, email: u.email, language: u.language === 'en' ? 'en' : 'es' };
  next();
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_input', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

export async function audit(req: Request, action: string, entity: string, entityId: string | null, summary: string) {
  await q(
    'INSERT INTO audit_log (org_id, user_id, user_name, action, entity, entity_id, summary) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [req.user.orgId, req.user.id, req.user.name, action, entity, entityId, summary.slice(0, 300)],
  );
}

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
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
