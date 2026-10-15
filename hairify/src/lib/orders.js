/** Carts, order placement, payments and refunds. */

import { randomBytes } from 'node:crypto';
import { transaction } from '../db/index.js';
import { applyMovement, availableStock, checkAvailability } from './inventory.js';
import { variantLabel } from './catalog.js';
import { getSettings } from './settings.js';
import { deliveryCostCents } from './store.js';

export function newCartToken() {
  return randomBytes(18).toString('base64url');
}

export function getOrCreateCart(db, token) {
  if (token) {
    const existing = db.prepare('SELECT * FROM carts WHERE token = ?').get(token);
    if (existing) return existing;
  }
  const freshToken = token || newCartToken();
  db.prepare('INSERT INTO carts (token) VALUES (?)').run(freshToken);
  return db.prepare('SELECT * FROM carts WHERE token = ?').get(freshToken);
}

/** Cart lines with everything the basket needs to render and price itself. */
export function cartLines(db, cartId, locationId) {
  const rows = db
    .prepare(
      `SELECT ci.id, ci.variant_id, ci.quantity,
              v.sku, v.texture, v.length, v.colour, v.price_cents,
              p.id AS product_id, p.name, p.slug, p.unit_label, p.kind
         FROM cart_items ci
         JOIN variants v ON v.id = ci.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id`,
    )
    .all(cartId);

  const image = db.prepare(
    'SELECT url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id LIMIT 1',
  );

  return rows.map((row) => ({
    ...row,
    label: variantLabel(row),
    image: image.get(row.product_id)?.url || null,
    line_total_cents: row.price_cents * row.quantity,
    stock: locationId ? availableStock(db, row.variant_id, locationId) : null,
  }));
}

export function cartCount(db, cartId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(quantity), 0) AS count FROM cart_items WHERE cart_id = ?')
    .get(cartId);
  return row.count;
}

export function addToCart(db, cartId, variantId, quantity = 1) {
  db.prepare(
    `INSERT INTO cart_items (cart_id, variant_id, quantity)
          VALUES (?, ?, ?)
     ON CONFLICT (cart_id, variant_id)
       DO UPDATE SET quantity = quantity + excluded.quantity`,
  ).run(cartId, variantId, quantity);
  touchCart(db, cartId);
}

export function setCartQuantity(db, cartId, itemId, quantity) {
  if (quantity <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cartId);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?').run(
      quantity,
      itemId,
      cartId,
    );
  }
  touchCart(db, cartId);
}

export function removeCartItem(db, cartId, itemId) {
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(itemId, cartId);
  touchCart(db, cartId);
}

export function clearCart(db, cartId) {
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);
  touchCart(db, cartId);
}

function touchCart(db, cartId) {
  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cartId);
}

/** Basket maths. `lines` may come from a cart or from the POS. */
export function totalsFor(lines, { deliveryCents = 0, discountCents = 0 } = {}) {
  const subtotalCents = lines.reduce(
    (sum, line) => sum + (line.line_total_cents ?? line.price_cents * line.quantity),
    0,
  );
  const itemDiscounts = lines.reduce((sum, line) => sum + (line.discount_cents || 0), 0);
  const totalDiscount = discountCents + itemDiscounts;
  return {
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents,
    discountCents: totalDiscount,
    deliveryCents,
    totalCents: Math.max(0, subtotalCents - totalDiscount + deliveryCents),
  };
}

/** The delivery charge for a parish at a given basket value. */
export function quoteDelivery(db, parish, subtotalCents) {
  const settings = getSettings(db);
  const rate = db.prepare('SELECT * FROM delivery_rates WHERE parish = ? AND active = 1').get(parish);
  if (!rate) return { cents: null, rate: null, special: false };

  const threshold = Number(settings.delivery_special_threshold_cents || 15000);
  const special = subtotalCents >= threshold;
  return {
    cents: deliveryCostCents(rate, subtotalCents, threshold),
    rate,
    special,
    thresholdCents: threshold,
  };
}

/** `HF-1048` style references, continuing from the highest already issued. */
export function nextReference(db, prefix) {
  const row = db
    .prepare(
      `SELECT reference FROM orders WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`,
    )
    .get(`${prefix}-%`);
  const last = row ? Number(row.reference.split('-')[1]) : 1047;
  return `${prefix}-${last + 1}`;
}

