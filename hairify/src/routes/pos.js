import express from 'express';
import { toString, jsonScript, html } from '../lib/html.js';
import { findVariantByCode, getVariant, searchVariants, variantLabel } from '../lib/catalog.js';
import { availableStock } from '../lib/inventory.js';
import { getOrder, getOrderByReference, placeOrder, refundOrder } from '../lib/orders.js';
import {
  closeShift,
  currentShift,
  holdSale,
  listHeldSales,
  openShift,
  recentSales,
  recordCashMovement,
  shiftById,
  shiftSummary,
  takeHeldSale,
} from '../lib/pos.js';
import { createSession, destroySession, verifyLogin, verifyPin } from '../lib/auth.js';
import { getSettings, defaultLocation } from '../lib/settings.js';
import { toCents } from '../lib/money.js';
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
  heldPage,
  openShiftPage,
  receiptPage,
  saleDetailPage,
  salesPage,
  shiftClosedPage,
  shiftPage,
  tillPage,
} from '../views/pos.js';

export const posRouter = express.Router();

posRouter.use(loadUser);

function send(res, page) {
  res.type('html').send(toString(page));
}

/* ----------------------------------------------------------- signing in */

posRouter.get('/signin', (req, res) => {
  if (req.user) return res.redirect(safeNext(req.query.next, '/pos'));
  send(
    res,
    signInPage({
      title: 'Till sign in',
      subtitle: 'Sign in to open the till.',
      action: '/pos/signin',
      csrf: req.csrf,
      nextUrl: safeNext(req.query.next, '/pos'),
      withPin: true,
    }),
  );
});

posRouter.post('/signin', verifyCsrf, (req, res) => {
  const nextUrl = safeNext(req.body.next, '/pos');
  const user = req.body.pin
    ? verifyPin(req.db, req.body.pin)
    : verifyLogin(req.db, (req.body.email || '').trim(), req.body.password || '');

  if (!user) {
    return send(
      res,
      signInPage({
        title: 'Till sign in',
        subtitle: 'Sign in to open the till.',
        action: '/pos/signin',
        csrf: req.csrf,
        nextUrl,
        withPin: true,
        error: req.body.pin ? 'That PIN was not recognised.' : 'Those details did not match.',
      }),
    );
  }

  res.cookie(SESSION_COOKIE, createSession(req.db, user.id), sessionCookieOptions(req));
  res.redirect(nextUrl);
});

