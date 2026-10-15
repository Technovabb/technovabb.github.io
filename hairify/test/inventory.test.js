import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
  applyMovement,
  availableStock,
  checkAvailability,
  explodeForStock,
  lowStock,
} from '../src/lib/inventory.js';
import { LOCATION_ID, freshDb, onHand, variantBySku } from './helpers.js';

const db = freshDb();
after(() => db.close());

describe('stock for ordinary variants', () => {
  it('counts what the seed booked in', () => {
    const bundle = variantBySku(db, 'MIRACLE-KINKY-CURLY-18');
    assert.equal(availableStock(db, bundle.id, LOCATION_ID), 6);
  });

  it('writes a ledger row for every movement, with the balance after it', () => {
    const jelly = variantBySku(db, 'GOT2B-JELLY');
    const before = availableStock(db, jelly.id, LOCATION_ID);

    applyMovement(db, {
      variantId: jelly.id,
      locationId: LOCATION_ID,
      delta: -4,
      reason: 'Damaged',
    });

    assert.equal(availableStock(db, jelly.id, LOCATION_ID), before - 4);

    const movement = db
      .prepare('SELECT * FROM stock_movements WHERE variant_id = ? ORDER BY id DESC LIMIT 1')
      .get(jelly.id);
    assert.equal(movement.delta, -4);
    assert.equal(movement.balance_after, before - 4);
    assert.equal(movement.reason, 'Damaged');
  });

  it('refuses a movement of zero', () => {
    const jelly = variantBySku(db, 'GOT2B-JELLY');
    assert.throws(
      () => applyMovement(db, { variantId: jelly.id, locationId: LOCATION_ID, delta: 0, reason: 'No-op' }),
      /non-zero/,
    );
  });
});

describe('kits', () => {
  it('works a box down to the packs it is built from', () => {
    const box = variantBySku(db, 'BOX-MIRACLE-18');
    const bundle = variantBySku(db, 'MIRACLE-KINKY-CURLY-18');

    const parts = explodeForStock(db, box.id, 1);
    const bundlePart = parts.find((part) => part.variantId === bundle.id);
    assert.equal(bundlePart.quantity, 2, 'a box holds two bundles');
    assert.equal(parts.length, 3, 'two bundles, lashes and an edge brush');
  });

  it('reports how many boxes could be built, not a stock figure of its own', () => {
    const box = variantBySku(db, 'BOX-MIRACLE-18');
    // Six bundles at two per box.
    assert.equal(availableStock(db, box.id, LOCATION_ID), 3);
  });

  it('draws the components down when a box is sold', () => {
    const box = variantBySku(db, 'BOX-MIRACLE-14');
    const bundlesBefore = onHand(db, 'MIRACLE-KINKY-CURLY-14');
    const brushesBefore = onHand(db, 'EDGE-BRUSH');

    applyMovement(db, {
      variantId: box.id,
      locationId: LOCATION_ID,
      delta: -1,
      reason: 'Test sale',
    });

    assert.equal(onHand(db, 'MIRACLE-KINKY-CURLY-14'), bundlesBefore - 2);
    assert.equal(onHand(db, 'EDGE-BRUSH'), brushesBefore - 1);
    assert.equal(onHand(db, 'BOX-MIRACLE-14'), 0, 'a kit holds no stock of its own');
  });

  it('adds the components back when a box is returned', () => {
    const box = variantBySku(db, 'BOX-MIRACLE-16');
    const before = onHand(db, 'MIRACLE-KINKY-CURLY-16');

    applyMovement(db, { variantId: box.id, locationId: LOCATION_ID, delta: -1, reason: 'Sale' });
    applyMovement(db, { variantId: box.id, locationId: LOCATION_ID, delta: 1, reason: 'Return' });

    assert.equal(onHand(db, 'MIRACLE-KINKY-CURLY-16'), before);
  });
});

describe('checking a basket before taking payment', () => {
  it('passes a basket the shelf can cover', () => {
    const jelly = variantBySku(db, 'GOT2B-CREAM');
    const result = checkAvailability(db, [{ variantId: jelly.id, quantity: 2 }], LOCATION_ID);
    assert.equal(result.ok, true);
  });

  it('names what is short', () => {
    const bundle = variantBySku(db, 'MIRACLE-KINKY-CURLY-20');
    const result = checkAvailability(db, [{ variantId: bundle.id, quantity: 99 }], LOCATION_ID);
    assert.equal(result.ok, false);
    assert.equal(result.shortfalls[0].sku, 'MIRACLE-KINKY-CURLY-20');
    assert.equal(result.shortfalls[0].required, 99);
  });

  it('adds up two lines that draw on the same pack', () => {
    const brush = variantBySku(db, 'EDGE-BRUSH');
    const available = availableStock(db, brush.id, LOCATION_ID);

    // A deal and a loose brush both take from the same shelf, so asking for the
    // whole lot twice has to fail even though each line alone would pass.
    const deal = variantBySku(db, 'DEAL-AFROTWIST');
    const result = checkAvailability(
      db,
      [
        { variantId: brush.id, quantity: available },
        { variantId: deal.id, quantity: 1 },
      ],
      LOCATION_ID,
    );

    assert.equal(result.ok, false, 'the two lines together exceed the shelf');
  });
});

describe('low stock', () => {
  it('lists lines at or below their reorder point', () => {
    const variant = variantBySku(db, 'ZURY-MK-OCEAN-16');
    db.prepare('UPDATE inventory SET on_hand = 2, reorder_point = 8 WHERE variant_id = ?').run(variant.id);

    const low = lowStock(db, LOCATION_ID);
    assert.ok(low.some((row) => row.sku === 'ZURY-MK-OCEAN-16'));
  });

  it('ignores lines with no reorder point set', () => {
    const variant = variantBySku(db, 'ZURY-MK-DEEP-16');
    db.prepare('UPDATE inventory SET on_hand = 0, reorder_point = 0 WHERE variant_id = ?').run(variant.id);

    const low = lowStock(db, LOCATION_ID);
    assert.ok(!low.some((row) => row.sku === 'ZURY-MK-DEEP-16'));
  });
});
