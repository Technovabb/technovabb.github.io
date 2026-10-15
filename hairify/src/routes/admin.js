import express from 'express';
import bcrypt from 'bcryptjs';
import { transaction } from '../db/index.js';
import { toString } from '../lib/html.js';
import { toCents } from '../lib/money.js';
import { listCategories, productImages, productVariants, getProductById } from '../lib/catalog.js';
import { applyMovement, availableStock, componentsOf } from '../lib/inventory.js';
import {
  getOrder,
  getOrderByReference,
  recordPayment,
  updateOrderStatus,
} from '../lib/orders.js';
import {
  dashboardStats,
  marginReport,
  paymentMix,
  salesByChannel,
  salesByDay,
  stockLedger,
  topProducts,
} from '../lib/reports.js';
import { createSession, createUser, destroySession, hashPassword, verifyLogin } from '../lib/auth.js';
import { defaultLocation, getSettings, setSettings, storeHours } from '../lib/settings.js';
import {
  SESSION_COOKIE,
  loadUser,
  requireRole,
  safeNext,
  sessionCookieOptions,
  verifyCsrf,
} from '../middleware/auth.js';
import { signInPage } from '../views/staff.js';
import {
  customersPage,
  dashboardPage,
  inventoryPage,
  orderDetailPage,
  ordersPage,
  productEditPage,
  productsPage,
  receivePage,
  reportsPage,
  settingsPage,
} from '../views/admin.js';

export const adminRouter = express.Router();

adminRouter.use(loadUser);

function send(res, page) {
  res.type('html').send(toString(page));
}

/** Turns `?saved=…` into the banner at the top of a page. */
function flashFrom(query) {
  if (query.saved) return { kind: 'ok', message: String(query.saved) };
  if (query.error) return { kind: 'bad', message: String(query.error) };
  return null;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ----------------------------------------------------------- signing in */

adminRouter.get('/signin', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next, '/admin'));
  send(
    res,
    signInPage({
      title: 'Back office',
      subtitle: 'Sign in to the Hairify back office.',
      action: '/admin/signin',
      csrf: req.csrf,
      nextUrl: safeNext(req.query.next, '/admin'),
    }),
  );
});

adminRouter.post('/signin', verifyCsrf, (req, res) => {
  const nextUrl = safeNext(req.body.next, '/admin');
  const user = verifyLogin(req.db, (req.body.email || '').trim(), req.body.password || '');

  if (!user) {
    return send(
      res,
      signInPage({
        title: 'Back office',
        subtitle: 'Sign in to the Hairify back office.',
        action: '/admin/signin',
        csrf: req.csrf,
        nextUrl,
        error: 'Those details did not match.',
      }),
    );
  }

  res.cookie(SESSION_COOKIE, createSession(req.db, user.id), sessionCookieOptions(req));
  res.redirect(nextUrl);
});

