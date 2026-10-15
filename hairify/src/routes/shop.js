import express from 'express';
import { getDb } from '../db/index.js';
import { toString } from '../lib/html.js';
import {
  getCategory,
  getProduct,
  listCategories,
  listProducts,
  productImages,
  productVariants,
  relatedProducts,
  packGuideProducts,
  tileCategories,
} from '../lib/catalog.js';
import {
  addToCart,
  cartCount,
  cartLines,
  clearCart,
  getOrCreateCart,
  getOrderByReference,
  placeOrder,
  quoteDelivery,
  removeCartItem,
  setCartQuantity,
  totalsFor,
} from '../lib/orders.js';
import { capturePayment, markOrderPaid } from '../lib/payments.js';
import { defaultLocation, getSettings, storeHours } from '../lib/settings.js';
import { localParts, openingStatus, sameDayCountdown } from '../lib/store.js';
import { homePage } from '../views/home.js';
import { productPage } from '../views/product.js';
import {
  cartPage,
  checkoutPage,
  deliveryPage,
  listingPage,
  notFoundPage,
  orderLookupPage,
  packGuidePage,
  testPayPage,
  thanksPage,
  visitPage,
} from '../views/shop.js';

export const shopRouter = express.Router();

const CART_COOKIE = 'hairify_cart';

/** Puts the shared page context (settings, nav, bag, countdown) on the request. */
shopRouter.use((req, res, next) => {
  const db = getDb();
  const settings = getSettings(db);
  const cart = getOrCreateCart(db, req.cookies[CART_COOKIE]);

  if (req.cookies[CART_COOKIE] !== cart.token) {
    res.cookie(CART_COOKIE, cart.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.app.get('trust proxy') ? req.secure : false,
      maxAge: 60 * 24 * 60 * 60 * 1000,
    });
  }

  req.db = db;
  req.cart = cart;
  req.location = defaultLocation(db);
  req.ctx = {
    settings,
    navCategories: listCategories(db, { navOnly: true }),
    cartCount: cartCount(db, cart.id),
    countdown: sameDayCountdown(settings),
    searchTerm: typeof req.query.q === 'string' ? req.query.q : '',
  };
  next();
});

function send(res, page) {
  res.type('html').send(toString(page));
}

/* ------------------------------------------------------------------ pages */

shopRouter.get('/', (req, res) => {
  const db = req.db;
  const settings = req.ctx.settings;
  const miracleKnots = getProduct(db, 'miracle-knots-feather-crochet');
  const box = getProduct(db, 'miracle-knot-box');

  send(
    res,
    homePage(req.ctx, {
      categories: tileCategories(db),
      deals: listProducts(db, { kind: 'deal' }),
      bestSellers: listProducts(db, { featured: true, limit: 8 }),
      filters: listCategories(db, { navOnly: true }).slice(0, 4),
      miracleKnots,
      boxSlug: box?.slug,
      boxFromCents: box?.min_cents,
      packGuide: packGuideProducts(db).slice(0, 6),
      hours: storeHours(db),
      opening: openingStatus(storeHours(db)),
      today: localParts().weekday,
      settings,
    }),
  );
});

shopRouter.get('/c/:slug', (req, res, next) => {
  const category = getCategory(req.db, req.params.slug);
  if (!category) return next();

  send(
    res,
    listingPage(req.ctx, {
      heading: category.name,
      lede: category.tagline,
      products: listProducts(req.db, { categoryId: category.id }),
      categories: listCategories(req.db, { navOnly: true }),
      activeSlug: category.slug,
      emptyMessage: 'Nothing in this category just yet — ask us on WhatsApp what is coming in.',
    }),
  );
});

shopRouter.get('/deals', (req, res) => {
  send(
    res,
    listingPage(req.ctx, {
      heading: "Deals you don't want to miss",
      lede: 'Fresh deals every week, in store and online.',
      products: listProducts(req.db, { kind: 'deal' }),
      emptyMessage: 'No deals running right now. Follow us on Instagram to catch the next one.',
    }),
  );
});