export function findOrCreateCustomer(db, { name, email, phone, parish, address }) {
  const existing = phone
    ? db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone)
    : email
      ? db.prepare('SELECT * FROM customers WHERE email = ?').get(email)
      : null;

  if (existing) {
    db.prepare(
      `UPDATE customers
          SET name = COALESCE(NULLIF(?, ''), name),
              email = COALESCE(NULLIF(?, ''), email),
              parish = COALESCE(NULLIF(?, ''), parish),
              address = COALESCE(NULLIF(?, ''), address)
        WHERE id = ?`,
    ).run(name || '', email || '', parish || '', address || '', existing.id);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
  }

  const result = db
    .prepare('INSERT INTO customers (name, email, phone, parish, address) VALUES (?, ?, ?, ?, ?)')
    .run(name || null, email || null, phone || null, parish || null, address || null);
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * Writes an order, its items and its stock movements in one transaction.
 *
 * `lines` are `{ variantId, quantity, unitPriceCents?, discountCents? }`.
 * Stock is checked inside the transaction, so two tills cannot sell the last
 * pack at the same time.
 */
export function placeOrder(
  db,
  {
    lines,
    channel,
    fulfilment,
    customer = null,
    locationId,
    parish = null,
    address = null,
    deliveryNotes = null,
    deliveryCents = 0,
    discountCents = 0,
    paymentMethod = null,
    paymentStatus = 'unpaid',
    status = 'placed',
    promisedWindow = null,
    sameDay = false,
    shiftId = null,
    userId = null,
    payments = [],
  },
) {
  if (!lines || lines.length === 0) throw new Error('An order needs at least one line.');

  return transaction(db, () => {
    const availability = checkAvailability(
      db,
      lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      locationId,
    );
    if (!availability.ok) {
      const error = new Error('Some items are no longer in stock.');
      error.code = 'OUT_OF_STOCK';
      error.shortfalls = availability.shortfalls;
      throw error;
    }

    const priced = lines.map((line) => {
      const variant = db
        .prepare(
          `SELECT v.*, p.name FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`,
        )
        .get(line.variantId);
      if (!variant) throw new Error(`Variant ${line.variantId} no longer exists.`);

      const unitPriceCents = line.unitPriceCents ?? variant.price_cents;
      const lineDiscount = line.discountCents || 0;
      return {
        ...line,
        variant,
        unitPriceCents,
        discountCents: lineDiscount,
        lineTotalCents: unitPriceCents * line.quantity - lineDiscount,
      };
    });

    const subtotalCents = priced.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const lineDiscounts = priced.reduce((sum, line) => sum + line.discountCents, 0);
    const totalDiscount = discountCents + lineDiscounts;
    const totalCents = Math.max(0, subtotalCents - totalDiscount + deliveryCents);

    const customerId = customer ? findOrCreateCustomer(db, customer).id : null;
    const reference = nextReference(db, channel === 'pos' ? 'HP' : 'HF');

    const orderResult = db
      .prepare(
        `INSERT INTO orders
           (reference, customer_id, channel, status, fulfilment, parish, address, delivery_notes,
            subtotal_cents, discount_cents, delivery_cents, total_cents, payment_method,
            payment_status, promised_window, same_day, location_id, shift_id, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reference,
        customerId,
        channel,
        status,
        fulfilment,
        parish,
        address,
        deliveryNotes,
        subtotalCents,
        totalDiscount,
        deliveryCents,
        totalCents,
        paymentMethod,
        paymentStatus,
        promisedWindow,
        sameDay ? 1 : 0,
        locationId,
        shiftId,
        userId,
      );

    const orderId = Number(orderResult.lastInsertRowid);

    for (const line of priced) {
      db.prepare(
        `INSERT INTO order_items
           (order_id, variant_id, name_snapshot, variant_snapshot, sku_snapshot,
            unit_price_cents, quantity, discount_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        orderId,
        line.variantId,
        line.variant.name,
        variantLabel(line.variant) || null,
        line.variant.sku,
        line.unitPriceCents,
        line.quantity,
        line.discountCents,
        line.lineTotalCents,
      );

      applyMovement(db, {
        variantId: line.variantId,
        locationId,
        delta: -line.quantity,
        reason: channel === 'pos' ? 'POS sale' : 'Online order',
        referenceType: 'order',
        referenceId: orderId,
        userId,
      });
    }

    for (const payment of payments) {
      recordPayment(db, orderId, { ...payment, shiftId, userId });
    }

    return getOrder(db, orderId);
  });
}