adminRouter.get('/signout', (req, res) => {
  destroySession(req.db, req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.redirect('/admin/signin');
});

/* ------------------------------------- the back office needs a manager --- */

adminRouter.use(requireRole('manager', '/admin/signin'));
adminRouter.use(verifyCsrf);

adminRouter.use((req, res, next) => {
  req.location = defaultLocation(req.db);
  req.settings = getSettings(req.db);
  next();
});

/* ----------------------------------------------------------- dashboard */

adminRouter.get('/', (req, res) => {
  const recentOrders = req.db
    .prepare(
      `SELECT o.*, c.name AS customer_name
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
        ORDER BY o.id DESC LIMIT 12`,
    )
    .all();

  send(
    res,
    dashboardPage({
      user: req.user,
      stats: dashboardStats(req.db, req.location.id),
      recentOrders,
      flash: flashFrom(req.query),
    }),
  );
});

/* -------------------------------------------------------------- orders */

adminRouter.get('/orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const params = [];
  let where = '';
  if (status) {
    where = 'WHERE o.status = ?';
    params.push(status);
  }

  const orders = req.db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone
         FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
         ${where}
        ORDER BY o.id DESC LIMIT 200`,
    )
    .all(...params);

  send(res, ordersPage({ user: req.user, orders, filters: { status }, flash: flashFrom(req.query) }));
});

adminRouter.get('/orders/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();
  send(
    res,
    orderDetailPage({
      user: req.user,
      order,
      csrf: req.csrf,
      settings: req.settings,
      flash: flashFrom(req.query),
    }),
  );
});

adminRouter.post('/orders/:reference/status', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();

  const allowed = [
    'placed',
    'packed',
    'out-for-delivery',
    'ready-for-pickup',
    'completed',
  ];
  if (!allowed.includes(req.body.status)) {
    return res.redirect(`/admin/orders/${order.reference}?error=That+status+is+not+allowed`);
  }

  updateOrderStatus(req.db, order.id, req.body.status);
  res.redirect(`/admin/orders/${order.reference}?saved=Status+updated`);
});

adminRouter.post('/orders/:reference/paid', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();

  const outstanding = order.total_cents - order.paid_cents;
  if (outstanding <= 0) {
    return res.redirect(`/admin/orders/${order.reference}?error=That+order+is+already+paid`);
  }

  const method = ['cash', 'card', 'transfer'].includes(req.body.method) ? req.body.method : 'cash';
  recordPayment(req.db, order.id, { method, amountCents: outstanding, userId: req.user.id });

  if (order.status === 'pending-payment') updateOrderStatus(req.db, order.id, 'placed');
  res.redirect(`/admin/orders/${order.reference}?saved=Payment+recorded`);
});

adminRouter.post('/orders/:reference/cancel', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();

  transaction(req.db, () => {
    for (const item of order.items) {
      const outstanding = item.quantity - item.refunded_qty;
      if (item.variant_id && outstanding > 0) {
        applyMovement(req.db, {
          variantId: item.variant_id,
          locationId: order.location_id,
          delta: outstanding,
          reason: 'Order cancelled',
          referenceType: 'order',
          referenceId: order.id,
          userId: req.user.id,
        });
      }
    }
    updateOrderStatus(req.db, order.id, 'cancelled');
  });

  res.redirect(`/admin/orders/${order.reference}?saved=Order+cancelled+and+stock+returned`);
});

/* ------------------------------------------------------------ products */

adminRouter.get('/products', (req, res) => {
  const rows = req.db
    .prepare(
      `SELECT p.*, c.name AS category_name,
              (SELECT COUNT(*) FROM variants v WHERE v.product_id = p.id AND v.active = 1) AS variant_count,
              (SELECT MIN(price_cents) FROM variants v WHERE v.product_id = p.id AND v.active = 1) AS min_cents,
              (SELECT MAX(price_cents) FROM variants v WHERE v.product_id = p.id AND v.active = 1) AS max_cents
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
        ORDER BY p.kind, p.sort_order, p.name`,
    )
    .all();

  const products = rows.map((product) => ({
    ...product,
    min_cents: product.min_cents ?? 0,
    max_cents: product.max_cents ?? 0,
    stock: productVariants(req.db, product.id, req.location.id).reduce(
      (sum, variant) => sum + variant.stock,
      0,
    ),
  }));

  send(res, productsPage({ user: req.user, products, flash: flashFrom(req.query) }));
});

adminRouter.get('/products/new', (req, res) => {
  send(
    res,
    productEditPage({
      user: req.user,
      product: { unit_label: 'each', active: 1 },
      variants: [],
      categories: listCategories(req.db),
      csrf: req.csrf,
      isNew: true,
      flash: flashFrom(req.query),
    }),
  );
});

function productFieldsFrom(body) {
  return {
    name: (body.name || '').trim(),
    slug: slugify(body.slug || body.name || ''),
    subtitle: (body.subtitle || '').trim() || null,
    brand: (body.brand || '').trim() || null,
    eyebrow: (body.eyebrow || '').trim() || null,
    category_id: body.category_id ? Number(body.category_id) : null,
    unit_label: (body.unit_label || 'each').trim(),
    badge: body.badge || null,
    description: (body.description || '').trim() || null,
    how_to: (body.how_to || '').trim() || null,
    care_notes: (body.care_notes || '').trim() || null,
    packs_min: body.packs_min ? Number(body.packs_min) : null,
    packs_max: body.packs_max ? Number(body.packs_max) : null,
    featured: body.featured === '1' ? 1 : 0,
    active: body.active === '1' ? 1 : 0,
  };
}

adminRouter.post('/products/new', (req, res) => {
  const fields = productFieldsFrom(req.body);
  if (!fields.name || !fields.slug) {
    return res.redirect('/admin/products/new?error=A+product+needs+a+name');
  }
  if (req.db.prepare('SELECT 1 FROM products WHERE slug = ?').get(fields.slug)) {
    return res.redirect('/admin/products/new?error=That+web+address+is+already+taken');
  }

  const result = req.db
    .prepare(
      `INSERT INTO products
         (slug, name, subtitle, brand, category_id, kind, eyebrow, description, how_to,
          care_notes, badge, unit_label, packs_min, packs_max, featured, active)
       VALUES (?, ?, ?, ?, ?, 'product', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fields.slug,
      fields.name,
      fields.subtitle,
      fields.brand,
      fields.category_id,
      fields.eyebrow,
      fields.description,
      fields.how_to,
      fields.care_notes,
      fields.badge,
      fields.unit_label,
      fields.packs_min,
      fields.packs_max,
      fields.featured,
      fields.active,
    );

  res.redirect(`/admin/products/${result.lastInsertRowid}?saved=Product+created`);
});