shopRouter.get('/best-sellers', (req, res) => {
  send(
    res,
    listingPage(req.ctx, {
      heading: 'Best sellers',
      lede: 'The hair our customers come back for.',
      products: listProducts(req.db, { featured: true }),
      categories: listCategories(req.db, { navOnly: true }),
    }),
  );
});

shopRouter.get('/search', (req, res) => {
  const term = (req.query.q || '').trim();
  const products = term
    ? [
        ...listProducts(req.db, { search: term }),
        ...listProducts(req.db, { search: term, kind: 'deal' }),
      ]
    : [];

  send(
    res,
    listingPage(req.ctx, {
      heading: term ? `Results for “${term}”` : 'Search',
      lede: term ? `${products.length} ${products.length === 1 ? 'result' : 'results'}` : 'Search hair, wigs and beauty.',
      products,
      emptyMessage: `We could not find anything for “${term}”. Try a shorter word, or ask us on WhatsApp.`,
    }),
  );
});

shopRouter.get('/p/:slug', (req, res, next) => {
  const db = req.db;
  const product = getProduct(db, req.params.slug);
  if (!product) return next();

  const variants = productVariants(db, product.id, req.location.id);
  if (variants.length === 0) return next();

  // "Buy as" links a bundle to its box and back again.
  const buyAs = [];
  const bundle = getProduct(db, 'miracle-knots-feather-crochet');
  const box = getProduct(db, 'miracle-knot-box');
  if (bundle && box && (product.id === bundle.id || product.id === box.id)) {
    buyAs.push(
      {
        slug: bundle.slug,
        name: 'Single bundle',
        from_cents: bundle.min_cents,
        hint: '135–145g of hair. Buy 2 for a full install.',
        current: product.id === bundle.id,
      },
      {
        slug: box.slug,
        name: 'Miracle Knot Box',
        from_cents: box.min_cents,
        hint: '2 bundles plus lashes and an edge brush.',
        current: product.id === box.id,
      },
    );
  }

  send(
    res,
    productPage(req.ctx, {
      product,
      variants,
      images: productImages(db, product.id),
      completeTheLook: relatedProducts(db, product.id, 'complete-the-look'),
      alsoShop: relatedProducts(db, product.id, 'also-shop'),
      buyAs,
      category: product.category_slug
        ? { slug: product.category_slug, name: product.category_name }
        : null,
    }),
  );
});

shopRouter.get('/delivery', (req, res) => {
  send(
    res,
    deliveryPage(req.ctx, {
      rates: req.db.prepare('SELECT * FROM delivery_rates WHERE active = 1 ORDER BY parish').all(),
    }),
  );
});

shopRouter.get('/visit', (req, res) => {
  const hours = storeHours(req.db);
  send(res, visitPage(req.ctx, { hours, opening: openingStatus(hours), today: localParts().weekday }));
});

shopRouter.get('/pack-guide', (req, res) => {
  send(res, packGuidePage(req.ctx, { products: packGuideProducts(req.db) }));
});

/* ------------------------------------------------------------------- cart */

/** Resolves a quick-add: the first in-stock variant of a product. */
function resolveVariant(db, { variantId, slug }, locationId) {
  if (variantId) {
    const variant = db
      .prepare(
        `SELECT v.*, p.name, p.active AS product_active
           FROM variants v JOIN products p ON p.id = v.product_id
          WHERE v.id = ? AND v.active = 1`,
      )
      .get(Number(variantId));
    return variant?.product_active ? variant : null;
  }
  if (!slug) return null;

  const product = getProduct(db, slug);
  if (!product) return null;
  const variants = productVariants(db, product.id, locationId);
  const variant = variants.find((candidate) => candidate.stock > 0) || variants[0];
  // productVariants reads the variants table alone, so carry the product name
  // across for the "added to your bag" message.
  return variant ? { ...variant, name: product.name } : null;
}

shopRouter.post('/cart/add', (req, res) => {
  const variant = resolveVariant(req.db, req.body, req.location.id);
  if (variant) addToCart(req.db, req.cart.id, variant.id, Math.max(1, Number(req.body.quantity) || 1));
  res.redirect('/cart');
});