export function recordPayment(
  db,
  orderId,
  { method, amountCents, tenderedCents = null, changeCents = null, status = 'captured', providerRef = null, shiftId = null, userId = null },
) {
  db.prepare(
    `INSERT INTO payments
       (order_id, method, amount_cents, tendered_cents, change_cents, status, provider_ref, shift_id, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(orderId, method, amountCents, tenderedCents, changeCents, status, providerRef, shiftId, userId);

  if (status === 'captured') {
    db.prepare('UPDATE orders SET paid_cents = paid_cents + ? WHERE id = ?').run(amountCents, orderId);
    syncPaymentStatus(db, orderId);

    if (shiftId && method === 'cash') {
      db.prepare(
        `INSERT INTO cash_movements (shift_id, type, amount_cents, reason, order_id, user_id)
         VALUES (?, 'sale', ?, 'Cash sale', ?, ?)`,
      ).run(shiftId, amountCents, orderId, userId);
    }
  }
}

/** Keeps payment_status in step with what has actually been taken. */
export function syncPaymentStatus(db, orderId) {
  const order = db
    .prepare('SELECT total_cents, paid_cents, refunded_cents FROM orders WHERE id = ?')
    .get(orderId);
  if (!order) return;

  const net = order.paid_cents - order.refunded_cents;
  let status = 'unpaid';
  if (order.refunded_cents > 0 && net <= 0) status = 'refunded';
  else if (net >= order.total_cents && order.total_cents > 0) status = 'paid';
  else if (net > 0) status = 'part-paid';

  db.prepare("UPDATE orders SET payment_status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    orderId,
  );
}

export function getOrder(db, id) {
  const order = db
    .prepare(
      `SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
              u.name AS served_by, l.name AS location_name
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN users u ON u.id = o.user_id
         LEFT JOIN locations l ON l.id = o.location_id
        WHERE o.id = ?`,
    )
    .get(id);
  if (!order) return null;

  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  order.payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id').all(id);
  order.refunds = db.prepare('SELECT * FROM refunds WHERE order_id = ? ORDER BY id').all(id);
  return order;
}

export function getOrderByReference(db, reference) {
  const row = db.prepare('SELECT id FROM orders WHERE reference = ?').get(reference);
  return row ? getOrder(db, row.id) : null;
}

export const ORDER_STATUS_FLOW = {
  delivery: ['placed', 'packed', 'out-for-delivery', 'completed'],
  pickup: ['placed', 'packed', 'ready-for-pickup', 'completed'],
  'in-store': ['completed'],
};

export function updateOrderStatus(db, orderId, status) {
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    orderId,
  );
  return getOrder(db, orderId);
}

/**
 * Refunds whole units of specific order lines, putting them back on the shelf
 * unless `restock` is false (damaged goods).
 */
export function refundOrder(
  db,
  orderId,
  { items, method = 'cash', reason = null, restock = true, shiftId = null, userId = null },
) {
  return transaction(db, () => {
    const order = getOrder(db, orderId);
    if (!order) throw new Error('Order not found.');

    let amountCents = 0;
    const refundLines = [];

    for (const entry of items) {
      const item = order.items.find((candidate) => candidate.id === Number(entry.orderItemId));
      if (!item) throw new Error('That line is not on this order.');

      const remaining = item.quantity - item.refunded_qty;
      const quantity = Number(entry.quantity);
      if (quantity <= 0) continue;
      if (quantity > remaining) {
        throw new Error(`Only ${remaining} of "${item.name_snapshot}" can still be refunded.`);
      }

      // Refund the line's share of its own discount along with it.
      const perUnit = Math.round(item.line_total_cents / item.quantity);
      const lineAmount = perUnit * quantity;
      amountCents += lineAmount;
      refundLines.push({ item, quantity, lineAmount });
    }

    if (amountCents <= 0) throw new Error('Nothing was selected to refund.');

    const refundResult = db
      .prepare(
        `INSERT INTO refunds (order_id, amount_cents, method, reason, restocked, shift_id, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(orderId, amountCents, method, reason, restock ? 1 : 0, shiftId, userId);
    const refundId = Number(refundResult.lastInsertRowid);

    for (const line of refundLines) {
      db.prepare(
        'INSERT INTO refund_items (refund_id, order_item_id, quantity, amount_cents) VALUES (?, ?, ?, ?)',
      ).run(refundId, line.item.id, line.quantity, line.lineAmount);

      db.prepare('UPDATE order_items SET refunded_qty = refunded_qty + ? WHERE id = ?').run(
        line.quantity,
        line.item.id,
      );

      if (restock && line.item.variant_id) {
        applyMovement(db, {
          variantId: line.item.variant_id,
          locationId: order.location_id,
          delta: line.quantity,
          reason: 'Refund restock',
          referenceType: 'refund',
          referenceId: refundId,
          userId,
        });
      }
    }

    db.prepare('UPDATE orders SET refunded_cents = refunded_cents + ? WHERE id = ?').run(
      amountCents,
      orderId,
    );
    syncPaymentStatus(db, orderId);

    if (shiftId && method === 'cash') {
      db.prepare(
        `INSERT INTO cash_movements (shift_id, type, amount_cents, reason, order_id, user_id)
         VALUES (?, 'refund', ?, ?, ?, ?)`,
      ).run(shiftId, -amountCents, reason || 'Cash refund', orderId, userId);
    }

    return { refundId, amountCents };
  });
}