posRouter.get('/signout', (req, res) => {
  destroySession(req.db, req.cookies[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.redirect('/pos/signin');
});

/* ------------------------------------------------- everything below needs a till user */

posRouter.use(requireRole('cashier', '/pos/signin'));
posRouter.use(verifyCsrf);

/** Puts the register, its open shift and the shop settings on the request. */
posRouter.use((req, res, next) => {
  const location = defaultLocation(req.db);
  req.register =
    req.db.prepare('SELECT * FROM pos_registers WHERE active = 1 AND location_id = ? ORDER BY id LIMIT 1').get(location.id) ||
    req.db.prepare('SELECT * FROM pos_registers WHERE active = 1 ORDER BY id LIMIT 1').get();

  if (!req.register) {
    return res
      .status(500)
      .type('html')
      .send('<p>No till is set up yet. Add one in Admin → Settings.</p>');
  }

  req.location = location;
  req.shift = currentShift(req.db, req.register.id);
  req.settings = getSettings(req.db);
  next();
});

function requireShift(req, res, next) {
  if (!req.shift) return res.redirect('/pos/shift/open');
  next();
}

/* ---------------------------------------------------------------- shift */

posRouter.get('/shift/open', (req, res) => {
  if (req.shift) return res.redirect('/pos');
  send(res, openShiftPage({ user: req.user, register: req.register, csrf: req.csrf }));
});

posRouter.post('/shift/open', (req, res) => {
  const float = toCents(req.body.float || 0);
  if (!Number.isFinite(float) || float < 0) {
    return send(
      res,
      openShiftPage({
        user: req.user,
        register: req.register,
        csrf: req.csrf,
        error: 'Enter the opening float as an amount, for example 200.00.',
      }),
    );
  }

  openShift(req.db, { registerId: req.register.id, userId: req.user.id, openingFloatCents: float });
  res.redirect('/pos');
});

posRouter.get('/shift', requireShift, (req, res) => {
  send(
    res,
    shiftPage({
      user: req.user,
      shift: req.shift,
      summary: shiftSummary(req.db, req.shift.id),
      csrf: req.csrf,
      flash: req.query.saved ? { kind: 'ok', message: 'Recorded.' } : null,
    }),
  );
});

posRouter.post('/shift/cash', requireShift, (req, res) => {
  const amount = toCents(req.body.amount || 0);
  const type = ['pay-in', 'pay-out', 'drop'].includes(req.body.type) ? req.body.type : 'pay-in';
  if (amount > 0) {
    recordCashMovement(req.db, {
      shiftId: req.shift.id,
      type,
      // Money leaving the drawer is a negative movement, so the expected
      // balance is always the sum of the column.
      amountCents: type === 'pay-in' ? amount : -amount,
      reason: (req.body.reason || '').trim(),
      userId: req.user.id,
    });
  }
  res.redirect('/pos/shift?saved=1');
});

posRouter.post('/shift/close', requireShift, (req, res) => {
  const shift = closeShift(req.db, req.shift.id, {
    countedCents: toCents(req.body.counted || 0),
    note: (req.body.note || '').trim(),
    userId: req.user.id,
  });
  send(res, shiftClosedPage({ user: req.user, shift }));
});

posRouter.get('/shift/:id/summary', (req, res, next) => {
  const shift = shiftById(req.db, Number(req.params.id));
  if (!shift) return next();
  if (shift.status === 'closed') return send(res, shiftClosedPage({ user: req.user, shift }));
  send(res, shiftPage({ user: req.user, shift, summary: shiftSummary(req.db, shift.id), csrf: req.csrf }));
});

/* ----------------------------------------------------------------- till */

posRouter.get('/', requireShift, (req, res) => {
  // A handful of fast movers so the till is useful before anyone types.
  const quickPicks = req.db
    .prepare(
      `SELECT v.*, p.name, p.unit_label
         FROM variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.active = 1 AND p.active = 1 AND p.featured = 1
        ORDER BY p.sort_order, v.sort_order
        LIMIT 12`,
    )
    .all()
    .map((variant) => ({
      ...variant,
      label: variantLabel(variant),
      stock: availableStock(req.db, variant.id, req.location.id),
    }));

  send(
    res,
    tillPage({
      user: req.user,
      shift: req.shift,
      settings: req.settings,
      csrf: req.csrf,
      heldCount: listHeldSales(req.db, req.register.id).length,
      quickPicks,
    }),
  );
});

posRouter.get('/api/search', requireShift, (req, res) => {
  const term = String(req.query.q || '').trim();
  if (!term) return res.json({ results: [] });

  // An exact barcode or SKU goes straight onto the ticket.
  const exact = findVariantByCode(req.db, term);
  if (exact) {
    return res.json({
      exact: {
        ...exact,
        label: variantLabel(exact),
        stock: availableStock(req.db, exact.id, req.location.id),
      },
      results: [],
    });
  }

  res.json({ results: searchVariants(req.db, term, req.location.id) });
});

posRouter.get('/api/variant/:id', requireShift, (req, res) => {
  const variant = getVariant(req.db, Number(req.params.id));
  if (!variant) return res.status(404).json({ error: 'We could not find that item.' });
  res.json({
    ...variant,
    label: variantLabel(variant),
    stock: availableStock(req.db, variant.id, req.location.id),
  });
});

posRouter.post('/api/sale', requireShift, (req, res) => {
  const { lines, payments, customerName } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'There is nothing on this sale.' });
  }

  const cleanLines = lines.map((line) => ({
    variantId: Number(line.variantId),
    quantity: Math.max(1, Number(line.quantity) || 1),
    discountCents: Math.max(0, Number(line.discountCents) || 0),
  }));

  const cleanPayments = (Array.isArray(payments) ? payments : []).map((payment) => ({
    method: payment.method === 'card' ? 'card' : 'cash',
    amountCents: Math.round(Number(payment.amountCents) || 0),
    tenderedCents: payment.tenderedCents ? Math.round(Number(payment.tenderedCents)) : null,
  }));

  // The till works its own total out from prices in the database rather than
  // trusting the browser's, so a stale page or a tampered request cannot ring
  // up a sale for the wrong money.
  const expectedTotalCents = cleanLines.reduce((sum, line) => {
    const variant = req.db.prepare('SELECT price_cents FROM variants WHERE id = ?').get(line.variantId);
    if (!variant) {
      const error = new Error('That item is no longer in the catalogue.');
      error.status = 400;
      throw error;
    }
    return sum + variant.price_cents * line.quantity - line.discountCents;
  }, 0);

  const paidCents = cleanPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (paidCents !== expectedTotalCents) {
    return res.status(409).json({
      error:
        `The payment comes to $${(paidCents / 100).toFixed(2)} but the sale is ` +
        `$${(expectedTotalCents / 100).toFixed(2)}. Reload the till and ring it up again.`,
    });
  }

  for (const payment of cleanPayments) {
    if (payment.method === 'cash' && payment.tenderedCents !== null && payment.tenderedCents < payment.amountCents) {
      return res.status(400).json({ error: 'The cash tendered is less than the cash part of the sale.' });
    }
  }

  let order;
  try {
    order = placeOrder(req.db, {
      lines: cleanLines,
      channel: 'pos',
      fulfilment: 'in-store',
      customer: customerName ? { name: customerName } : null,
      locationId: req.location.id,
      paymentMethod: cleanPayments.map((payment) => payment.method).join('+') || 'cash',
      status: 'completed',
      shiftId: req.shift.id,
      userId: req.user.id,
      payments: cleanPayments,
    });
  } catch (error) {
    if (error.code === 'OUT_OF_STOCK') {
      const names = error.shortfalls
        .map((item) => `${item.name} (${item.onHand} left)`)
        .join(', ');
      return res.status(409).json({ error: `Not enough stock: ${names}` });
    }
    throw error;
  }

  // Change is worked out from the cash tendered, not stored on the order.
  const cashPayment = cleanPayments.find((payment) => payment.method === 'cash');
  const changeCents = cashPayment?.tenderedCents
    ? Math.max(0, cashPayment.tenderedCents - cashPayment.amountCents)
    : 0;

  res.json({
    reference: order.reference,
    changeCents,
    receiptUrl: `/pos/receipt/${order.reference}?change=${changeCents}`,
  });
});

