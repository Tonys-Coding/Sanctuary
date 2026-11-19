import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { one, q, tx } from '../db';
import { env, features } from '../env';
import { HttpError, endSession, isTimeZone, parse, requireAuth, startSession } from '../http';
import { letterHtml, sendMail } from '../lib/mailer';
import { removeFile, saveImage, upload } from '../lib/files';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.isProd ? 30 : 1000, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_attempts' } });

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8).max(200);
const lang = z.enum(['es', 'en']);

export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export function newInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function findInvite(code: string, runner?: any) {
  return one(
    `SELECT i.*, o.name AS church_name FROM invitations i JOIN organizations o ON o.id = i.org_id
     WHERE i.code = $1 AND i.revoked_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > now())
       AND (i.max_uses IS NULL OR i.uses < i.max_uses) ${runner ? 'FOR UPDATE OF i' : ''}`,
    [normalizeCode(code)],
    runner,
  );
}

const DEFAULT_FUNDS = {
  es: ['Diezmos', 'Ofrendas', 'Misiones', 'Construcción', 'Primicias'],
  en: ['Tithes', 'Offerings', 'Missions', 'Building fund', 'First fruits'],
};

async function sessionPayload(userId: string) {
  const user = await one(
    'SELECT id, org_id, email, full_name, avatar_file, language, theme FROM users WHERE id = $1',
    [userId],
  );
  const org = await one('SELECT * FROM organizations WHERE id = $1', [user.org_id]);
  const f = features();
  return { user, org, features: { ...f, aiConfigured: f.ai, ai: f.ai && org.ai_enabled } };
}

r.get('/invite/:code', limiter, async (req, res) => {
  const inv = await findInvite(String(req.params.code));
  if (!inv) throw new HttpError(404, 'invite_invalid');
  res.json({ churchName: inv.church_name });
});

r.post('/register', limiter, async (req, res) => {
  const body = parse(
    z.object({
      mode: z.enum(['create', 'join']),
      fullName: z.string().trim().min(2).max(120),
      email,
      password,
      language: lang.default('es'),
      churchName: z.string().trim().max(160).optional(),
      inviteCode: z.string().max(40).optional(),
      timezone: z.string().max(60).optional(),
    }),
    req.body,
  );
  if (await one('SELECT 1 FROM users WHERE email = $1', [body.email])) throw new HttpError(409, 'email_taken');
  const hash = await bcrypt.hash(body.password, 11);

  const userId = await tx(async (c) => {
    let orgId: string;
    if (body.mode === 'join') {
      const inv = await findInvite(body.inviteCode || '', c);
      if (!inv) throw new HttpError(400, 'invite_invalid');
      orgId = inv.org_id;
      await q('UPDATE invitations SET uses = uses + 1 WHERE id = $1', [inv.id], c);
    } else {
      if (!body.churchName || body.churchName.length < 2) throw new HttpError(400, 'church_name_required');
      // A new church takes the time zone of the browser that registers it.
      const tz = body.timezone && isTimeZone(body.timezone) ? body.timezone : 'UTC';
      orgId = (await one('INSERT INTO organizations (name, timezone) VALUES ($1, $2) RETURNING id', [body.churchName, tz], c)).id;
      const names = DEFAULT_FUNDS[body.language];
      for (let i = 0; i < names.length; i++) {
        await q('INSERT INTO funds (org_id, name, color_slot, sort_order) VALUES ($1,$2,$3,$4)', [orgId, names[i], i + 1, i], c);
      }
    }
    const u = await one(
      'INSERT INTO users (org_id, email, password_hash, full_name, language, last_login_at) VALUES ($1,$2,$3,$4,$5, now()) RETURNING id',
      [orgId, body.email, hash, body.fullName, body.language],
      c,
    );
    await q(
      'INSERT INTO audit_log (org_id, user_id, user_name, action, entity, entity_id, summary) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [orgId, u.id, body.fullName, body.mode === 'join' ? 'join' : 'create', 'user', u.id, body.fullName],
      c,
    );
    return u.id as string;
  });
  startSession(res, userId, 1);
  res.status(201).json(await sessionPayload(userId));
});

