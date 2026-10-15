import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { availableStock } from '../src/lib/inventory.js';
import {
  addToCart,
  cartCount,
  cartLines,
  getOrCreateCart,
  nextReference,
  placeOrder,
  quoteDelivery,
  recordPayment,
  refundOrder,
  setCartQuantity,
  totalsFor,
  updateOrderStatus,
} from '../src/lib/orders.js';
import { LOCATION_ID, freshDb, onHand, variantBySku } from './helpers.js';

const db = freshDb();
after(() => db.close());

function sell(sku, quantity = 1, extra = {}) {
  const variant = variantBySku(db, sku);
  return placeOrder(db, {
    lines: [{ variantId: variant.id, quantity }],
    channel: 'online',
    fulfilment: 'pickup',
    locationId: LOCATION_ID,
    status: 'placed',
    ...extra,
  });
}

describe('the bag', () => {
  it('adds the same item twice as one line', () => {
    const cart = getOrCreateCart(db, null);
    const jelly = variantBySku(db, 'GOT2B-JELLY');

    addToCart(db, cart.id, jelly.id, 1);
    addToCart(db, cart.id, jelly.id, 2);

    const lines = cartLines(db, cart.id, LOCATION_ID);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 3);
    assert.equal(cartCount(db, cart.id), 3);
  });

  it('drops a line when its quantity goes to zero', () => {
    const cart = getOrCreateCart(db, null);
    const brush = variantBySku(db, 'EDGE-BRUSH');
    addToCart(db, cart.id, brush.id, 2);

    const [line] = cartLines(db, cart.id, LOCATION_ID);
    setCartQuantity(db, cart.id, line.id, 0);

    assert.equal(cartLines(db, cart.id, LOCATION_ID).length, 0);
  });

  it('prices a bag from the variant prices', () => {
    const cart = getOrCreateCart(db, null);
    addToCart(db, cart.id, variantBySku(db, 'MIRACLE-KINKY-CURLY-18').id, 2);
    addToCart(db, cart.id, variantBySku(db, 'GOT2B-JELLY').id, 1);

    const totals = totalsFor(cartLines(db, cart.id, LOCATION_ID));
    assert.equal(totals.subtotalCents, 26000 * 2 + 3000);
    assert.equal(totals.itemCount, 3);
    assert.equal(totals.totalCents, 55000);
  });
});

describe('delivery charges', () => {
  it('charges the standard rate under the threshold', () => {
    const quote = quoteDelivery(db, 'St. Michael', 5000);
    assert.equal(quote.special, false);
    assert.equal(quote.cents, 1200);
  });

  it('charges the special rate once the basket passes the threshold', () => {
    const quote = quoteDelivery(db, 'St. Michael', 20000);
    assert.equal(quote.special, true);
    assert.equal(quote.cents, 800);
  });

  it('charges the standard rate exactly at the threshold boundary', () => {
    assert.equal(quoteDelivery(db, 'St. Michael', 14999).cents, 1200);
    assert.equal(quoteDelivery(db, 'St. Michael', 15000).cents, 800);
  });

  it('returns nothing for a parish with no rate', () => {
    assert.equal(quoteDelivery(db, 'Nowhere', 20000).cents, null);
  });
});

describe('placing an order', () => {
  it('numbers online orders from HF-1048, as the concept shows', () => {
    assert.equal(nextReference(db, 'HF'), 'HF-1048');
  });

  it('writes the order, its lines and its stock movements together', () => {
    const before = onHand(db, 'GOT2B-FOAM');
    const order = sell('GOT2B-FOAM', 2);

    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].quantity, 2);
    assert.equal(order.subtotal_cents, 6000);
    assert.equal(order.total_cents, 6000);
    assert.equal(onHand(db, 'GOT2B-FOAM'), before - 2);
  });

  it('snapshots the name and options, so an old receipt still reads right', () => {
    const order = sell('MIRACLE-KINKY-CURLY-16', 1);
    assert.equal(order.items[0].name_snapshot, 'Miracle Knots Feather Crochet Hair');
    assert.match(order.items[0].variant_snapshot, /Kinky Curly/);

    db.prepare("UPDATE products SET name = 'Renamed' WHERE slug = 'miracle-knots-feather-crochet'").run();
    const reread = db.prepare('SELECT name_snapshot FROM order_items WHERE id = ?').get(order.items[0].id);
    assert.equal(reread.name_snapshot, 'Miracle Knots Feather Crochet Hair');
    db.prepare(
      "UPDATE products SET name = 'Miracle Knots Feather Crochet Hair' WHERE slug = 'miracle-knots-feather-crochet'",
    ).run();
  });

  it('adds delivery to the total', () => {
    const order = sell('EDGE-BRUSH', 1, { fulfilment: 'delivery', parish: 'St. Lucy', deliveryCents: 2000 });
    assert.equal(order.subtotal_cents, 1000);
    assert.equal(order.delivery_cents, 2000);
    assert.equal(order.total_cents, 3000);
  });

  it('refuses to sell more than the shelf holds, and changes nothing', () => {
    const variant = variantBySku(db, 'VPART-KINKY-CURLY-14');
    const before = availableStock(db, variant.id, LOCATION_ID);

    assert.throws(
      () =>
        placeOrder(db, {
          lines: [{ variantId: variant.id, quantity: before + 10 }],
          channel: 'online',
          fulfilment: 'pickup',
          locationId: LOCATION_ID,
        }),
      (error) => error.code === 'OUT_OF_STOCK',
    );

    assert.equal(availableStock(db, variant.id, LOCATION_ID), before, 'stock is untouched');
  });

  it('refuses an order with no lines', () => {
    assert.throws(
      () => placeOrder(db, { lines: [], channel: 'online', fulfilment: 'pickup', locationId: LOCATION_ID }),
      /at least one line/,
    );
  });
});

