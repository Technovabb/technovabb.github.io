/**
 * Inventory engine.
 *
 * Every change to stock goes through `applyMovement`, which writes a row to
 * stock_movements as well as updating the running count. The shop, the POS and
 * the back office all call in here, so a count can always be explained by its
 * ledger.
 *
 * A kit variant (a deal, the Miracle Knot Box) holds no stock of its own. Its
 * availability is derived from its components, and selling one draws the
 * components down.
 */

/** The components of a kit, or `[]` for an ordinary variant. */
export function componentsOf(db, variantId) {
  return db
    .prepare(
      `SELECT vc.child_variant_id AS variant_id, vc.quantity, v.sku, p.name
         FROM variant_components vc
         JOIN variants v ON v.id = vc.child_variant_id
         JOIN products p ON p.id = v.product_id
        WHERE vc.parent_variant_id = ?`,
    )
    .all(variantId);
}

export function isKit(db, variantId) {
  return componentsOf(db, variantId).length > 0;
}

/**
 * Flattens a sale of `quantity` of `variantId` into the concrete variants that
 * must actually come off the shelf. Kits expand into their components; kits
 * nested inside kits expand too.
 */
export function explodeForStock(db, variantId, quantity, seen = new Set()) {
  const components = componentsOf(db, variantId);
  if (components.length === 0) return [{ variantId, quantity }];

  if (seen.has(variantId)) {
    throw new Error(`Kit ${variantId} contains itself, so its stock cannot be worked out.`);
  }
  const nested = new Set(seen).add(variantId);

  const lines = [];
  for (const component of components) {
    lines.push(...explodeForStock(db, component.variant_id, component.quantity * quantity, nested));
  }

  // A component may appear more than once down different branches.
  const merged = new Map();
  for (const line of lines) {
    merged.set(line.variantId, (merged.get(line.variantId) || 0) + line.quantity);
  }
  return [...merged].map(([id, qty]) => ({ variantId: id, quantity: qty }));
}

/** Stock on hand for an ordinary variant; for a kit, how many could be built. */
export function availableStock(db, variantId, locationId) {
  const lines = explodeForStock(db, variantId, 1);
  const readOnHand = db.prepare(
    'SELECT on_hand FROM inventory WHERE variant_id = ? AND location_id = ?',
  );

  let buildable = Infinity;
  for (const line of lines) {
    const row = readOnHand.get(line.variantId, locationId);
    const onHand = row ? row.on_hand : 0;
    buildable = Math.min(buildable, Math.floor(onHand / line.quantity));
  }
  return buildable === Infinity ? 0 : buildable;
}

/** Stock for many variants at once, keyed by variant id. */
export function stockByVariant(db, variantIds, locationId) {
  const result = new Map();
  for (const variantId of variantIds) {
    result.set(variantId, availableStock(db, variantId, locationId));
  }
  return result;
}

function ensureInventoryRow(db, variantId, locationId) {
  db.prepare(
    `INSERT INTO inventory (variant_id, location_id, on_hand)
          VALUES (?, ?, 0)
     ON CONFLICT (variant_id, location_id) DO NOTHING`,
  ).run(variantId, locationId);
}

/**
 * The single write path for stock. `delta` is negative for stock leaving.
 * Kits are expanded, so callers never have to think about them.
 */
export function applyMovement(
  db,
  { variantId, locationId, delta, reason, referenceType = null, referenceId = null, note = null, userId = null },
) {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('A stock movement needs a non-zero whole-number delta.');
  }

  const lines = explodeForStock(db, variantId, Math.abs(delta));
  const direction = Math.sign(delta);
  const written = [];

  for (const line of lines) {
    ensureInventoryRow(db, line.variantId, locationId);
    const lineDelta = direction * line.quantity;

    db.prepare(
      `UPDATE inventory
          SET on_hand = on_hand + ?, updated_at = datetime('now')
        WHERE variant_id = ? AND location_id = ?`,
    ).run(lineDelta, line.variantId, locationId);

    const { on_hand: balance } = db
      .prepare('SELECT on_hand FROM inventory WHERE variant_id = ? AND location_id = ?')
      .get(line.variantId, locationId);

    db.prepare(
      `INSERT INTO stock_movements
         (variant_id, location_id, delta, balance_after, reason, reference_type, reference_id, note, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      line.variantId,
      locationId,
      lineDelta,
      balance,
      reason,
      referenceType,
      referenceId,
      note,
      userId,
    );

    written.push({ variantId: line.variantId, delta: lineDelta, balanceAfter: balance });
  }

  return written;
}

/**
 * Checks a basket against stock before taking payment, aggregating kit
 * components so two lines drawing on the same pack cannot both be promised.
 */
export function checkAvailability(db, lines, locationId) {
  const required = new Map();
  for (const line of lines) {
    for (const part of explodeForStock(db, line.variantId, line.quantity)) {
      required.set(part.variantId, (required.get(part.variantId) || 0) + part.quantity);
    }
  }

  const shortfalls = [];
  for (const [variantId, quantity] of required) {
    const row = db
      .prepare('SELECT on_hand FROM inventory WHERE variant_id = ? AND location_id = ?')
      .get(variantId, locationId);
    const onHand = row ? row.on_hand : 0;
    if (onHand < quantity) {
      const detail = db
        .prepare(
          `SELECT v.sku, p.name, v.texture, v.length, v.colour
             FROM variants v JOIN products p ON p.id = v.product_id
            WHERE v.id = ?`,
        )
        .get(variantId);
      shortfalls.push({ variantId, required: quantity, onHand, ...detail });
    }
  }

  return { ok: shortfalls.length === 0, shortfalls };
}

/** Variants at or below their reorder point. */
export function lowStock(db, locationId) {
  return db
    .prepare(
      `SELECT i.variant_id, i.on_hand, i.reorder_point, v.sku, v.texture, v.length, v.colour,
              p.name, p.slug, p.unit_label
         FROM inventory i
         JOIN variants v ON v.id = i.variant_id
         JOIN products p ON p.id = v.product_id
        WHERE i.location_id = ?
          AND v.active = 1
          AND i.reorder_point > 0
          AND i.on_hand <= i.reorder_point
        ORDER BY (i.on_hand - i.reorder_point), p.name`,
    )
    .all(locationId);
}

/** Retail value of everything on the shelf, for the dashboard. */
export function stockValuation(db, locationId) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(i.on_hand), 0) AS units,
              COALESCE(SUM(i.on_hand * v.price_cents), 0) AS retail_cents,
              COALESCE(SUM(i.on_hand * COALESCE(v.cost_cents, 0)), 0) AS cost_cents
         FROM inventory i
         JOIN variants v ON v.id = i.variant_id
        WHERE i.location_id = ? AND v.active = 1`,
    )
    .get(locationId);
}
