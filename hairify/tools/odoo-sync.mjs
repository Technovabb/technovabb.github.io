#!/usr/bin/env node
/**
 * Builds the Hairify shop inside an Odoo database.
 *
 *   node tools/odoo-sync.mjs --dry-run        # print the plan, write nothing
 *   node tools/odoo-sync.mjs                  # do it
 *   node tools/odoo-sync.mjs --stage=products # one stage only
 *
 * Re-runnable: every record is looked up before it is created, so a second run
 * updates rather than duplicates. Credentials come from the environment
 * (ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY or ODOO_PASSWORD).
 */

import { Odoo, OdooError } from './odoo-client.mjs';
import {
  ATTRIBUTES,
  attributeValues,
  companyDetails,
  deliveryCarriers,
  kitsFor,
  plan,
  pricingFor,
  templateAttributes,
} from './odoo-map.mjs';
import { CATEGORIES, DEALS, PRODUCTS } from '../src/db/seed-data.js';
import { expandVariants } from '../src/db/seed.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const stageArg = args.find((arg) => arg.startsWith('--stage='))?.split('=')[1] || 'all';
const quiet = args.includes('--quiet');

const log = (...parts) => !quiet && console.log(...parts);
const heading = (text) => log(`\n${text}\n${'─'.repeat(text.length)}`);

const STAGES = ['company', 'attributes', 'categories', 'products', 'stock', 'kits', 'delivery', 'pos'];
const wanted = stageArg === 'all' ? STAGES : stageArg.split(',');
const notes = [];

/** Odoo renamed how a stockable product is flagged; support both shapes. */
async function productTypeFields(odoo) {
  const fields = await odoo.call('product.template', 'fields_get', [
    ['type', 'is_storable'],
    ['type', 'selection'],
  ]);
  if (fields.is_storable) return { type: 'consu', is_storable: true };
  const options = (fields.type?.selection || []).map(([value]) => value);
  return { type: options.includes('product') ? 'product' : 'consu' };
}

