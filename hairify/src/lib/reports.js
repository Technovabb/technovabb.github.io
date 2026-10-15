/** Numbers for the back-office dashboard and reports. */

import { lowStock, stockValuation } from './inventory.js';

export function dashboardStats(db, locationId) {
  const today = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS gross_cents
         FROM orders
        WHERE date(placed_at) = date('now') AND status <> 'cancelled'`,
    )
    .get();

  const month = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS gross_cents
         FROM orders
        WHERE placed_at >= date('now', 'start of month') AND status <> 'cancelled'`,
    )
    .get();

  const toPack = db
    .prepare(
      `SELECT COUNT(*) AS count FROM orders
        WHERE channel = 'online' AND status IN ('placed', 'packed')`,
    )
    .get();

  // What is still owed, not the value of the orders it sits on: an order that
  // is part paid only owes the balance.
  const awaitingPayment = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(MAX(0, total_cents - paid_cents + refunded_cents)), 0) AS total_cents
         FROM orders
        WHERE payment_status IN ('unpaid', 'part-paid') AND status <> 'cancelled'`,
    )
    .get();

  return {
    today,
    month,
    toPack: toPack.count,
    awaitingPayment,
    lowStock: lowStock(db, locationId),
    valuation: stockValuation(db, locationId),
    openShifts: db
      .prepare(
        `SELECT s.*, u.name AS user_name, r.name AS register_name
           FROM pos_shifts s JOIN users u ON u.id = s.user_id JOIN pos_registers r ON r.id = s.register_id
          WHERE s.status = 'open'`,
      )
      .all(),
  };
}

/** Sales per day for the last `days` days, oldest first. */
export function salesByDay(db, days = 30) {
  return db
    .prepare(
      `SELECT date(placed_at) AS day,
              COUNT(*) AS orders,
              COALESCE(SUM(total_cents), 0) AS gross_cents,
              COALESCE(SUM(CASE WHEN channel = 'online' THEN total_cents ELSE 0 END), 0) AS online_cents,
              COALESCE(SUM(CASE WHEN channel = 'pos' THEN total_cents ELSE 0 END), 0) AS pos_cents
         FROM orders
        WHERE placed_at >= date('now', ?) AND status <> 'cancelled'
        GROUP BY date(placed_at)
        ORDER BY day`,
    )
    .all(`-${days} days`);
}

export function topProducts(db, { days = 30, limit = 15 } = {}) {
  return db
    .prepare(
      `SELECT oi.name_snapshot AS name,
              SUM(oi.quantity) AS units,
              SUM(oi.line_total_cents) AS revenue_cents,
              COUNT(DISTINCT oi.order_id) AS orders
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.placed_at >= date('now', ?) AND o.status <> 'cancelled'
        GROUP BY oi.name_snapshot
        ORDER BY revenue_cents DESC
        LIMIT ?`,
    )
    .all(`-${days} days`, limit);
}

export function salesByChannel(db, days = 30) {
  return db
    .prepare(
      `SELECT channel, COUNT(*) AS orders, COALESCE(SUM(total_cents), 0) AS gross_cents
         FROM orders
        WHERE placed_at >= date('now', ?) AND status <> 'cancelled'
        GROUP BY channel`,
    )
    .all(`-${days} days`);
}

export function paymentMix(db, days = 30) {
  return db
    .prepare(
      `SELECT p.method, COUNT(*) AS count, COALESCE(SUM(p.amount_cents), 0) AS total_cents
         FROM payments p
        WHERE p.created_at >= date('now', ?) AND p.status = 'captured'
        GROUP BY p.method
        ORDER BY total_cents DESC`,
    )
    .all(`-${days} days`);
}

/** Margin on what was sold, using the cost held against each variant. */
export function marginReport(db, days = 30) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(oi.line_total_cents), 0) AS revenue_cents,
              COALESCE(SUM(COALESCE(v.cost_cents, 0) * oi.quantity), 0) AS cost_cents
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN variants v ON v.id = oi.variant_id
        WHERE o.placed_at >= date('now', ?) AND o.status <> 'cancelled'`,
    )
    .get(`-${days} days`);
}

export function stockLedger(db, { variantId = null, limit = 100 } = {}) {
  const where = variantId ? 'WHERE m.variant_id = ?' : '';
  const params = variantId ? [variantId, limit] : [limit];
  return db
    .prepare(
      `SELECT m.*, v.sku, v.texture, v.length, v.colour, p.name, u.name AS user_name
         FROM stock_movements m
         JOIN variants v ON v.id = m.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN users u ON u.id = m.user_id
         ${where}
        ORDER BY m.id DESC
        LIMIT ?`,
    )
    .all(...params);
}
