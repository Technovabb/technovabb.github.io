/** Till shifts, the cash drawer and held sales. */

import { transaction } from '../db/index.js';

export function openShift(db, { registerId, userId, openingFloatCents }) {
  return transaction(db, () => {
    const existing = db
      .prepare("SELECT * FROM pos_shifts WHERE register_id = ? AND status = 'open'")
      .get(registerId);
    if (existing) return existing;

    const result = db
      .prepare(
        'INSERT INTO pos_shifts (register_id, user_id, opening_float_cents) VALUES (?, ?, ?)',
      )
      .run(registerId, userId, openingFloatCents);
    const shiftId = Number(result.lastInsertRowid);

    if (openingFloatCents > 0) {
      db.prepare(
        `INSERT INTO cash_movements (shift_id, type, amount_cents, reason, user_id)
         VALUES (?, 'float', ?, 'Opening float', ?)`,
      ).run(shiftId, openingFloatCents, userId);
    }
    return db.prepare('SELECT * FROM pos_shifts WHERE id = ?').get(shiftId);
  });
}

export function currentShift(db, registerId) {
  return db
    .prepare(
      `SELECT s.*, u.name AS user_name, r.name AS register_name, r.location_id
         FROM pos_shifts s
         JOIN users u ON u.id = s.user_id
         JOIN pos_registers r ON r.id = s.register_id
        WHERE s.register_id = ? AND s.status = 'open'`,
    )
    .get(registerId);
}

export function shiftById(db, shiftId) {
  return db
    .prepare(
      `SELECT s.*, u.name AS user_name, r.name AS register_name, r.location_id
         FROM pos_shifts s
         JOIN users u ON u.id = s.user_id
         JOIN pos_registers r ON r.id = s.register_id
        WHERE s.id = ?`,
    )
    .get(shiftId);
}

/** What should be in the drawer: float, plus cash in, minus cash out. */
export function expectedCashCents(db, shiftId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM cash_movements WHERE shift_id = ?')
    .get(shiftId);
  return row.total;
}

/** The numbers a cashier sees when closing up. */
export function shiftSummary(db, shiftId) {
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(total_cents), 0) AS gross_cents,
              COALESCE(SUM(discount_cents), 0) AS discount_cents
         FROM orders WHERE shift_id = ?`,
    )
    .get(shiftId);

  const byMethod = db
    .prepare(
      `SELECT method, COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS total_cents
         FROM payments
        WHERE shift_id = ? AND status = 'captured'
        GROUP BY method
        ORDER BY method`,
    )
    .all(shiftId);

  const refunds = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS total_cents
         FROM refunds WHERE shift_id = ?`,
    )
    .get(shiftId);

  const cashMovements = db
    .prepare('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id')
    .all(shiftId);

  return {
    sales,
    byMethod,
    refunds,
    cashMovements,
    expectedCashCents: expectedCashCents(db, shiftId),
  };
}

export function recordCashMovement(db, { shiftId, type, amountCents, reason, userId }) {
  db.prepare(
    `INSERT INTO cash_movements (shift_id, type, amount_cents, reason, user_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(shiftId, type, amountCents, reason, userId);
}

export function closeShift(db, shiftId, { countedCents, note, userId }) {
  return transaction(db, () => {
    const expected = expectedCashCents(db, shiftId);
    db.prepare(
      `UPDATE pos_shifts
          SET status = 'closed', closed_at = datetime('now'),
              counted_cents = ?, expected_cents = ?, variance_cents = ?, note = ?
        WHERE id = ?`,
    ).run(countedCents, expected, countedCents - expected, note || null, shiftId);
    return shiftById(db, shiftId);
  });
}

/* ------------------------------------------------------------- held sales */

export function holdSale(db, { registerId, userId, label, lines }) {
  const result = db
    .prepare('INSERT INTO held_sales (register_id, user_id, label, payload) VALUES (?, ?, ?, ?)')
    .run(registerId, userId, label, JSON.stringify(lines));
  return Number(result.lastInsertRowid);
}

export function listHeldSales(db, registerId) {
  return db
    .prepare(
      `SELECT h.*, u.name AS user_name
         FROM held_sales h LEFT JOIN users u ON u.id = h.user_id
        WHERE h.register_id = ? ORDER BY h.id DESC`,
    )
    .all(registerId)
    .map((row) => ({ ...row, lines: JSON.parse(row.payload) }));
}

export function takeHeldSale(db, id) {
  const row = db.prepare('SELECT * FROM held_sales WHERE id = ?').get(id);
  if (!row) return null;
  db.prepare('DELETE FROM held_sales WHERE id = ?').run(id);
  return JSON.parse(row.payload);
}

/** Recent sales at this register, for reprinting and refunds. */
export function recentSales(db, registerId, limit = 20) {
  return db
    .prepare(
      `SELECT o.*, u.name AS served_by
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN pos_shifts s ON s.id = o.shift_id
        WHERE o.channel = 'pos' AND (s.register_id = ? OR o.shift_id IS NULL)
        ORDER BY o.id DESC
        LIMIT ?`,
    )
    .all(registerId, limit);
}
