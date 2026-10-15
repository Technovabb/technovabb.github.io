/** Turns the catalogue in seed-data.js into rows. Safe to re-run: it skips a database that already has products. */

import { transaction } from './index.js';
import { applyMovement } from '../lib/inventory.js';
import { createUser } from '../lib/auth.js';
import { DEFAULT_SETTINGS, setSettings } from '../lib/settings.js';
import {
  CATEGORIES,
  DEALS,
  DELIVERY_RATES,
  LOCATIONS,
  PRODUCTS,
  PRODUCT_LINKS,
  REGISTERS,
  STORE_HOURS,
} from './seed-data.js';

/** `Kinky Curly` -> `KINKY-CURLY`, `18"` -> `18` */
function codePart(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value)
    .replace(/"/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildSku(prefix, { texture, length, colour }) {
  return [prefix, codePart(texture), codePart(length), codePart(colour)].filter(Boolean).join('-');
}

/** Expands a product's texture / length / colour axes into concrete variants. */
export function expandVariants(product) {
  const textures = product.textures?.length ? product.textures : [null];
  const lengths = product.lengths?.length ? product.lengths : [null];
  const colours = product.colours?.length ? product.colours : [null];

  const variants = [];
  let order = 0;

  for (const textureEntry of textures) {
    for (const lengthEntry of lengths) {
      for (const colourEntry of colours) {
        const texture = typeof textureEntry === 'string' ? textureEntry : textureEntry?.texture ?? null;
        const length = typeof lengthEntry === 'string' ? lengthEntry : lengthEntry?.length ?? null;
        const colour = typeof colourEntry === 'string' ? colourEntry : colourEntry?.colour ?? null;

        // Price comes from the most specific place that names one.
        const price =
          (typeof colourEntry === 'object' ? colourEntry?.price : null) ??
          (typeof lengthEntry === 'object' ? lengthEntry?.price : null) ??
          (typeof textureEntry === 'object' ? textureEntry?.price : null) ??
          product.price;

        if (price === undefined || price === null) {
          throw new Error(`No price for a variant of "${product.slug}".`);
        }

        variants.push({
          sku: buildSku(product.sku_prefix, { texture, length, colour }),
          texture,
          length,
          colour: colour ?? product.fixed_colour ?? null,
          price_cents: price,
          weight_grams: (typeof lengthEntry === 'object' ? lengthEntry?.weight : null) ?? null,
          sort_order: order++,
        });
      }
    }
  }

  return variants;
}

export function isSeeded(db) {
  return db.prepare('SELECT COUNT(*) AS count FROM products').get().count > 0;
}

