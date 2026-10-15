/** A seeded in-memory database for each test file. */

import { createMemoryDb } from '../src/db/index.js';
import { seed } from '../src/db/seed.js';

export function freshDb() {
  const db = createMemoryDb();
  seed(db, { adminEmail: 'test@hairifybb.com', adminPassword: 'test-password-123', quiet: true });
  return db;
}

export function variantBySku(db, sku) {
  return db.prepare('SELECT * FROM variants WHERE sku = ?').get(sku);
}

export function onHand(db, sku, locationId = 1) {
  const row = db
    .prepare(
      `SELECT i.on_hand FROM inventory i
         JOIN variants v ON v.id = i.variant_id
        WHERE v.sku = ? AND i.location_id = ?`,
    )
    .get(sku, locationId);
  return row ? row.on_hand : 0;
}

export const LOCATION_ID = 1;