describe('payments', () => {
  it('moves an order to paid once the whole total is taken', () => {
    const order = sell('GOT2B-CREAM', 1);
    assert.equal(order.payment_status, 'unpaid');

    recordPayment(db, order.id, { method: 'cash', amountCents: order.total_cents });

    const after_ = db.prepare('SELECT payment_status, paid_cents FROM orders WHERE id = ?').get(order.id);
    assert.equal(after_.payment_status, 'paid');
    assert.equal(after_.paid_cents, order.total_cents);
  });

  it('marks an order part paid when only some is taken', () => {
    const order = sell('BONNET-HAIRIFY-PINK', 1);
    recordPayment(db, order.id, { method: 'cash', amountCents: 500 });

    const after_ = db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(order.id);
    assert.equal(after_.payment_status, 'part-paid');
  });
});

describe('refunds', () => {
  it('refunds a line and puts the stock back', () => {
    const order = sell('STRIP-LASHES-NATURAL', 3);
    recordPayment(db, order.id, { method: 'cash', amountCents: order.total_cents });
    const afterSale = onHand(db, 'STRIP-LASHES-NATURAL');

    const { amountCents } = refundOrder(db, order.id, {
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      method: 'cash',
      restock: true,
    });

    assert.equal(amountCents, 1500);
    assert.equal(onHand(db, 'STRIP-LASHES-NATURAL'), afterSale + 1);

    const reread = db.prepare('SELECT refunded_cents FROM orders WHERE id = ?').get(order.id);
    assert.equal(reread.refunded_cents, 1500);
  });

  it('leaves the stock off the shelf when the goods are damaged', () => {
    const order = sell('EARRINGS-GOLD-HOOP', 2);
    const afterSale = onHand(db, 'EARRINGS-GOLD-HOOP');

    refundOrder(db, order.id, {
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      method: 'cash',
      restock: false,
    });

    assert.equal(onHand(db, 'EARRINGS-GOLD-HOOP'), afterSale);
  });

  it('refunds a discounted line at what the customer actually paid', () => {
    const variant = variantBySku(db, 'FRENCHCURL-22-NATURAL-BLACK');
    const order = placeOrder(db, {
      // Four packs at $35 with $20 off the line.
      lines: [{ variantId: variant.id, quantity: 4, discountCents: 2000 }],
      channel: 'pos',
      fulfilment: 'in-store',
      locationId: LOCATION_ID,
      status: 'completed',
    });
    assert.equal(order.items[0].line_total_cents, 12000);

    const { amountCents } = refundOrder(db, order.id, {
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      method: 'cash',
    });

    assert.equal(amountCents, 3000, 'a quarter of the discounted line, not the list price');
  });

  it('will not refund more than was bought', () => {
    const order = sell('KANIZ-EDGE-GEL', 1);
    assert.throws(
      () =>
        refundOrder(db, order.id, {
          items: [{ orderItemId: order.items[0].id, quantity: 5 }],
          method: 'cash',
        }),
      /can still be refunded/,
    );
  });

  it('will not refund the same unit twice', () => {
    const order = sell('SOFTLOCS-10-NATURAL-BLACK', 1);
    refundOrder(db, order.id, {
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      method: 'cash',
    });

    assert.throws(
      () =>
        refundOrder(db, order.id, {
          items: [{ orderItemId: order.items[0].id, quantity: 1 }],
          method: 'cash',
        }),
      /can still be refunded/,
    );
  });
});

describe('order status', () => {
  it('moves an order along its own flow', () => {
    const order = sell('GOT2B-JELLY', 1, { fulfilment: 'delivery', parish: 'St. James' });
    const packed = updateOrderStatus(db, order.id, 'packed');
    assert.equal(packed.status, 'packed');
  });
});
