import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { placeOrder, refundOrder } from '../src/lib/orders.js';
import {
  closeShift,
  currentShift,
  expectedCashCents,
  holdSale,
  listHeldSales,
  openShift,
  recordCashMovement,
  shiftSummary,
  takeHeldSale,
} from '../src/lib/pos.js';
import { LOCATION_ID, freshDb, variantBySku } from './helpers.js';

const db = freshDb();
after(() => db.close());

const REGISTER_ID = 1;
const USER_ID = 1;

function openTill(floatCents = 20000) {
  const existing = currentShift(db, REGISTER_ID);
  if (existing) return existing;
  return openShift(db, { registerId: REGISTER_ID, userId: USER_ID, openingFloatCents: floatCents });
}

function ringUp(sku, quantity, payments, shiftId, discountCents = 0) {
  const variant = variantBySku(db, sku);
  return placeOrder(db, {
    lines: [{ variantId: variant.id, quantity, discountCents }],
    channel: 'pos',
    fulfilment: 'in-store',
    locationId: LOCATION_ID,
    status: 'completed',
    shiftId,
    userId: USER_ID,
    payments,
  });
}

describe('opening a till', () => {
  it('records the opening float as the first cash movement', () => {
    const shift = openTill(20000);
    assert.equal(shift.opening_float_cents, 20000);
    assert.equal(expectedCashCents(db, shift.id), 20000);
  });

  it('does not open a second shift on the same register', () => {
    const first = currentShift(db, REGISTER_ID);
    const again = openShift(db, { registerId: REGISTER_ID, userId: USER_ID, openingFloatCents: 50000 });
    assert.equal(again.id, first.id);
  });
});

describe('the cash drawer', () => {
  it('adds cash sales to what should be in the drawer', () => {
    const shift = currentShift(db, REGISTER_ID);
    const before = expectedCashCents(db, shift.id);

    ringUp('GOT2B-JELLY', 1, [{ method: 'cash', amountCents: 3000, tenderedCents: 5000 }], shift.id);

    assert.equal(expectedCashCents(db, shift.id), before + 3000, 'the sale, not the cash handed over');
  });

  it('leaves the drawer alone for a card sale', () => {
    const shift = currentShift(db, REGISTER_ID);
    const before = expectedCashCents(db, shift.id);

    ringUp('GOT2B-CREAM', 1, [{ method: 'card', amountCents: 3000 }], shift.id);

    assert.equal(expectedCashCents(db, shift.id), before);
  });

  it('splits a sale between card and cash', () => {
    const shift = currentShift(db, REGISTER_ID);
    const before = expectedCashCents(db, shift.id);

    const order = ringUp(
      'MIRACLE-KINKY-CURLY-18',
      1,
      [
        { method: 'card', amountCents: 20000 },
        { method: 'cash', amountCents: 6000, tenderedCents: 6000 },
      ],
      shift.id,
    );

    assert.equal(order.paid_cents, 26000);
    assert.equal(order.payment_status, 'paid');
    assert.equal(expectedCashCents(db, shift.id), before + 6000);
  });

  it('takes a cash refund back out of the drawer', () => {
    const shift = currentShift(db, REGISTER_ID);
    const order = ringUp('EDGE-BRUSH', 2, [{ method: 'cash', amountCents: 2000, tenderedCents: 2000 }], shift.id);
    const before = expectedCashCents(db, shift.id);

    refundOrder(db, order.id, {
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      method: 'cash',
      shiftId: shift.id,
      userId: USER_ID,
    });

    assert.equal(expectedCashCents(db, shift.id), before - 1000);
  });

  it('records a pay-out as money leaving the drawer', () => {
    const shift = currentShift(db, REGISTER_ID);
    const before = expectedCashCents(db, shift.id);

    recordCashMovement(db, {
      shiftId: shift.id,
      type: 'pay-out',
      amountCents: -5000,
      reason: 'Lunch run',
      userId: USER_ID,
    });

    assert.equal(expectedCashCents(db, shift.id), before - 5000);
  });
});

describe('the shift summary', () => {
  it('adds up the sales, methods and refunds of the shift', () => {
    const shift = currentShift(db, REGISTER_ID);
    const summary = shiftSummary(db, shift.id);

    assert.ok(summary.sales.orders >= 4);
    assert.ok(summary.byMethod.some((row) => row.method === 'cash'));
    assert.ok(summary.byMethod.some((row) => row.method === 'card'));
    assert.equal(summary.refunds.count, 1);
    assert.equal(summary.expectedCashCents, expectedCashCents(db, shift.id));
  });
});

describe('holding a sale', () => {
  it('parks a ticket and gives it back untouched', () => {
    const lines = [{ variantId: 7, name: 'Miracle Knots', quantity: 2, price: 26000, discount: 0 }];
    const id = holdSale(db, { registerId: REGISTER_ID, userId: USER_ID, label: 'Lady in pink', lines });

    const held = listHeldSales(db, REGISTER_ID);
    assert.equal(held.length, 1);
    assert.equal(held[0].label, 'Lady in pink');
    assert.deepEqual(held[0].lines, lines);

    const resumed = takeHeldSale(db, id);
    assert.deepEqual(resumed, lines);
    assert.equal(listHeldSales(db, REGISTER_ID).length, 0, 'resuming takes it off the list');
  });
});

describe('cashing up', () => {
  it('records the shortfall when the drawer is light', () => {
    const shift = currentShift(db, REGISTER_ID);
    const expected = expectedCashCents(db, shift.id);

    const closed = closeShift(db, shift.id, {
      countedCents: expected - 500,
      note: 'Five dollars short',
      userId: USER_ID,
    });

    assert.equal(closed.status, 'closed');
    assert.equal(closed.expected_cents, expected);
    assert.equal(closed.variance_cents, -500);
    assert.equal(currentShift(db, REGISTER_ID), undefined, 'the till is closed');
  });

  it('lets a new shift open once the last is closed', () => {
    const shift = openShift(db, { registerId: REGISTER_ID, userId: USER_ID, openingFloatCents: 15000 });
    assert.equal(shift.status, 'open');
    assert.equal(shift.opening_float_cents, 15000);
  });
});