shopRouter.post('/api/cart/add', (req, res) => {
  const variant = resolveVariant(req.db, req.body, req.location.id);
  if (!variant) return res.status(404).json({ error: 'We could not find that item.' });

  addToCart(req.db, req.cart.id, variant.id, Math.max(1, Number(req.body.quantity) || 1));
  res.json({
    count: cartCount(req.db, req.cart.id),
    message: `${variant.name} added to your bag`,
  });
});

shopRouter.post('/cart/update', (req, res) => {
  setCartQuantity(req.db, req.cart.id, Number(req.body.itemId), Number(req.body.quantity));
  res.redirect('/cart');
});

shopRouter.post('/cart/remove', (req, res) => {
  removeCartItem(req.db, req.cart.id, Number(req.body.itemId));
  res.redirect('/cart');
});

shopRouter.get('/cart', (req, res) => {
  const lines = cartLines(req.db, req.cart.id, req.location.id);
  send(res, cartPage(req.ctx, { lines, totals: totalsFor(lines) }));
});

/* --------------------------------------------------------------- checkout */

shopRouter.get('/api/delivery-quote', (req, res) => {
  const lines = cartLines(req.db, req.cart.id, req.location.id);
  const totals = totalsFor(lines);
  if (req.query.pickup === 'true') {
    return res.json({ deliveryCents: 0, special: false, totalCents: totals.totalCents });
  }

  const quote = quoteDelivery(req.db, String(req.query.parish || ''), totals.subtotalCents);
  res.json({
    deliveryCents: quote.cents,
    special: quote.special,
    totalCents: totals.subtotalCents + (quote.cents || 0),
  });
});

function checkoutContext(req, { errors = [], values = {} } = {}) {
  const lines = cartLines(req.db, req.cart.id, req.location.id);
  const totals = totalsFor(lines);
  return {
    lines,
    totals,
    parishes: req.db.prepare('SELECT * FROM delivery_rates WHERE active = 1 ORDER BY parish').all(),
    settings: req.ctx.settings,
    paymentProvider: req.app.locals.paymentProvider,
    errors,
    values,
  };
}

shopRouter.get('/checkout', (req, res) => {
  const lines = cartLines(req.db, req.cart.id, req.location.id);
  if (lines.length === 0) return res.redirect('/cart');
  send(res, checkoutPage(req.ctx, checkoutContext(req)));
});

shopRouter.post('/checkout', async (req, res) => {
  const db = req.db;
  const lines = cartLines(db, req.cart.id, req.location.id);
  if (lines.length === 0) return res.redirect('/cart');

  const values = {
    fulfilment: req.body.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    parish: (req.body.parish || '').trim(),
    address: (req.body.address || '').trim(),
    name: (req.body.name || '').trim(),
    phone: (req.body.phone || '').trim(),
    email: (req.body.email || '').trim(),
    notes: (req.body.notes || '').trim(),
    payment: req.body.payment === 'online-card' ? 'online-card' : 'on-delivery',
  };

  const errors = [];
  if (!values.name) errors.push('Please tell us your name.');
  if (!values.phone) errors.push('Please give us a WhatsApp number so we can reach you.');
  if (values.fulfilment === 'delivery') {
    if (!values.parish) errors.push('Please choose the parish we are delivering to.');
    if (!values.address) errors.push('Please give us the delivery address.');
  }
  if (values.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
    errors.push('That email address does not look right.');
  }

  if (errors.length) {
    return send(res, checkoutPage(req.ctx, checkoutContext(req, { errors, values })));
  }

  const totals = totalsFor(lines);
  const quote =
    values.fulfilment === 'delivery' ? quoteDelivery(db, values.parish, totals.subtotalCents) : null;
  if (values.fulfilment === 'delivery' && quote.cents === null) {
    return send(
      res,
      checkoutPage(req.ctx, {
        ...checkoutContext(req, { values }),
        errors: ['We do not have a delivery rate for that parish yet. Please message us on WhatsApp.'],
      }),
    );
  }

  const deliveryCents = quote?.cents ?? 0;
  const countdown = sameDayCountdown(req.ctx.settings);

  let order;
  try {
    order = placeOrder(db, {
      lines: lines.map((line) => ({ variantId: line.variant_id, quantity: line.quantity })),
      channel: 'online',
      fulfilment: values.fulfilment,
      customer: {
        name: values.name,
        email: values.email,
        phone: values.phone,
        parish: values.parish,
        address: values.address,
      },
      locationId: req.location.id,
      parish: values.fulfilment === 'delivery' ? values.parish : null,
      address: values.fulfilment === 'delivery' ? values.address : null,
      deliveryNotes: values.notes || null,
      deliveryCents,
      paymentMethod: values.payment,
      paymentStatus: 'unpaid',
      status: values.payment === 'online-card' ? 'pending-payment' : 'placed',
      promisedWindow: countdown ? req.ctx.settings.delivery_window : null,
      sameDay: Boolean(countdown) && values.fulfilment === 'delivery',
    });
  } catch (error) {
    if (error.code === 'OUT_OF_STOCK') {
      const names = error.shortfalls.map((item) => item.name).join(', ');
      return send(
        res,
        checkoutPage(req.ctx, {
          ...checkoutContext(req, { values }),
          errors: [`Sorry — ${names} sold out while you were shopping. Please adjust your bag.`],
        }),
      );
    }
    throw error;
  }

  if (values.payment === 'online-card') {
    const payment = await capturePayment(req.app.locals.payment, {
      order,
      siteUrl: req.app.locals.siteUrl,
    });
    if (payment.redirectUrl) {
      clearCart(db, req.cart.id);
      return res.redirect(payment.redirectUrl);
    }
    if (!payment.ok) {
      return send(
        res,
        checkoutPage(req.ctx, {
          ...checkoutContext(req, { values }),
          errors: [payment.error || 'That card payment did not go through. Please try again.'],
        }),
      );
    }
  }

  clearCart(db, req.cart.id);
  res.redirect(`/thanks/${order.reference}`);
});

