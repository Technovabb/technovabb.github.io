import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAmount, formatMoney, formatPrice, roundCashToNickel, toCents } from '../src/lib/money.js';
import {
  deliveryCostCents,
  formatMinutes,
  localParts,
  openingStatus,
  parseTimeToMinutes,
  sameDayCountdown,
} from '../src/lib/store.js';

/** 2026-10-15 is a Thursday. Times below are UTC; Barbados is UTC-4. */
const thursdayNoonLocal = new Date('2026-10-15T16:00:00Z');

const HOURS = [
  { weekday: 1, opens: '08:00', closes: '18:30', closed: 0 },
  { weekday: 2, opens: '08:00', closes: '18:30', closed: 0 },
  { weekday: 3, opens: '08:00', closes: '18:30', closed: 0 },
  { weekday: 4, opens: '08:00', closes: '19:00', closed: 0 },
  { weekday: 5, opens: '08:00', closes: '19:00', closed: 0 },
  { weekday: 6, opens: '08:00', closes: '19:00', closed: 0 },
  { weekday: 0, opens: '10:00', closes: '15:00', closed: 0 },
];

describe('money', () => {
  it('turns dollars into whole cents', () => {
    assert.equal(toCents('220'), 22000);
    assert.equal(toCents('12.50'), 1250);
    assert.equal(toCents(0.07), 7);
  });

  it('writes round prices the way a price tag does', () => {
    assert.equal(formatPrice(22000), '$220');
    assert.equal(formatPrice(9500), '$95');
    assert.equal(formatPrice(2550), '$25.50');
  });

  it('always writes cents in totals', () => {
    assert.equal(formatMoney(22000), '$220.00');
    assert.equal(formatMoney(5), '$0.05');
    assert.equal(formatAmount(-1250), '-12.50');
  });

  it('rounds cash to the nearest five cents', () => {
    assert.equal(roundCashToNickel(1253), 1255);
    assert.equal(roundCashToNickel(1252), 1250);
  });
});

describe('local time in Barbados', () => {
  it('reads noon local from a UTC instant', () => {
    const parts = localParts(thursdayNoonLocal);
    assert.equal(parts.hours, 12);
    assert.equal(parts.weekday, 4, 'Thursday');
  });

  it('parses and prints opening times', () => {
    assert.equal(parseTimeToMinutes('08:30'), 510);
    assert.equal(formatMinutes(510), '8:30am');
    assert.equal(formatMinutes(1140), '7pm');
    assert.equal(formatMinutes(720), '12pm');
    assert.equal(formatMinutes(0), '12am');
  });
});

describe('opening hours', () => {
  it('says the shop is open at noon on a Thursday', () => {
    const status = openingStatus(HOURS, thursdayNoonLocal);
    assert.equal(status.open, true);
    assert.match(status.label, /closes 7pm/);
  });

  it('says the shop is shut before it opens, and when it will', () => {
    const earlyThursday = new Date('2026-10-15T11:00:00Z'); // 7am local
    const status = openingStatus(HOURS, earlyThursday);
    assert.equal(status.open, false);
    assert.match(status.label, /opens 8am/);
  });

  it('points at the next day once the shop has shut', () => {
    const thursdayNight = new Date('2026-10-15T23:30:00Z'); // 7:30pm local
    const status = openingStatus(HOURS, thursdayNight);
    assert.equal(status.open, false);
    assert.match(status.label, /opens tomorrow 8am/);
  });

  it('skips a closed day when looking for the next opening', () => {
    const hoursClosedSunday = HOURS.map((row) => (row.weekday === 0 ? { ...row, closed: 1 } : row));
    const saturdayNight = new Date('2026-10-17T23:30:00Z'); // 7:30pm local Saturday
    const status = openingStatus(hoursClosedSunday, saturdayNight);
    assert.match(status.label, /Monday/);
  });
});

describe('same-day delivery countdown', () => {
  const settings = { same_day_cutoff: '15:30', delivery_days: '1,2,3,4,5,6' };

  it('counts down to the cutoff', () => {
    const countdown = sameDayCountdown(settings, new Date('2026-10-15T15:15:00Z')); // 11:15am local
    assert.equal(countdown.minutesLeft, 255);
    assert.equal(countdown.label, '4h 15m');
    assert.equal(countdown.cutoffLabel, '3:30pm');
  });

  it('stops once the cutoff has passed', () => {
    const countdown = sameDayCountdown(settings, new Date('2026-10-15T20:00:00Z')); // 4pm local
    assert.equal(countdown, null);
  });

  it('stops on a day with no delivery run', () => {
    const sundayMorning = new Date('2026-10-18T15:00:00Z'); // 11am local Sunday
    assert.equal(sameDayCountdown(settings, sundayMorning), null);
  });

  it('writes minutes alone in the last hour', () => {
    const countdown = sameDayCountdown(settings, new Date('2026-10-15T19:10:00Z')); // 3:10pm local
    assert.equal(countdown.label, '20m');
  });
});

describe('delivery pricing', () => {
  const rate = { rate_cents: 1500, special_cents: 800 };

  it('uses the standard rate below the threshold', () => {
    assert.equal(deliveryCostCents(rate, 14999, 15000), 1500);
  });

  it('uses the special rate at and above the threshold', () => {
    assert.equal(deliveryCostCents(rate, 15000, 15000), 800);
    assert.equal(deliveryCostCents(rate, 50000, 15000), 800);
  });

  it('has no price without a rate for the parish', () => {
    assert.equal(deliveryCostCents(null, 20000, 15000), null);
  });
});