export function seed(db, { adminEmail, adminPassword, quiet = false } = {}) {
  const log = quiet ? () => {} : (...args) => console.log(...args);

  return transaction(db, () => {
    // --- Settings, locations, hours, delivery -------------------------------
    setSettings(db, DEFAULT_SETTINGS);

    const locationIds = new Map();
    for (const location of LOCATIONS) {
      db.prepare(
        'INSERT INTO locations (slug, name, address, is_default) VALUES (?, ?, ?, ?)',
      ).run(location.slug, location.name, location.address, location.is_default ?? 0);
      locationIds.set(
        location.slug,
        db.prepare('SELECT id FROM locations WHERE slug = ?').get(location.slug).id,
      );
    }
    const defaultLocationId = locationIds.get(LOCATIONS[0].slug);

    for (const register of REGISTERS) {
      db.prepare('INSERT INTO pos_registers (name, location_id) VALUES (?, ?)').run(
        register.name,
        locationIds.get(register.location),
      );
    }

    for (const row of STORE_HOURS) {
      db.prepare('INSERT INTO store_hours (weekday, opens, closes, closed) VALUES (?, ?, ?, 0)').run(
        row.weekday,
        row.opens,
        row.closes,
      );
    }

    for (const rate of DELIVERY_RATES) {
      db.prepare(
        'INSERT INTO delivery_rates (parish, rate_cents, special_cents) VALUES (?, ?, ?)',
      ).run(rate.parish, rate.rate, rate.special);
    }

    // --- Categories ---------------------------------------------------------
    const categoryIds = new Map();
    for (const category of CATEGORIES) {
      db.prepare(
        `INSERT INTO categories (slug, name, tagline, image, in_nav, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        category.slug,
        category.name,
        category.tagline ?? null,
        category.image ?? null,
        category.in_nav ?? 1,
        category.sort ?? 0,
      );
      categoryIds.set(
        category.slug,
        db.prepare('SELECT id FROM categories WHERE slug = ?').get(category.slug).id,
      );
    }
    for (const category of CATEGORIES) {
      if (category.parent) {
        db.prepare('UPDATE categories SET parent_id = ? WHERE slug = ?').run(
          categoryIds.get(category.parent),
          category.slug,
        );
      }
    }

    // --- Products and variants ----------------------------------------------
    const productIds = new Map();
    const variantIdBySku = new Map();

    const insertProduct = db.prepare(
      `INSERT INTO products
         (slug, name, subtitle, brand, category_id, kind, eyebrow, description, how_to,
          care_notes, badge, unit_label, packs_min, packs_max, featured, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertImage = db.prepare(
      'INSERT INTO product_images (product_id, url, alt, sort_order) VALUES (?, ?, ?, ?)',
    );
    const insertVariant = db.prepare(
      `INSERT INTO variants
         (product_id, sku, barcode, texture, length, colour, price_cents, cost_cents,
          weight_grams, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const product of PRODUCTS) {
      insertProduct.run(
        product.slug,
        product.name,
        product.subtitle ?? null,
        product.brand ?? null,
        categoryIds.get(product.category) ?? null,
        'product',
        product.eyebrow ?? null,
        product.description ?? null,
        product.how_to ?? null,
        product.care_notes ?? null,
        product.badge ?? null,
        product.unit_label ?? 'each',
        product.packs_min ?? null,
        product.packs_max ?? null,
        product.featured ?? 0,
        product.sort ?? 0,
      );
      const productId = db.prepare('SELECT id FROM products WHERE slug = ?').get(product.slug).id;
      productIds.set(product.slug, productId);

      (product.images || []).forEach((image, index) => {
        insertImage.run(productId, image.url, image.alt ?? product.name, index);
      });

      for (const variant of expandVariants(product)) {
        // A simple internal barcode so every line scans at the till from day
        // one; real supplier barcodes replace these as stock comes in.
        const barcode = `HF${String(variantIdBySku.size + 1).padStart(6, '0')}`;
        insertVariant.run(
          productId,
          variant.sku,
          barcode,
          variant.texture,
          variant.length,
          variant.colour,
          variant.price_cents,
          // PLACEHOLDER cost: 55% of retail, so margin reports have something
          // to work with until real supplier costs are entered.
          Math.round(variant.price_cents * 0.55),
          variant.weight_grams,
          variant.sort_order,
        );
        const variantId = db.prepare('SELECT id FROM variants WHERE sku = ?').get(variant.sku).id;
        variantIdBySku.set(variant.sku, variantId);

        db.prepare(
          'INSERT INTO inventory (variant_id, location_id, on_hand, reorder_point) VALUES (?, ?, 0, ?)',
        ).run(variantId, defaultLocationId, product.reorder ?? 0);

        if (product.stock) {
          applyMovement(db, {
            variantId,
            locationId: defaultLocationId,
            delta: product.stock,
            reason: 'Opening stock',
            note: 'Seeded opening count — correct at first stock take',
          });
        }
      }
    }

    // --- Deals (kit variants) -------------------------------------------------
    for (const deal of DEALS) {
      insertProduct.run(
        deal.slug,
        deal.name,
        deal.subtitle ?? null,
        null,
        categoryIds.get(deal.category) ?? null,
        'deal',
        deal.eyebrow ?? null,
        deal.description ?? null,
        null,
        null,
        'deal',
        'each',
        null,
        null,
        0,
        deal.sort ?? 0,
      );
      const productId = db.prepare('SELECT id FROM products WHERE slug = ?').get(deal.slug).id;
      productIds.set(deal.slug, productId);

      (deal.images || []).forEach((image, index) => {
        insertImage.run(productId, image.url, image.alt ?? deal.name, index);
      });

      deal.variants.forEach((variant, index) => {
        insertVariant.run(
          productId,
          variant.sku,
          `HF${String(900000 + index + deal.sort).padStart(6, '0')}`,
          null,
          variant.label ?? null,
          null,
          variant.price,
          null,
          null,
          index,
        );
        const variantId = db.prepare('SELECT id FROM variants WHERE sku = ?').get(variant.sku).id;

        for (const component of variant.components) {
          const childId = variantIdBySku.get(component.sku);
          if (!childId) {
            throw new Error(
              `Deal "${deal.slug}" refers to SKU ${component.sku}, which no product creates.`,
            );
          }
          db.prepare(
            'INSERT INTO variant_components (parent_variant_id, child_variant_id, quantity) VALUES (?, ?, ?)',
          ).run(variantId, childId, component.quantity);
        }
      });
    }

    // --- Related product rails -------------------------------------------------
    for (const link of PRODUCT_LINKS) {
      link.related.forEach((relatedSlug, index) => {
        const productId = productIds.get(link.product);
        const relatedId = productIds.get(relatedSlug);
        if (!productId || !relatedId) return;
        db.prepare(
          `INSERT INTO product_links (product_id, related_id, relationship, sort_order)
           VALUES (?, ?, ?, ?)`,
        ).run(productId, relatedId, link.relationship, index);
      });
    }

    // --- First staff account ----------------------------------------------------
    let credentials = null;
    if (adminPassword) {
      createUser(db, {
        email: adminEmail,
        name: 'Hairify Admin',
        password: adminPassword,
        role: 'admin',
        pin: '1234',
      });
      credentials = { email: adminEmail, pin: '1234' };
    }

    log(
      `Seeded ${PRODUCTS.length} products and ${DEALS.length} deals ` +
        `(${variantIdBySku.size} variants) at ${LOCATIONS[0].name}.`,
    );

    return { credentials, variantCount: variantIdBySku.size };
  });
}
