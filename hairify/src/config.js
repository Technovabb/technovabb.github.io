import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A tiny .env reader so the app has no dotenv dependency. Values already in the
// real environment always win, which is what hosting platforms expect.
function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production. See .env.example.');
}

export const config = {
  env,
  isProduction,
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/hairify.db'),
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'manual',
    publicKey: process.env.PAYMENT_PUBLIC_KEY || '',
    secretKey: process.env.PAYMENT_SECRET_KEY || '',
  },
  email: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'orders@hairifybb.com',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@hairifybb.com',
    password: process.env.ADMIN_PASSWORD || '',
  },
};