adminRouter.get('/products/:id', (req, res, next) => {
  const product = getProductById(req.db, Number(req.params.id));
  if (!product) return next();

  send(
    res,
    productEditPage({
      user: req.user,
      product,
      variants: productVariants(req.db, product.id, req.location.id),
      categories: listCategories(req.db),
      csrf: req.csrf,
      flash: flashFrom(req.query),
    }),
  );
});

adminRouter.post('/products/:id', (req, res, next) => {
  const id = Number(req.params.id);
  const existing = req.db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!existing) return next();

  const fields = productFieldsFrom(req.body);
  if (!fields.name || !fields.slug) {
    return res.redirect(`/admin/products/${id}?error=A+product+needs+a+name`);
  }

  const clash = req.db.prepare('SELECT id FROM products WHERE slug = ? AND id <> ?').get(fields.slug, id);
  if (clash) return res.redirect(`/admin/products/${id}?error=That+web+address+is+already+taken`);

  req.db
    .prepare(
      `UPDATE products SET
         slug = ?, name = ?, subtitle = ?, brand = ?, category_id = ?, eyebrow = ?,
         description = ?, how_to = ?, care_notes = ?, badge = ?, unit_label = ?,
         packs_min = ?, packs_max = ?, featured = ?, active = ?
       WHERE id = ?`,
    )
    .run(
      fields.slug,
      fields.name,
      fields.subtitle,
      fields.brand,
      fields.category_id,
      fields.eyebrow,
      fields.description,
      fields.how_to,
      fields.care_notes,
      fields.badge,
      fields.unit_label,
      fields.packs_min,
      fields.packs_max,
      fields.featured,
      fields.active,
      id,
    );

  res.redirect(`/admin/products/${id}?saved=Saved`);
});