async function run() {
  const odoo = Odoo.fromEnv({ dryRun, log });

  if (dryRun) {
    heading('Dry run — nothing will be written');
    const summary = plan();
    log(`Odoo:        ${odoo.url} (database "${odoo.db}")`);
    log(`Attributes:  ${ATTRIBUTES.length} (${summary.attributeValueCount} values)`);
    log(`Categories:  ${CATEGORIES.length}`);
    log(`Products:    ${summary.products.length} templates → ${summary.variantTotal} variants`);
    log(`Deals:       ${summary.kits.length} kit variants`);
    log(`Delivery:    ${summary.carriers.length} parishes, reduced rate over $${summary.carriers[0].threshold}`);
    if (summary.unpriceable.length) {
      log(`\nCannot price in Odoo's model:`);
      for (const item of summary.unpriceable) log(`  ${item.slug}: ${item.pricing.reason}`);
    } else {
      log(`\nEvery product's pricing maps onto Odoo's base price plus option extras.`);
    }
    log('\nAdd ODOO_USERNAME and ODOO_API_KEY to the environment, then run without --dry-run.');
    return;
  }

  heading('Signing in');
  await odoo.authenticate();
  log(`  signed in to ${odoo.url} as uid ${odoo.uid}`);

  const apps = await odoo.installedModules(['website_sale', 'point_of_sale', 'stock', 'mrp', 'delivery']);
  log(`  apps installed: ${[...apps].join(', ') || 'none of the ones this needs'}`);
  for (const [module, label] of [
    ['website_sale', 'eCommerce — the storefront'],
    ['point_of_sale', 'Point of Sale — the till'],
    ['stock', 'Inventory — stock counts'],
    ['delivery', 'Delivery Methods — per-parish rates'],
  ]) {
    if (!apps.has(module)) notes.push(`Install the ${label} app, then re-run this.`);
  }

  const typeFields = await productTypeFields(odoo);
  const company = await odoo.searchOne('res.company', [], ['id', 'name', 'currency_id']);

  /* ------------------------------------------------------------- company */
  if (wanted.includes('company')) {
    heading('Shop details');
    const details = companyDetails();
    const country = await odoo.searchOne('res.country', [['code', '=', details.countryCode]]);

    await odoo.write(
      'res.company',
      company.id,
      {
        name: details.name,
        phone: details.phone,
        email: details.email,
        street: details.street,
        city: details.city,
        ...(country ? { country_id: country.id } : {}),
      },
      { label: details.name },
    );

    const currencyName = company.currency_id?.[1];
    if (currencyName !== details.currency) {
      // Every price in the catalogue is in Barbados dollars. Loading them into a
      // database set to another currency would silently mis-price the shop, so
      // this is reported rather than changed behind the owner's back.
      notes.push(
        `The database's currency is ${currencyName}, but all prices are in ${details.currency}. ` +
          `Set it under Settings → Companies → Currency before trusting any price, ` +
          `or tell me to change it.`,
      );
      log(`  ⚠ currency is ${currencyName}, not ${details.currency} — see the notes below`);
    }
  }

  /* ---------------------------------------------------------- attributes */
  const valueIds = { texture: new Map(), length: new Map(), colour: new Map() };
  const attributeIds = new Map();

  if (wanted.includes('attributes') || wanted.includes('products')) {
    heading('Options');
    const values = attributeValues();

    for (const attribute of ATTRIBUTES) {
      const id = await odoo.ensure(
        'product.attribute',
        [['name', '=', attribute.name]],
        { name: attribute.name, display_type: attribute.display_type, create_variant: 'always' },
        { label: attribute.name },
      );
      attributeIds.set(attribute.key, id);

      for (const value of values[attribute.key]) {
        const valueId = await odoo.ensure(
          'product.attribute.value',
          [
            ['name', '=', value],
            ['attribute_id', '=', id],
          ],
          { name: value, attribute_id: id },
          { label: `${attribute.name}: ${value}` },
        );
        valueIds[attribute.key].set(value, valueId);
      }
    }
  }

  /* ---------------------------------------------------------- categories */
  const internalCategory = new Map();
  const publicCategory = new Map();

  if (wanted.includes('categories') || wanted.includes('products')) {
    heading('Categories');
    for (const category of CATEGORIES) {
      internalCategory.set(
        category.slug,
        await odoo.ensure(
          'product.category',
          [['name', '=', category.name]],
          { name: category.name },
          { label: category.name },
        ),
      );

      if (apps.has('website_sale')) {
        publicCategory.set(
          category.slug,
          await odoo.ensure(
            'product.public.category',
            [['name', '=', category.name]],
            { name: category.name, sequence: category.sort ?? 10 },
            { label: `shop category: ${category.name}` },
          ),
        );
      }
    }
  }

  /* ------------------------------------------------------------ products */
  const templateBySlug = new Map();

  if (wanted.includes('products') || wanted.includes('stock') || wanted.includes('kits')) {
    heading('Products');

    for (const product of PRODUCTS) {
      const pricing = pricingFor(product);
      if (!pricing.ok) {
        notes.push(`${product.name}: ${pricing.reason} — priced by hand in Odoo.`);
        log(`  ⚠ skipping ${product.slug}: ${pricing.reason}`);
        continue;
      }

      const offered = templateAttributes(product);
      const attributeLines = [];
      for (const key of ['texture', 'length', 'colour']) {
        if (offered[key].length === 0) continue;
        attributeLines.push([
          0,
          0,
          {
            attribute_id: attributeIds.get(key),
            value_ids: [[6, 0, offered[key].map((value) => valueIds[key].get(value))]],
          },
        ]);
      }

      const existing = await odoo.searchOne(
        'product.template',
        [['default_code', '=', product.sku_prefix]],
        ['id'],
      );

      const values = {
        name: product.name,
        default_code: product.sku_prefix,
        ...typeFields,
        categ_id: internalCategory.get(product.category),
        list_price: pricing.basePrice / 100,
        standard_price: Math.round(pricing.basePrice * 0.55) / 100,
        description_sale: product.description || false,
        ...(apps.has('website_sale')
          ? {
              is_published: true,
              website_sequence: product.sort ?? 100,
              ...(publicCategory.get(product.category)
                ? { public_categ_ids: [[6, 0, [publicCategory.get(product.category)]]] }
                : {}),
            }
          : {}),
        ...(apps.has('point_of_sale') ? { available_in_pos: true } : {}),
      };

      let templateId;
      if (existing) {
        await odoo.write('product.template', existing.id, values, { label: product.name });
        templateId = existing.id;
      } else {
        templateId = await odoo.create(
          'product.template',
          { ...values, ...(attributeLines.length ? { attribute_line_ids: attributeLines } : {}) },
          { label: product.name },
        );
      }
      templateBySlug.set(product.slug, templateId);

      // Price differences between options live on the template's own copy of
      // each attribute value, not on the value itself.
      for (const extra of pricing.extras) {
        if (extra.priceExtra === 0) continue;
        const ptav = await odoo.searchOne(
          'product.template.attribute.value',
          [
            ['product_tmpl_id', '=', templateId],
            ['product_attribute_value_id', '=', valueIds[extra.axis].get(extra.value)],
          ],
          ['id'],
        );
        if (ptav) {
          await odoo.write('product.template.attribute.value', ptav.id, { price_extra: extra.priceExtra }, {
            label: `${product.name} · ${extra.value} +$${extra.priceExtra}`,
          });
        }
      }
    }
  }

  /* --------------------------------------------------------------- stock */
  if (wanted.includes('stock') && apps.has('stock')) {
    heading('Opening stock');
    const warehouse = await odoo.searchOne('stock.warehouse', [], ['id', 'lot_stock_id']);
    if (!warehouse) {
      notes.push('No warehouse found, so no opening stock was set.');
    } else {
      const locationId = warehouse.lot_stock_id[0];

      for (const product of PRODUCTS) {
        if (!product.stock) continue;
        const templateId = templateBySlug.get(product.slug);
        if (!templateId) continue;

        const variants = await odoo.searchRead(
          'product.product',
          [['product_tmpl_id', '=', templateId]],
          ['id', 'default_code'],
        );

        for (const variant of variants) {
          const quant = await odoo.searchOne(
            'stock.quant',
            [
              ['product_id', '=', variant.id],
              ['location_id', '=', locationId],
            ],
            ['id'],
          );

          if (quant) {
            await odoo.write('stock.quant', quant.id, { inventory_quantity: product.stock }, {
              label: `${product.name} → ${product.stock}`,
            });
            await odoo.call('stock.quant', 'action_apply_inventory', [[quant.id]]);
          } else {
            const quantId = await odoo.create(
              'stock.quant',
              { product_id: variant.id, location_id: locationId, inventory_quantity: product.stock },
              { label: `${product.name} → ${product.stock}` },
            );
            await odoo.call('stock.quant', 'action_apply_inventory', [[quantId]]);
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- kits */
  if (wanted.includes('kits')) {
    heading('Deals');
    if (!apps.has('mrp')) {
      notes.push(
        'Deals and the Miracle Knot Box are kits — one price, several packs off the shelf. ' +
          'Odoo does that with a phantom bill of materials, which needs the Manufacturing app. ' +
          'Install it and re-run with --stage=kits, or the deals sell without drawing their ' +
          'components down.',
      );
      log('  ⚠ Manufacturing app not installed — deals created without their kit behaviour');
    }

    for (const kit of kitsFor()) {
      const deal = DEALS.find((entry) => entry.slug === kit.deal);
      const templateId = await odoo.ensure(
        'product.template',
        [['default_code', '=', kit.sku]],
        {
          name: `${deal.name}${kit.label ? ` · ${kit.label}` : ''}`,
          default_code: kit.sku,
          ...typeFields,
          categ_id: internalCategory.get(deal.category),
          list_price: kit.price,
          description_sale: deal.description || false,
          ...(apps.has('website_sale') ? { is_published: true } : {}),
          ...(apps.has('point_of_sale') ? { available_in_pos: true } : {}),
        },
        { label: `${deal.name} ${kit.label || ''}`, update: true },
      );

      if (!apps.has('mrp')) continue;

      const productId = await odoo.searchOne('product.product', [['product_tmpl_id', '=', templateId]], ['id']);
      if (!productId) continue;

      const existingBom = await odoo.searchOne('mrp.bom', [['product_tmpl_id', '=', templateId]], ['id']);
      if (existingBom) {
        log(`  have kit recipe for ${kit.sku}`);
        continue;
      }

      const lines = [];
      for (const component of kit.components) {
        const match = await odoo.searchOne('product.product', [['default_code', '=', component.sku]], ['id']);
        if (!match) {
          notes.push(`Kit ${kit.sku} needs ${component.sku}, which is not in Odoo.`);
          continue;
        }
        lines.push([0, 0, { product_id: match.id, product_qty: component.quantity }]);
      }

      await odoo.create(
        'mrp.bom',
        {
          product_tmpl_id: templateId,
          type: 'phantom',
          product_qty: 1,
          bom_line_ids: lines,
        },
        { label: `kit recipe for ${kit.sku}` },
      );
    }
  }

  /* ------------------------------------------------------------ delivery */
  if (wanted.includes('delivery') && apps.has('delivery')) {
    heading('Delivery');
    const country = await odoo.searchOne('res.country', [['code', '=', 'BB']], ['id']);

    const deliveryProductId = await odoo.ensure(
      'product.template',
      [['default_code', '=', 'DELIVERY-HAIRIFY']],
      { name: 'Delivery', default_code: 'DELIVERY-HAIRIFY', type: 'service', list_price: 0 },
      { label: 'Delivery (the charge line)' },
    );
    const deliveryVariant = await odoo.searchOne(
      'product.product',
      [['product_tmpl_id', '=', deliveryProductId]],
      ['id'],
    );

    for (const carrier of deliveryCarriers()) {
      let stateId = null;
      if (country) {
        const state = await odoo.searchOne(
          'res.country.state',
          [
            ['country_id', '=', country.id],
            ['name', 'ilike', carrier.parish.replace('St. ', 'St')],
          ],
          ['id'],
        );
        stateId = state?.id || null;
        if (!stateId) notes.push(`Odoo has no parish named "${carrier.parish}", so that carrier is unrestricted.`);
      }

      const carrierId = await odoo.ensure(
        'delivery.carrier',
        [['name', '=', carrier.name]],
        {
          name: carrier.name,
          delivery_type: 'base_on_rule',
          product_id: deliveryVariant?.id,
          ...(country ? { country_ids: [[6, 0, [country.id]]] } : {}),
          ...(stateId ? { state_ids: [[6, 0, [stateId]]] } : {}),
          ...(apps.has('website_sale') ? { website_published: true } : {}),
        },
        { label: carrier.name, update: true },
      );

      const haveRules = await odoo.searchRead('delivery.price.rule', [['carrier_id', '=', carrierId]], ['id']);
      if (haveRules.length) {
        log(`  have rates for ${carrier.parish}`);
        continue;
      }

      for (const rule of carrier.rules) {
        await odoo.create(
          'delivery.price.rule',
          { carrier_id: carrierId, ...rule },
          {
            label: `${carrier.parish}: $${rule.list_base_price}${
              rule.max_value ? ` over $${rule.max_value}` : ' standard'
            }`,
          },
        );
      }
    }
  }

  /* ----------------------------------------------------------------- pos */
  if (wanted.includes('pos') && apps.has('point_of_sale')) {
    heading('Till');
    await odoo.ensure(
      'pos.config',
      [['name', '=', 'Front counter']],
      { name: 'Front counter' },
      { label: 'Front counter' },
    );
  }

  /* -------------------------------------------------------------- report */
  heading('Done');
  for (const line of odoo.summary()) log(`  ${line}`);
  if (notes.length) {
    heading('Still to do');
    notes.forEach((note, index) => log(`  ${index + 1}. ${note}`));
  }
}

run().catch((error) => {
  if (error instanceof OdooError) {
    console.error(`\nOdoo: ${error.message}`);
    if (error.data?.debug && process.env.ODOO_DEBUG) console.error(error.data.debug);
    process.exit(1);
  }
  throw error;
});