r.post('/login', limiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().max(200) }), req.body);
  const u = await one('SELECT id, password_hash, session_version FROM users WHERE email = $1', [body.email]);
  // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal accounts.
  const ok = await bcrypt.compare(body.password, u?.password_hash || DUMMY_HASH);
  if (!u || !ok) throw new HttpError(401, 'bad_credentials');
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  startSession(res, u.id, u.session_version);
  res.json(await sessionPayload(u.id));
});

r.post('/logout', (_req, res) => {
  endSession(res);
  res.json({ ok: true });
});

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 11);
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

r.post('/forgot', limiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const u = await one(
    'SELECT u.id, u.org_id, u.full_name, u.language, o.name AS church FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = $1',
    [body.email],
  );
  if (u) {
    const token = crypto.randomBytes(32).toString('base64url');
    await q("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')", [u.id, sha(token)]);
    const url = `${env.appUrl}/restablecer?token=${token}`;
    const es = u.language !== 'en';
    const text = es
      ? `Hola ${u.full_name}:\n\nRecibimos una solicitud para restablecer tu contraseña de Sanctuary. Usa el botón de abajo para crear una nueva. El enlace vence en 1 hora.\n\nSi no fuiste tú, puedes ignorar este mensaje.`
      : `Hello ${u.full_name},\n\nWe received a request to reset your Sanctuary password. Use the button below to choose a new one. The link expires in 1 hour.\n\nIf this wasn't you, you can ignore this message.`;
    if (features().email) {
      await sendMail(
        { orgId: u.org_id, userId: u.id, kind: 'password_reset' },
        {
          to: body.email,
          subject: es ? 'Restablece tu contraseña de Sanctuary' : 'Reset your Sanctuary password',
          text: `${text}\n\n${url}`,
          html: letterHtml(u.church, text, { label: es ? 'Crear nueva contraseña' : 'Choose a new password', url }),
        },
      );
    } else {
      console.log(`\n🔑 Enlace para restablecer la contraseña de ${body.email} (el correo SMTP no está configurado):\n   ${url}\n`);
    }
  }
  // Same answer whether or not the account exists.
  res.json({ ok: true, emailConfigured: features().email });
});

r.post('/reset', limiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(10).max(200), password }), req.body);
  const row = await one('SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [sha(body.token)]);
  if (!row) throw new HttpError(400, 'reset_invalid');
  const hash = await bcrypt.hash(body.password, 11);
  // Bumping session_version signs the account out everywhere else.
  await q('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hash, row.user_id]);
  await q('UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [row.user_id]);
  res.json({ ok: true });
});

r.get('/me', requireAuth, async (req, res) => {
  res.json(await sessionPayload(req.user.id));
});

r.patch('/me', requireAuth, async (req, res) => {
  const body = parse(
    z.object({ fullName: z.string().trim().min(2).max(120).optional(), language: lang.optional(), theme: z.enum(['light', 'dark', 'system']).optional() }),
    req.body,
  );
  await q('UPDATE users SET full_name = COALESCE($2, full_name), language = COALESCE($3, language), theme = COALESCE($4, theme) WHERE id = $1', [
    req.user.id, body.fullName ?? null, body.language ?? null, body.theme ?? null,
  ]);
  res.json(await sessionPayload(req.user.id));
});

r.post('/me/password', requireAuth, limiter, async (req, res) => {
  const body = parse(z.object({ current: z.string().max(200), next: password }), req.body);
  const u = await one('SELECT password_hash, session_version FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(body.current, u.password_hash))) throw new HttpError(400, 'wrong_password');
  await q('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [await bcrypt.hash(body.next, 11), req.user.id]);
  startSession(res, req.user.id, u.session_version + 1);
  res.json({ ok: true });
});

r.post('/me/avatar', requireAuth, upload.single('file'), async (req, res) => {
  const name = await saveImage(req.user.orgId, req.file, 'avatar');
  const old = await one('SELECT avatar_file FROM users WHERE id = $1', [req.user.id]);
  await q('UPDATE users SET avatar_file = $1 WHERE id = $2', [name, req.user.id]);
  await removeFile(req.user.orgId, old?.avatar_file);
  res.json(await sessionPayload(req.user.id));
});

export default r;