adminRouter.post('/products/:id/variants', (req, res, next) => {
  const id = Number(req.params.id);
  const product = req.db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!product) return next();

  const sku = (req.body.sku || '').trim().toUpperCase();
  const price = toCents(req.body.price || 0);
  if (!sku || !Number.isFinite(price) || price < 0) {
    return res.redirect(`/admin/products/${id}?error=A+variant+needs+a+SKU+and+a+price`);
  }
  if (req.db.prepare('SELECT 1 FROM variants WHERE sku = ?').get(sku)) {
    return res.redirect(`/admin/products/${id}?error=That+SKU+is+already+in+use`);
  }

  const openingStock = Math.max(0, Number(req.body.stock) || 0);

  transaction(req.db, () => {
    const nextBarcode =
      'HF' +
      String((req.db.prepare('SELECT COUNT(*) AS count FROM variants').get().count || 0) + 1).padStart(6, '0');

    const result = req.db
      .prepare(
        `INSERT INTO variants (product_id, sku, barcode, texture, length, colour, price_cents, cost_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        sku,
        nextBarcode,
        (req.body.texture || '').trim() || null,
        (req.body.length || '').trim() || null,
        (req.body.colour || '').trim() || null,
        price,
        req.body.cost ? toCents(req.body.cost) : null,
      );

    const variantId = Number(result.lastInsertRowid);
    req.db
      .prepare('INSERT INTO inventory (variant_id, location_id, on_hand) VALUES (?, ?, 0)')
      .run(variantId, req.location.id);

    if (openingStock > 0) {
      applyMovement(req.db, {
        variantId,
        locationId: req.location.id,
        delta: openingStock,
        reason: 'Opening stock',
        userId: req.user.id,
      });
    }
  });

  res.redirect(`/admin/products/${id}?saved=Variant+added`);
});

adminRouter.post('/products/:id/images', (req, res, next) => {
  const id = Number(req.params.id);
  const product = req.db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (!product) return next();

  const url = (req.body.url || '').trim();
  // Only same-origin paths, so a photo cannot be hot-linked from somewhere else.
  if (!url.startsWith('/')) {
    return res.redirect(`/admin/products/${id}?error=Use+a+path+like+/img/products/photo.jpg`);
  }

  const next_ = productImages(req.db, id).length;
  req.db
    .prepare('INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)')
    .run(id, url, (req.body.alt || '').trim() || null, next_);

  res.redirect(`/admin/products/${id}?saved=Photo+added`);
});

/* ----------------------------------------------------------- inventory */

function inventoryRows(req, { search = '', lowOnly = false } = {}) {
  const params = [req.location.id];
  const conditions = ['i.location_id = ?', 'v.active = 1'];

  if (search) {
    conditions.push('(p.name LIKE ? OR v.sku LIKE ? OR v.barcode = ?)');
    params.push(`%${search}%`, `%${search}%`, search);
  }
  if (lowOnly) conditions.push('i.reorder_point > 0 AND i.on_hand <= i.reorder_point');

  return req.db
    .prepare(
      `SELECT i.variant_id, i.on_hand, i.reorder_point, v.sku, v.barcode, v.texture, v.length,
              v.colour, v.cost_cents, p.name, p.id AS product_id
         FROM inventory i
         JOIN variants v ON v.id = i.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.sort_order, p.name, v.sort_order
        LIMIT 400`,
    )
    .all(...params)
    .map((row) => ({ ...row, is_kit: componentsOf(req.db, row.variant_id).length > 0 }));
}

adminRouter.get('/inventory', (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const lowOnly = req.query.low === '1';

  send(
    res,
    inventoryPage({
      user: req.user,
      rows: inventoryRows(req, { search, lowOnly }),
      ledger: stockLedger(req.db, {
        variantId: req.query.variant ? Number(req.query.variant) : null,
        limit: 60,
      }),
      csrf: req.csrf,
      filter: search,
      lowOnly,
      flash: flashFrom(req.query),
    }),
  );
});

adminRouter.post('/inventory/adjust', (req, res) => {
  const variantId = Number(req.body.variantId);
  const delta = Number(req.body.delta);

  if (!Number.isInteger(delta) || delta === 0) {
    return res.redirect('/admin/inventory?error=Enter+a+whole+number+to+add+or+take+away');
  }

  const current = req.db
    .prepare('SELECT on_hand FROM inventory WHERE variant_id = ? AND location_id = ?')
    .get(variantId, req.location.id);
  if (current && current.on_hand + delta < 0) {
    return res.redirect(
      `/admin/inventory?error=That+would+leave+${current.on_hand + delta}+on+hand`,
    );
  }

  applyMovement(req.db, {
    variantId,
    locationId: req.location.id,
    delta,
    reason: (req.body.reason || 'Adjustment').trim(),
    userId: req.user.id,
  });

  res.redirect('/admin/inventory?saved=Stock+adjusted');
});

adminRouter.post('/inventory/reorder-point', (req, res) => {
  req.db
    .prepare(
      `UPDATE inventory SET reorder_point = ?, updated_at = datetime('now')
        WHERE variant_id = ? AND location_id = ?`,
    )
    .run(Math.max(0, Number(req.body.reorder) || 0), Number(req.body.variantId), req.location.id);

  res.redirect('/admin/inventory?saved=Reorder+point+updated');
});

adminRouter.get('/inventory/receive', (req, res) => {
  send(
    res,
    receivePage({
      user: req.user,
      variants: inventoryRows(req).filter((row) => !row.is_kit),
      csrf: req.csrf,
      flash: flashFrom(req.query),
    }),
  );
});

adminRouter.post('/inventory/receive', (req, res) => {
  const lines = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (!key.startsWith('qty-')) continue;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    const variantId = Number(key.slice(4));
    const costField = req.body[`cost-${variantId}`];
    lines.push({ variantId, quantity, costCents: costField ? toCents(costField) : null });
  }

  if (lines.length === 0) {
    return res.redirect('/admin/inventory/receive?error=Enter+a+quantity+against+at+least+one+line');
  }

  const reference = transaction(req.db, () => {
    const count = req.db.prepare('SELECT COUNT(*) AS count FROM stock_receipts').get().count;
    const ref = `GRN-${String(count + 1).padStart(4, '0')}`;

    const receipt = req.db
      .prepare(
        'INSERT INTO stock_receipts (reference, supplier, location_id, note, user_id) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        ref,
        (req.body.supplier || '').trim() || null,
        req.location.id,
        (req.body.note || '').trim() || null,
        req.user.id,
      );
    const receiptId = Number(receipt.lastInsertRowid);

    for (const line of lines) {
      req.db
        .prepare(
          'INSERT INTO stock_receipt_items (receipt_id, variant_id, quantity, cost_cents) VALUES (?, ?, ?, ?)',
        )
        .run(receiptId, line.variantId, line.quantity, line.costCents);

      // Receiving is also the moment to update what the stock costs.
      if (line.costCents !== null) {
        req.db.prepare('UPDATE variants SET cost_cents = ? WHERE id = ?').run(line.costCents, line.variantId);
      }

      applyMovement(req.db, {
        variantId: line.variantId,
        locationId: req.location.id,
        delta: line.quantity,
        reason: 'Received',
        referenceType: 'receipt',
        referenceId: receiptId,
        userId: req.user.id,
      });
    }

    return ref;
  });

  res.redirect(`/admin/inventory?saved=Booked+in+as+${reference}`);
});

/* ----------------------------------------------------------- customers */

adminRouter.get('/customers', (req, res) => {
  const customers = req.db
    .prepare(
      `SELECT c.*,
              COUNT(o.id) AS orders,
              COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total_cents ELSE 0 END), 0) AS spent_cents
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
        ORDER BY spent_cents DESC, c.id DESC
        LIMIT 300`,
    )
    .all();

  send(res, customersPage({ user: req.user, customers }));
});

/* ------------------------------------------------------------- reports */

adminRouter.get('/reports', (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;

  send(
    res,
    reportsPage({
      user: req.user,
      days,
      byDay: salesByDay(req.db, days),
      top: topProducts(req.db, { days }),
      channels: salesByChannel(req.db, days),
      payments: paymentMix(req.db, days),
      margin: marginReport(req.db, days),
    }),
  );
});

/* ------------------------------------------------------------ settings */

adminRouter.get('/settings', (req, res) => {
  send(
    res,
    settingsPage({
      user: req.user,
      settings: req.settings,
      hours: storeHours(req.db),
      rates: req.db.prepare('SELECT * FROM delivery_rates ORDER BY parish').all(),
      staff: req.db.prepare('SELECT * FROM users ORDER BY name').all(),
      csrf: req.csrf,
      flash: flashFrom(req.query),
    }),
  );
});

adminRouter.post('/settings', (req, res) => {
  const keys = [
    'store_name',
    'store_tagline',
    'store_phone',
    'store_whatsapp',
    'store_email',
    'store_address',
    'store_parish',
    'store_maps_url',
    'instagram',
    'instagram_beauty',
    'instagram_cropover',
    'tiktok',
    'receipt_footer',
  ];
  const values = {};
  for (const key of keys) {
    if (typeof req.body[key] === 'string') values[key] = req.body[key].trim();
  }
  setSettings(req.db, values);
  res.redirect('/admin/settings?saved=Shop+details+saved');
});

adminRouter.post('/settings/delivery', (req, res) => {
  setSettings(req.db, {
    same_day_cutoff: (req.body.same_day_cutoff || '15:30').trim(),
    delivery_window: (req.body.delivery_window || '10am to 5pm').trim(),
    delivery_special_threshold_cents: toCents(req.body.delivery_special_threshold || 150),
  });

  for (const [key, value] of Object.entries(req.body)) {
    if (key.startsWith('rate-')) {
      req.db
        .prepare('UPDATE delivery_rates SET rate_cents = ? WHERE id = ?')
        .run(toCents(value), Number(key.slice(5)));
    }
    if (key.startsWith('special-')) {
      req.db
        .prepare('UPDATE delivery_rates SET special_cents = ? WHERE id = ?')
        .run(toCents(value), Number(key.slice(8)));
    }
  }

  res.redirect('/admin/settings?saved=Delivery+saved');
});

adminRouter.post('/settings/hours', (req, res) => {
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const closed = req.body[`closed-${weekday}`] === '1' ? 1 : 0;
    const opens = (req.body[`opens-${weekday}`] || '').trim() || null;
    const closes = (req.body[`closes-${weekday}`] || '').trim() || null;

    req.db
      .prepare(
        `INSERT INTO store_hours (weekday, opens, closes, closed) VALUES (?, ?, ?, ?)
         ON CONFLICT (weekday) DO UPDATE SET opens = excluded.opens, closes = excluded.closes, closed = excluded.closed`,
      )
      .run(weekday, opens, closes, closed);
  }

  res.redirect('/admin/settings?saved=Opening+hours+saved');
});

adminRouter.post('/settings/staff', requireRole('admin', '/admin/signin'), (req, res) => {
  const email = (req.body.email || '').trim();
  const name = (req.body.name || '').trim();
  const password = req.body.password || '';
  const role = ['cashier', 'manager', 'admin'].includes(req.body.role) ? req.body.role : 'cashier';
  const pin = (req.body.pin || '').trim();

  if (!email || !name || password.length < 10) {
    return res.redirect('/admin/settings?error=A+staff+member+needs+a+name,+email+and+a+10+character+password');
  }
  if (req.db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.redirect('/admin/settings?error=That+email+already+has+an+account');
  }
  if (pin && req.db.prepare('SELECT 1 FROM users WHERE pin = ?').get(pin)) {
    return res.redirect('/admin/settings?error=That+PIN+is+already+taken');
  }

  createUser(req.db, { email, name, password, role, pin: pin || null });
  res.redirect('/admin/settings?saved=Staff+member+added');
});

adminRouter.post('/settings/staff/:id/toggle', requireRole('admin', '/admin/signin'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.redirect('/admin/settings?error=You+cannot+disable+your+own+account');
  }
  req.db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(id);
  res.redirect('/admin/settings?saved=Staff+updated');
});

adminRouter.post('/settings/password', (req, res) => {
  const current = req.body.current || '';
  const next_ = req.body.password || '';

  if (!bcrypt.compareSync(current, req.user.password_hash)) {
    return res.redirect('/admin/settings?error=Your+current+password+did+not+match');
  }
  if (next_.length < 10) {
    return res.redirect('/admin/settings?error=Use+at+least+10+characters');
  }

  req.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next_), req.user.id);
  res.redirect('/admin/settings?saved=Password+updated');
});