posRouter.get('/receipt/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();
  send(
    res,
    receiptPage({
      user: req.user,
      order,
      settings: req.settings,
      changeCents: Math.max(0, Number(req.query.change) || 0),
    }),
  );
});

/* ---------------------------------------------------------- held sales */

posRouter.post('/api/hold', requireShift, (req, res) => {
  const { label, lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'There is nothing to hold.' });
  }
  const id = holdSale(req.db, {
    registerId: req.register.id,
    userId: req.user.id,
    label: String(label || 'Held sale').slice(0, 80),
    lines,
  });
  res.json({ id });
});

posRouter.get('/held', (req, res) => {
  send(res, heldPage({ user: req.user, held: listHeldSales(req.db, req.register.id), csrf: req.csrf }));
});

posRouter.post('/held/:id/resume', (req, res) => {
  const lines = takeHeldSale(req.db, Number(req.params.id));
  if (!lines) return res.redirect('/pos/held');

  // Hand the parked lines back to the till through sessionStorage, so the
  // ticket comes back exactly as it was left.
  res.type('html').send(
    toString(html`<!doctype html>
      <meta charset="utf-8" />
      <title>Resuming…</title>
      <script id="resumeData" type="application/json">${jsonScript(lines)}</script>
      <script>
        sessionStorage.setItem('hairify-resume', document.getElementById('resumeData').textContent);
        location.replace('/pos');
      </script>
      <noscript><a href="/pos">Continue to the till</a></noscript>`),
  );
});

posRouter.post('/held/:id/delete', (req, res) => {
  takeHeldSale(req.db, Number(req.params.id));
  res.redirect('/pos/held');
});

/* --------------------------------------------------------------- sales */

posRouter.get('/sales', (req, res) => {
  send(res, salesPage({ user: req.user, orders: recentSales(req.db, req.register.id) }));
});

posRouter.get('/sales/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();
  send(res, saleDetailPage({ user: req.user, order, csrf: req.csrf }));
});

posRouter.post('/sales/:reference/refund', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();

  const items = order.items
    .map((item) => ({ orderItemId: item.id, quantity: Number(req.body[`item-${item.id}`]) || 0 }))
    .filter((item) => item.quantity > 0);

  if (items.length === 0) {
    return send(
      res,
      saleDetailPage({
        user: req.user,
        order,
        csrf: req.csrf,
        flash: { kind: 'bad', message: 'Choose how many of each item to refund.' },
      }),
    );
  }

  try {
    const { amountCents } = refundOrder(req.db, order.id, {
      items,
      method: req.body.method === 'card' ? 'card' : 'cash',
      reason: (req.body.reason || '').trim() || null,
      restock: req.body.restock === '1',
      shiftId: req.shift?.id || null,
      userId: req.user.id,
    });

    send(
      res,
      saleDetailPage({
        user: req.user,
        order: getOrder(req.db, order.id),
        csrf: req.csrf,
        flash: {
          kind: 'ok',
          message: `Refunded $${(amountCents / 100).toFixed(2)}${req.body.restock === '1' ? ' and put the stock back.' : '.'}`,
        },
      }),
    );
  } catch (error) {
    send(
      res,
      saleDetailPage({
        user: req.user,
        order: getOrder(req.db, order.id),
        csrf: req.csrf,
        flash: { kind: 'bad', message: error.message },
      }),
    );
  }
});
