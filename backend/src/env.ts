import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const env = {
  isProd,
  port: Number(process.env.PORT || 5001),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://sanctuary:sanctuary@localhost:5432/sanctuary',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  geminiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim(),
  // Only override to route Gemini calls through a proxy.
  geminiBaseUrl: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, ''),
  smtp: {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Sanctuary <no-reply@localhost>',
  },
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
};

export const features = () => ({ ai: !!env.geminiKey, email: !!env.smtp.host });
