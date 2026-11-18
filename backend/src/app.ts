import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { env } from './env';
import { HttpError, errorHandler, requireAuth } from './http';
import { filePath } from './lib/files';
import auth from './routes/auth';
import org from './routes/org';
import members from './routes/members';
import funds from './routes/funds';
import offerings from './routes/offerings';
import batches from './routes/batches';
import goals from './routes/goals';
import reports from './routes/reports';
import ai from './routes/ai';
import data from './routes/data';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // The session cookie is SameSite=Lax; additionally refuse state-changing requests from other sites.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      // Modern browsers say themselves whether a request comes from the same site. Proxies
      // (Codespaces, the Vite dev server, hosting platforms) rewrite Host but leave this alone.
      const site = req.get('sec-fetch-site');
      const origin = req.get('origin');
      let ok: boolean;
      if (site) ok = site === 'same-origin' || site === 'none';
      else if (!origin) ok = true; // not a browser cross-site request (curl, server-to-server)
      else {
        // Older browsers: fall back to comparing the Origin with this server's address.
        const host = req.get('x-forwarded-host') || req.get('host');
        try { ok = new URL(origin).host === host || origin === env.appUrl; } catch { ok = false; }
      }
      if (!ok) throw new HttpError(403, 'forbidden');
    }
    next();
  });

  app.get('/api/health', (_req, res) => void res.json({ status: 'ok' }));
  app.use('/api/auth', auth);

  const api = express.Router();
  api.use(requireAuth);
  api.get('/files/:name', (req, res) => {
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(filePath(req.user.orgId, String(req.params.name)), (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
    });
  });
  api.use('/org', org);
  api.use('/members', members);
  api.use('/funds', funds);
  api.use('/offerings', offerings);
  api.use('/batches', batches);
  api.use('/goals', goals);
  api.use('/reports', reports);
  api.use('/ai', ai);
  api.use('/data', data);
  app.use('/api', api);
  app.use('/api', (_req, _res) => { throw new HttpError(404, 'not_found'); });

  // In production the API also serves the built frontend, so there is a single thing to run.
  const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
