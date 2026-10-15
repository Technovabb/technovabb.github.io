import { html, raw } from '../lib/html.js';
import { formatPrice } from '../lib/money.js';

const ICONS = {
  search: raw(
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  ),
  bag: raw(
    '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>',
  ),
  menu: raw(
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  ),
  truck: raw(
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>',
  ),
  store: raw(
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16v11H4z"/><path d="M3 5h18l-1 4H4Z"/></svg>',
  ),
  card: raw(
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/></svg>',
  ),
  whatsapp: raw(
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm5.3 14c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1a12.6 12.6 0 0 1-5.6-4.6c-.5-.8-.9-1.7-.9-2.5 0-.8.4-1.4.7-1.7.2-.2.4-.3.6-.3h.5c.2 0 .4 0 .6.4l.7 1.7c.1.2 0 .4-.1.5l-.4.5c-.1.2-.3.3-.1.6a9 9 0 0 0 3.5 3c.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.6.8c.3.1.4.2.4.3.1.1.1.7-.1 1.3Z"/></svg>',
  ),
};

export { ICONS };

export function tick() {
  return raw(
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 13 4.5 4.5L19 7"/></svg>',
  );
}

function promoMessage(countdown, settings) {
  if (countdown) {
    return html`Same-day delivery islandwide. Order in the next
      <strong>${countdown.label}</strong> to get it today.`;
  }
  return html`Same-day delivery islandwide. Order before
    ${countdown?.cutoffLabel || '3:30pm'}, Monday to Saturday.`;
}

/**
 * The storefront page shell.
 *
 * `ctx` carries what every page needs: settings, nav categories, bag count and
 * the same-day countdown, all put there by `withStore` in the routes.
 */
export function layout(ctx, { title, description, body, bodyClass = '', head = '', scripts = [] }) {
  const { settings, navCategories, cartCount, countdown, searchTerm = '' } = ctx;
  const waLink = `https://wa.me/${settings.store_whatsapp}`;

  const searchForm = html`
    <form class="search-form" role="search" action="/search" method="get">
      <span class="search-icon">${ICONS.search}</span>
      <label class="visually-hidden" for="q">Search hair, wigs, beauty</label>
      <input id="q" type="search" name="q" value="${searchTerm}" placeholder="Search hair, wigs, beauty" />
    </form>
  `;

  const navLinks = html`
    ${navCategories.map(
      (category) => html`<a href="/c/${category.slug}">${category.name}</a>`,
    )}
    <a class="is-deals" href="/deals">Deals</a>
  `;

  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title ? `${title} · ${settings.store_name}` : settings.store_name}</title>
    <meta name="description" content="${description || 'Bundles, wigs, crochet and beauty, delivered anywhere in Barbados.'}" />
    <meta name="theme-color" content="#e5007d" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800;900&family=Figtree:wght@400;500;600;700;800&display=swap"
    />
    <link rel="stylesheet" href="/css/store.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    ${head}
  </head>
  <body class="${bodyClass}">
    <a class="visually-hidden" href="#main">Skip to content</a>

    <div class="promo-bar">
      <div class="shell">
        <span>${ICONS.truck} ${promoMessage(countdown, settings)}</span>
        <span class="promo-bar-links">
          <a href="tel:${settings.store_phone.replace(/[^\d+]/g, '')}">${settings.store_phone}</a>
          <a class="promo-keep" href="${waLink}" target="_blank" rel="noreferrer">WhatsApp us</a>
        </span>
      </div>
    </div>

    <header class="site-header">
      <div class="shell header-main">
        <a class="logo" href="/">Hairify</a>
        <nav class="main-nav" aria-label="Shop">${navLinks}</nav>
        <div class="header-tools">
          ${searchForm}
          <a class="bag-button" href="/cart" aria-label="Your bag, ${cartCount} items">
            ${ICONS.bag}
            ${cartCount > 0 ? html`<span class="bag-count">${cartCount}</span>` : ''}
          </a>
          <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Menu">
            ${ICONS.menu}
          </button>
        </div>
      </div>
      <nav class="shell mobile-nav" id="mobile-nav" aria-label="Shop, mobile">
        ${searchForm} ${navLinks}
        <a href="/delivery">Delivery and pickup</a>
        <a href="/pack-guide">Pack guide</a>
        <a href="/visit">Opening hours</a>
      </nav>
    </header>

    <main id="main">${body}</main>

    <footer class="site-footer">
      <div class="shell">
        <div class="footer-grid">
          <div>
            <a class="logo" href="/">Hairify</a>
            <p>${settings.store_address}<br />${settings.store_parish}<br />${settings.store_phone}</p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              ${navCategories.map((category) => html`<li><a href="/c/${category.slug}">${category.name}</a></li>`)}
              <li><a href="/deals">Deals</a></li>
            </ul>
          </div>
          <div>
            <h4>Help</h4>
            <ul>
              <li><a href="/delivery">Delivery and pickup</a></li>
              <li><a href="/pack-guide">Pack guide</a></li>
              <li><a href="/visit">Opening hours</a></li>
              <li><a href="/order-lookup">Track an order</a></li>
              <li><a href="${waLink}" target="_blank" rel="noreferrer">Contact us</a></li>
            </ul>
          </div>
          <div>
            <h4>Follow</h4>
            <ul>
              <li><a href="https://instagram.com/${settings.instagram}" target="_blank" rel="noreferrer">Instagram · @${settings.instagram}</a></li>
              <li><a href="https://instagram.com/${settings.instagram_beauty}" target="_blank" rel="noreferrer">Beauty corner · @${settings.instagram_beauty}</a></li>
              <li><a href="https://instagram.com/${settings.instagram_cropover}" target="_blank" rel="noreferrer">Crop Over corner · @${settings.instagram_cropover}</a></li>
              <li><a href="https://tiktok.com/@${settings.tiktok}" target="_blank" rel="noreferrer">TikTok · @${settings.tiktok}</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-base">
          <span>© ${new Date().getFullYear()} ${settings.store_name}. Prices in Barbados dollars.</span>
          <span>hairifybb.com</span>
        </div>
      </div>
    </footer>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <script src="/js/store.js" defer></script>
    ${scripts}
  </body>
</html>`;
}

/** The card used in every product grid on the site. */
export function productCard(product, { showQuickAdd = true } = {}) {
  const priceLabel =
    product.min_cents === product.max_cents
      ? formatPrice(product.min_cents)
      : `From ${formatPrice(product.min_cents)}`;

  return html`
    <article class="product-card">
      <div class="media">
        ${product.badge ? html`<span class="badge is-${product.badge}">${product.badge.replace('-', ' ')}</span>` : ''}
        <a href="/p/${product.slug}" aria-label="${product.name}">
          ${product.image
            ? html`<img src="${product.image}" alt="${product.image_alt}" loading="lazy" />`
            : html`<span class="placeholder">${product.name.slice(0, 1)}</span>`}
        </a>
        ${showQuickAdd
          ? html`<button
              class="quick-add"
              type="button"
              data-quick-add="${product.slug}"
              aria-label="Add ${product.name} to bag"
            >
              +
            </button>`
          : ''}
      </div>
      <h3><a href="/p/${product.slug}">${product.name}</a></h3>
      ${product.subtitle ? html`<span class="sub">${product.subtitle}</span>` : ''}
      <span class="price">
        ${priceLabel}
        ${product.unit_label && product.unit_label !== 'each' ? html`<small>${product.unit_label}</small>` : ''}
      </span>
    </article>
  `;
}
