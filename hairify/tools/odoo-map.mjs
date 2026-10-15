/**
 * Maps the Hairify catalogue onto Odoo's data model.
 *
 * The shapes differ in three places that matter:
 *
 *  - Odoo builds variants from *attributes*. Texture, length and colour become
 *    `product.attribute` records, and a template lists the values it uses; Odoo
 *    then generates the combinations itself.
 *
 *  - Odoo prices a variant as the template's price plus a `price_extra` on each
 *    attribute value, not as a price per variant. That works as long as price
 *    varies along a single axis, which it does throughout this catalogue — but
 *    `pricingFor` checks rather than assumes, and reports anything it cannot
 *    express.
 *
 *  - A deal is a kit. Odoo expresses that as a phantom bill of materials, which
 *    needs the Manufacturing app; `kitsFor` returns the components so the caller
 *    can report what is needed if that app is missing.
 */

import { DEALS, DELIVERY_RATES, PRODUCTS, STORE_HOURS } from '../src/db/seed-data.js';
import { expandVariants } from '../src/db/seed.js';
import { DEFAULT_SETTINGS } from '../src/lib/settings.js';

export const ATTRIBUTES = [
  { key: 'texture', name: 'Texture', display_type: 'radio' },
  { key: 'length', name: 'Length', display_type: 'radio' },
  { key: 'colour', name: 'Colour', display_type: 'radio' },
];

/** Every distinct value each attribute takes across the catalogue, in order. */
export function attributeValues() {
  const values = { texture: [], length: [], colour: [] };

  for (const product of PRODUCTS) {
    for (const variant of expandVariants(product)) {
      for (const key of ['texture', 'length', 'colour']) {
        const value = variant[key];
        if (value && !values[key].includes(value)) values[key].push(value);
      }
    }
  }

  // Lengths read better shortest-first rather than in catalogue order.
  values.length.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return values;
}

/**
 * Works out a template price plus per-value extras that reproduce every variant
 * price exactly. Returns `{ ok: false, reason }` when Odoo's model cannot
 * express the pricing, so the caller reports it instead of loading wrong prices.
 */
export function pricingFor(product) {
  const variants = expandVariants(product);
  const prices = variants.map((variant) => variant.price_cents);
  const basePrice = Math.min(...prices);

  if (new Set(prices).size === 1) {
    return { ok: true, basePrice, extras: [], axis: null, variants };
  }

  // Find the single axis along which price moves.
  const axes = ['texture', 'length', 'colour'].filter((key) => {
    const byValue = new Map();
    for (const variant of variants) {
      if (!variant[key]) continue;
      if (!byValue.has(variant[key])) byValue.set(variant[key], new Set());
      byValue.get(variant[key]).add(variant.price_cents);
    }
    // This axis explains the price if each of its values has one price and
    // those prices differ between values.
    const perValue = [...byValue.values()];
    return perValue.length > 1 && perValue.every((set) => set.size === 1);
  });

  if (axes.length !== 1) {
    return {
      ok: false,
      reason:
        axes.length === 0
          ? 'prices do not line up with a single option'
          : `prices vary along more than one option (${axes.join(', ')})`,
      variants,
    };
  }

  const axis = axes[0];
  const extras = [];
  const seen = new Set();
  for (const variant of variants) {
    const value = variant[axis];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    extras.push({ axis, value, priceExtra: (variant.price_cents - basePrice) / 100 });
  }

  // Prove it: base plus extras must reproduce every variant price.
  const lookup = new Map(extras.map((entry) => [entry.value, entry.priceExtra * 100]));
  for (const variant of variants) {
    const rebuilt = basePrice + (lookup.get(variant[axis]) || 0);
    if (rebuilt !== variant.price_cents) {
      return { ok: false, reason: `price for ${variant.sku} cannot be rebuilt from the options`, variants };
    }
  }

  return { ok: true, basePrice, extras, axis, variants };
}

/** The attribute values a template needs, keyed by attribute. */
export function templateAttributes(product) {
  const variants = expandVariants(product);
  const used = { texture: [], length: [], colour: [] };

  for (const variant of variants) {
    for (const key of ['texture', 'length', 'colour']) {
      const value = variant[key];
      if (value && !used[key].includes(value)) used[key].push(value);
    }
  }

  // A value every variant shares is a fact about the product, not a choice, so
  // it is left off the template rather than made into a one-option picker.
  for (const key of ['texture', 'length', 'colour']) {
    if (used[key].length <= 1) used[key] = [];
  }

  used.length.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  return used;
}

/** Deal components, as SKU plus quantity, for building phantom bills of materials. */
export function kitsFor() {
  return DEALS.flatMap((deal) =>
    deal.variants.map((variant) => ({
      deal: deal.slug,
      sku: variant.sku,
      label: variant.label,
      price: variant.price / 100,
      components: variant.components,
    })),
  );
}

/**
 * Delivery carriers. Hairify charges a reduced rate over $150 rather than free
 * shipping, which Odoo expresses as a rule-based carrier: the first rule that
 * matches wins, so the over-threshold rule is sequenced first.
 */
export function deliveryCarriers() {
  const threshold = Number(DEFAULT_SETTINGS.delivery_special_threshold_cents) / 100;

  return DELIVERY_RATES.map((rate) => ({
    name: `Delivery — ${rate.parish}`,
    parish: rate.parish,
    standard: rate.rate / 100,
    special: rate.special / 100,
    threshold,
    rules: [
      { sequence: 10, variable: 'price', operator: '>=', max_value: threshold, list_base_price: rate.special / 100 },
      { sequence: 20, variable: 'price', operator: '>=', max_value: 0, list_base_price: rate.rate / 100 },
    ],
  }));
}

/** Company details and opening hours, for the website and receipts. */
export function companyDetails() {
  return {
    name: DEFAULT_SETTINGS.store_name,
    phone: DEFAULT_SETTINGS.store_phone,
    email: DEFAULT_SETTINGS.store_email,
    street: DEFAULT_SETTINGS.store_address,
    city: 'Warrens, St. Michael',
    countryCode: 'BB',
    currency: 'BBD',
    hours: STORE_HOURS,
  };
}

/** A plan of everything the sync would do, for --dry-run and for the report. */
export function plan() {
  const values = attributeValues();
  const products = PRODUCTS.map((product) => {
    const pricing = pricingFor(product);
    const attributes = templateAttributes(product);
    return {
      slug: product.slug,
      name: product.name,
      variantCount: expandVariants(product).length,
      attributes,
      pricing,
    };
  });

  return {
    attributes: values,
    attributeValueCount: Object.values(values).reduce((sum, list) => sum + list.length, 0),
    products,
    variantTotal: products.reduce((sum, product) => sum + product.variantCount, 0),
    unpriceable: products.filter((product) => !product.pricing.ok),
    kits: kitsFor(),
    carriers: deliveryCarriers(),
    company: companyDetails(),
  };
}
