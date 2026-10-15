/** Catalogue reads shared by the storefront, the POS search and the back office. */

import { availableStock } from './inventory.js';

const PRODUCT_COLUMNS = `
  p.id, p.slug, p.name, p.subtitle, p.brand, p.kind, p.eyebrow, p.description,
  p.how_to, p.care_notes, p.badge, p.unit_label, p.packs_min, p.packs_max,
  p.featured, p.sort_order, p.active, p.category_id,
  c.name AS category_name, c.slug AS category_slug
`;

/** Price span and image for a list of products, in one pass each. */
function decorate(db, products) {
  if (products.length === 0) return [];
  const priceRange = db.prepare(
    `SELECT MIN(price_cents) AS min_cents, MAX(price_cents) AS max_cents, COUNT(*) AS variant_count
       FROM variants WHERE product_id = ? AND active = 1`,
  );
  const firstImage = db.prepare(
    'SELECT url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id LIMIT 1',
  );

  return products.map((product) => {
    const prices = priceRange.get(product.id) || {};
    const image = firstImage.get(product.id);
    return {
      ...product,
      min_cents: prices.min_cents ?? 0,
      max_cents: prices.max_cents ?? 0,
      variant_count: prices.variant_count ?? 0,
      image: image?.url || null,
      image_alt: image?.alt || product.name,
    };
  });
}

export function listCategories(db, { navOnly = false } = {}) {
  return db
    .prepare(
      `SELECT * FROM categories
        WHERE active = 1 ${navOnly ? 'AND in_nav = 1' : ''}
        ORDER BY sort_order, name`,
    )
    .all();
}

export function getCategory(db, slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ? AND active = 1').get(slug);
}

/** Categories that have their own tile on the home page. */
export function tileCategories(db) {
  return db
    .prepare(
      `SELECT * FROM categories WHERE active = 1 AND image IS NOT NULL ORDER BY sort_order, name`,
    )
    .all();
}

export function listProducts(
  db,
  { categoryId = null, categorySlug = null, kind = 'product', featured = null, limit = null, search = null } = {},
) {
  const where = ['p.active = 1'];
  const params = [];

  if (kind) {
    where.push('p.kind = ?');
    params.push(kind);
  }
  if (categoryId) {
    // Include children, so "Hair" also shows bundles, ponytails and hair care.
    where.push('(p.category_id = ? OR c.parent_id = ?)');
    params.push(categoryId, categoryId);
  }
  if (categorySlug) {
    where.push('c.slug = ?');
    params.push(categorySlug);
  }
  if (featured !== null) {
    where.push('p.featured = ?');
    params.push(featured ? 1 : 0);
  }
  if (search) {
    where.push('(p.name LIKE ? OR p.subtitle LIKE ? OR p.brand LIKE ? OR c.name LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  const rows = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY p.sort_order, p.name
        ${limit ? 'LIMIT ?' : ''}`,
    )
    .all(...params, ...(limit ? [limit] : []));

  return decorate(db, rows);
}

export function getProduct(db, slug) {
  const product = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.active = 1`,
    )
    .get(slug);
  if (!product) return null;
  return decorate(db, [product])[0];
}

export function getProductById(db, id) {
  const product = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?`,
    )
    .get(id);
  if (!product) return null;
  return decorate(db, [product])[0];
}

export function productImages(db, productId) {
  return db
    .prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id')
    .all(productId);
}

/** Variants of a product, each with its stock at `locationId`. */
export function productVariants(db, productId, locationId) {
  const variants = db
    .prepare('SELECT * FROM variants WHERE product_id = ? AND active = 1 ORDER BY sort_order, id')
    .all(productId);

  return variants.map((variant) => ({
    ...variant,
    stock: locationId ? availableStock(db, variant.id, locationId) : null,
  }));
}

export function getVariant(db, id) {
  return db
    .prepare(
      `SELECT v.*, p.name, p.slug, p.unit_label, p.kind, p.active AS product_active
         FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.id = ?`,
    )
    .get(id);
}

export function findVariantByCode(db, code) {
  return db
    .prepare(
      `SELECT v.*, p.name, p.slug, p.unit_label
         FROM variants v JOIN products p ON p.id = v.product_id
        WHERE (v.barcode = ? OR v.sku = ?) AND v.active = 1`,
    )
    .get(code, code);
}

/** The label the shop puts under a product name: `Kinky Curly · 18"`. */
export function variantLabel(variant) {
  return [variant.texture, variant.length, variant.colour].filter(Boolean).join(' · ');
}

export function relatedProducts(db, productId, relationship) {
  const rows = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM product_links pl
         JOIN products p ON p.id = pl.related_id
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE pl.product_id = ? AND pl.relationship = ? AND p.active = 1
        ORDER BY pl.sort_order`,
    )
    .all(productId, relationship);
  return decorate(db, rows);
}

/** Products that carry a "how many packs" answer, for the pack guide. */
export function packGuideProducts(db) {
  const rows = db
    .prepare(
      `SELECT ${PRODUCT_COLUMNS}
         FROM products p
         LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.active = 1 AND p.packs_min IS NOT NULL
        ORDER BY p.sort_order, p.name`,
    )
    .all();
  return decorate(db, rows);
}

/** Search across products for the POS and the storefront search box. */
export function searchVariants(db, term, locationId, limit = 40) {
  const like = `%${term}%`;
  const rows = db
    .prepare(
      `SELECT v.*, p.name, p.slug, p.unit_label, p.kind
         FROM variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.active = 1 AND p.active = 1
          AND (p.name LIKE ? OR v.sku LIKE ? OR v.barcode = ? OR p.brand LIKE ?
               OR v.texture LIKE ? OR v.colour LIKE ?)
        ORDER BY p.name, v.sort_order
        LIMIT ?`,
    )
    .all(like, like, term, like, like, like, limit);

  return rows.map((row) => ({
    ...row,
    label: variantLabel(row),
    stock: locationId ? availableStock(db, row.id, locationId) : null,
  }));
}
