import express from 'express';
import path from 'node:path';
import { config, rootDir } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { isSeeded } from './db/seed.js';
import { purgeExpiredSessions } from './lib/auth.js';
import { cookieParser } from './middleware/cookies.js';
import { paymentProviderLabel } from './lib/payments.js';
import { shopRouter } from './routes/shop.js';
import { posRouter } from './routes/pos.js';
import { adminRouter } from './routes/admin.js';

const app = express();

app.disable('x-powered-by');
if (config.isProduction) app.set('trust proxy', 1);

app.locals.payment = config.payment;
app.locals.paymentProvider = config.payment.provider;
app.locals.siteUrl = config.siteUrl;

app.use(
  express.static(path.join(rootDir, 'public'), {
    maxAge: config.isProduction ? '7d' : 0,
    setHeaders(res, filePath) {
      // Hashed assets would be cached harder; plain CSS/JS should revalidate.
      if (/\.(?:css|js)$/.test(filePath) && config.isProduction) {
        res.setHeader('cache-control', 'public, max-age=3600');
      }
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser);

// Basic hardening. A reverse proxy in front should add HSTS.
app.use((req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  next();
});

app.get('/healthz', (req, res) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
  res.json({ ok: true, products: count, provider: config.payment.provider });
});

app.use('/pos', posRouter);
app.use('/admin', adminRouter);
app.use('/', shopRouter);

// eslint-disable-next-line no-unused-vars -- Express needs all four parameters.
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).type('html').send(
    `<!doctype html><meta charset="utf-8"><title>Something went wrong</title>
     <style>body{font-family:system-ui;padding:3rem;max-width:40rem;margin:auto;color:#231319}</style>
     <h1>Something went wrong</h1>
     <p>The page could not be shown. Please try again, or call the shop on
        ${'(246) 285-1413'}.</p>
     ${config.isProduction ? '' : `<pre style="white-space:pre-wrap;color:#c0163a">${error.stack}</pre>`}`,
  );
});

const db = getDb();
if (!isSeeded(db)) {
  console.warn('\n  The catalogue is empty. Run `npm run setup` first.\n');
}
purgeExpiredSessions(db);

const server = app.listen(config.port, () => {
  console.log(`\n  Hairify is running on http://localhost:${config.port}`);
  console.log(`  Storefront   http://localhost:${config.port}/`);
  console.log(`  POS          http://localhost:${config.port}/pos`);
  console.log(`  Back office  http://localhost:${config.port}/admin`);
  console.log(`  Payments     ${paymentProviderLabel(config.payment)}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  });
}

export { app };
