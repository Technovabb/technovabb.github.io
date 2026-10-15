import { html, jsonScript, raw } from '../lib/html.js';
import { formatPrice } from '../lib/money.js';
import { ICONS, layout, productCard } from './layout.js';
import { formatTime } from '../lib/store.js';

/** Distinct values for an axis, in the order the variants list them. */
function axisValues(variants, key) {
  const seen = new Map();
  for (const variant of variants) {
    const value = variant[key];
    if (value && !seen.has(value)) seen.set(value, variant);
  }
  return [...seen.keys()];
}

export function productPage(ctx, data) {
  const { settings, countdown } = ctx;
  const { product, variants, images, completeTheLook, alsoShop, buyAs, category } = data;
  const waLink = `https://wa.me/${settings.store_whatsapp}`;

  const textures = axisValues(variants, 'texture');
  const lengths = axisValues(variants, 'length');
  const colours = axisValues(variants, 'colour');
  // A single shared value (every Miracle Knot is natural black) is a fact to
  // state, not a choice to make.
  const colourIsChoice = colours.length > 1;

  const inStock = variants.some((variant) => variant.stock > 0);
  const gallery = images.length
    ? images
    : [{ url: product.image, alt: product.image_alt }].filter((image) => image.url);

  const payload = variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    texture: variant.texture,
    length: variant.length,
    colour: variant.colour,
    price: variant.price_cents,
    stock: variant.stock,
  }));

  const body = html`
    <div class="shell">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Home</a> /
        ${category ? html`<a href="/c/${category.slug}">${category.name}</a> / ` : ''}
        <span>${product.name}</span>
      </nav>

      <div class="pdp" data-product data-slug="${product.slug}">
        <div>
          <div class="gallery-main">
            ${product.badge ? html`<span class="badge is-${product.badge}">${product.badge.replace('-', ' ')}</span>` : ''}
            ${gallery.length
              ? html`<img id="galleryMain" src="${gallery[0].url}" alt="${gallery[0].alt || product.name}" width="900" height="900" />`
              : html`<span class="placeholder">${product.name.slice(0, 1)}</span>`}
          </div>
          ${gallery.length > 1
            ? html`<div class="gallery-thumbs" role="group" aria-label="Product images">
                ${gallery.map(
                  (image, index) => html`
                    <button type="button" data-gallery-thumb="${image.url}" aria-current="${index === 0 ? 'true' : 'false'}">
                      <img src="${image.url}" alt="${image.alt || product.name}" loading="lazy" />
                    </button>
                  `,
                )}
              </div>`
            : ''}
        </div>

        <div>
          ${product.eyebrow ? html`<p class="pdp-eyebrow">${product.eyebrow}</p>` : ''}
          <h1>${product.name}</h1>

          <p class="pdp-price">
            <span class="amount" data-price-display>${formatPrice(variants[0]?.price_cents ?? product.min_cents)}</span>
            <span class="unit" data-unit-display>
              ${product.unit_label !== 'each' ? product.unit_label : ''}
              ${variants[0]?.length ? ` · ${variants[0].length}` : ''}
            </span>
          </p>

          ${product.description ? html`<p class="pdp-desc">${product.description}</p>` : ''}

          ${buyAs.length
            ? html`<div class="option-group">
                <p class="option-label">Buy as</p>
                <div class="buy-as">
                  ${buyAs.map((option) =>
                    option.current
                      ? html`<div class="buy-as-current">
                          <span class="row">
                            <span class="name">${option.name}</span>
                            <span class="from">From ${formatPrice(option.from_cents)}</span>
                          </span>
                          <span class="hint">${option.hint}</span>
                        </div>`
                      : html`<a href="/p/${option.slug}">
                          <span class="row">
                            <span class="name">${option.name}</span>
                            <span class="from">From ${formatPrice(option.from_cents)}</span>
                          </span>
                          <span class="hint">${option.hint}</span>
                        </a>`,
                  )}
                </div>
              </div>`
            : ''}

          ${textures.length > 1
            ? html`<div class="option-group" data-axis="texture">
                <p class="option-label">
                  Texture: <span class="chosen" data-axis-chosen="texture">${textures[0]}</span>
                </p>
                <div class="option-list">
                  ${textures.map(
                    (value, index) => html`<button
                      class="option-btn"
                      type="button"
                      data-axis-value="texture"
                      data-value="${value}"
                      aria-pressed="${index === 0 ? 'true' : 'false'}"
                    >
                      ${value}
                    </button>`,
                  )}
                </div>
              </div>`
            : ''}

          ${lengths.length > 1
            ? html`<div class="option-group" data-axis="length">
                <p class="option-label">Length</p>
                <div class="option-list">
                  ${lengths.map(
                    (value, index) => html`<button
                      class="option-btn has-price"
                      type="button"
                      data-axis-value="length"
                      data-value="${value}"
                      aria-pressed="${index === 0 ? 'true' : 'false'}"
                    >
                      <span>${value}</span>
                      <span class="opt-price" data-length-price="${value}"></span>
                    </button>`,
                  )}
                </div>
              </div>`
            : ''}

          ${colourIsChoice
            ? html`<div class="option-group" data-axis="colour">
                <p class="option-label">
                  Colour: <span class="chosen" data-axis-chosen="colour">${colours[0]}</span>
                </p>
                <div class="option-list">
                  ${colours.map(
                    (value, index) => html`<button
                      class="option-btn"
                      type="button"
                      data-axis-value="colour"
                      data-value="${value}"
                      aria-pressed="${index === 0 ? 'true' : 'false'}"
                    >
                      ${value}
                    </button>`,
                  )}
                </div>
              </div>`
            : colours.length === 1
              ? html`<p class="option-label" style="margin-bottom:1.25rem">
                  Colour: <span class="chosen">${colours[0]}</span>
                </p>`
              : ''}

          <p class="stock-note" data-stock-note aria-live="polite"></p>

          <form class="add-row" method="post" action="/cart/add" data-add-form>
            <input type="hidden" name="variantId" data-variant-input value="${variants[0]?.id ?? ''}" />
            <div class="qty">
              <button type="button" data-qty="-1" aria-label="Fewer">−</button>
              <label class="visually-hidden" for="qty">Quantity</label>
              <input id="qty" type="number" name="quantity" value="1" min="1" max="99" />
              <button type="button" data-qty="1" aria-label="More">+</button>
            </div>
            <button class="btn btn-pink btn-lg" type="submit" ${inStock ? '' : raw('disabled')}>
              ${ICONS.bag} <span data-add-label>${inStock ? 'Add to bag' : 'Out of stock'}</span>
            </button>
          </form>

          ${product.packs_min
            ? html`<p class="stock-note is-in">
                ${product.packs_min === product.packs_max
                  ? `${product.packs_min} ${product.unit_label === 'per bundle' ? 'bundles' : 'packs'} give a full install.`
                  : `${product.packs_min} to ${product.packs_max} packs give a full head.`}
              </p>`
            : ''}

          <p style="margin-top:.75rem">
            <a href="${waLink}" target="_blank" rel="noreferrer" style="font-weight:700">
              ${ICONS.whatsapp} Not sure? Ask us on WhatsApp
            </a>
          </p>

          <div class="pdp-assurances">
            <div class="item">
              <span class="icon">${ICONS.truck}</span>
              <span>
                <strong>
                  ${countdown
                    ? `Order in the next ${countdown.label} to get it today.`
                    : `Order by ${formatTime(settings.same_day_cutoff)} for same-day delivery.`}
                </strong>
                <span>Islandwide delivery, ${settings.delivery_window}, Monday to Saturday.</span>
              </span>
            </div>
            <div class="item">
              <span class="icon">${ICONS.store}</span>
              <span>
                <strong data-stock-location>
                  ${inStock ? `In stock at ${settings.store_address}` : 'Ask us about restocks'}
                </strong>
                <span>Pick up in store. We message you when it's ready.</span>
              </span>
            </div>
            <div class="item">
              <span class="icon">${ICONS.card}</span>
              <span>
                <strong>Pay your way</strong>
                <span>Pay online by card, or pay when your order arrives.</span>
              </span>
            </div>
          </div>

          ${product.description || product.how_to || product.care_notes
            ? html`<div class="accordion">
                ${product.description
                  ? html`<details>
                      <summary>About this hair</summary>
                      <div class="content">${product.description}</div>
                    </details>`
                  : ''}
                ${product.how_to
                  ? html`<details open>
                      <summary>How to wear it</summary>
                      <div class="content">${product.how_to}</div>
                    </details>`
                  : ''}
                ${product.care_notes
                  ? html`<details>
                      <summary>Wear it again and again</summary>
                      <div class="content">${product.care_notes}</div>
                    </details>`
                  : ''}
              </div>`
            : ''}
        </div>
      </div>
    </div>

    ${completeTheLook.length
      ? html`<section class="section section-blush">
          <div class="shell">
            <div class="section-head">
              <div>
                <h2>Complete the look</h2>
                <p>A little leave-in and curl jelly keep these juicy.</p>
              </div>
            </div>
            <div class="product-grid">${completeTheLook.map((item) => productCard(item))}</div>
          </div>
        </section>`
      : ''}

    ${alsoShop.length
      ? html`<section class="section">
          <div class="shell">
            <div class="section-head"><h2>Customers also shop</h2></div>
            <div class="product-grid">${alsoShop.map((item) => productCard(item))}</div>
          </div>
        </section>`
      : ''}
  `;

  return layout(ctx, {
    title: product.name,
    description: product.description || product.subtitle,
    body,
    scripts: html`<script id="variantData" type="application/json">${jsonScript(payload)}</script>`,
  });
}