shopRouter.get('/thanks/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();
  send(res, thanksPage(req.ctx, { order }));
});

shopRouter.get('/order-lookup', (req, res) => {
  const reference = (req.query.reference || '').trim().toUpperCase();
  if (!reference) return send(res, orderLookupPage(req.ctx, {}));

  const order = getOrderByReference(req.db, reference);
  send(
    res,
    orderLookupPage(req.ctx, {
      order,
      reference,
      error: order ? null : 'We could not find an order with that number.',
    }),
  );
});

shopRouter.post('/subscribe', (req, res) => {
  const contact = (req.body.contact || '').trim();
  if (contact) {
    const kind = contact.includes('@') ? 'email' : 'whatsapp';
    req.db
      .prepare('INSERT INTO subscribers (contact, kind) VALUES (?, ?) ON CONFLICT (contact) DO NOTHING')
      .run(contact, kind);
  }
  res.redirect('/?subscribed=1');
});

/* ------------------------------------------------------------- card pages */

/**
 * The test card page used while `PAYMENT_PROVIDER=manual`. It takes no card
 * details and moves no money — it exists so the whole checkout can be walked
 * through before the merchant account is live.
 */
shopRouter.get('/pay/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();
  if (order.payment_status === 'paid') return res.redirect(`/thanks/${order.reference}`);
  send(res, testPayPage(req.ctx, { order }));
});

shopRouter.post('/pay/:reference', (req, res, next) => {
  const order = getOrderByReference(req.db, req.params.reference);
  if (!order) return next();

  if (req.body.outcome === 'decline') {
    return send(
      res,
      testPayPage(req.ctx, { order, error: 'The card was declined. Try again or pay on delivery.' }),
    );
  }

  markOrderPaid(req.db, order, { providerRef: 'TEST-PAYMENT' });
  res.redirect(`/thanks/${order.reference}`);
});

/** Where a live gateway sends the shopper back to. */
shopRouter.get('/payment-return', (req, res, next) => {
  const order = getOrderByReference(req.db, String(req.query.reference || ''));
  if (!order) return next();

  if (req.query.status === 'paid') {
    markOrderPaid(req.db, order, { providerRef: String(req.query.ref || '') || null });
    return res.redirect(`/thanks/${order.reference}`);
  }
  res.redirect(`/pay/${order.reference}`);
});

/** 404 for anything the storefront does not recognise. */
shopRouter.use((req, res) => {
  res.status(404).type('html').send(toString(notFoundPage(req.ctx)));
});
