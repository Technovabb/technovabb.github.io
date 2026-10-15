import { html } from '../lib/html.js';
import { formatPrice } from '../lib/money.js';
import { ICONS, layout, productCard, tick } from './layout.js';
import { formatTime, weekdayName } from '../lib/store.js';

const IG_TILES = ['010', '011', '012', '013', '014', '015'];

export function homePage(ctx, data) {
  const { settings } = ctx;
  const { categories, deals, bestSellers, filters, miracleKnots, packGuide, hours, opening, today } = data;
  const waLink = `https://wa.me/${settings.store_whatsapp}`;

  const body = html`
    <section class="hero">
      <div class="shell hero-grid">
        <div>
          <p class="hero-eyebrow">${ICONS.store} ${settings.store_address} · delivering islandwide</p>
          <h1>We know<span class="accent">hair.</span></h1>
          <p class="hero-lede">
            Bundles, wigs, crochet and braiding hair, beauty and more, from the Hairify team. Order
            online and we bring it to you, anywhere in Barbados.
          </p>
          <div class="hero-actions">
            <a class="btn btn-pink btn-lg" href="/c/hair">Shop hair</a>
            <a class="btn btn-outline btn-lg" href="${waLink}" target="_blank" rel="noreferrer">
              ${ICONS.whatsapp} Chat on WhatsApp
            </a>
          </div>
          <ul class="hero-points">
            <li><span class="dot">${tick()}</span> Order by ${formatTime(settings.same_day_cutoff)} for same-day delivery</li>
            <li><span class="dot">${tick()}</span> Pay online or when it arrives</li>
            <li><span class="dot">${tick()}</span> Pick up in store at Warrens</li>
          </ul>
        </div>
        <div class="hero-media">
          <img src="/img/brand/hero.jpg" alt="Miracle Knots bundles held up in store" width="900" height="675" />
          ${miracleKnots
            ? html`<a class="hero-badge" href="/p/${miracleKnots.slug}">
                <img src="${miracleKnots.image}" alt="" />
                <span>
                  <span class="label">Best seller</span>
                  <span class="name">${miracleKnots.name.split(' ').slice(0, 2).join(' ')}</span>
                  <span class="price">From ${formatPrice(miracleKnots.min_cents)}</span>
                </span>
              </a>`
            : ''}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="section-head">
          <div><h2>Shop by category</h2></div>
          <a class="section-link" href="/best-sellers">See best sellers →</a>
        </div>
        <div class="cat-grid">
          ${categories.map(
            (category) => html`
              <a class="cat-tile" href="/c/${category.slug}">
                <img src="${category.image}" alt="${category.name}" loading="lazy" />
                <span class="cat-name">${category.name}</span>
              </a>
            `,
          )}
        </div>
      </div>
    </section>

    ${deals.length
      ? html`<section class="section section-blush">
          <div class="shell">
            <div class="section-head">
              <div>
                <h2>Deals you don't want to miss</h2>
                <p>Fresh deals every week, in store and online.</p>
              </div>
              <a class="section-link" href="/deals">All deals →</a>
            </div>
            <div class="deal-grid">
              ${deals.map(
                (deal) => html`
                  <article class="deal-card">
                    ${deal.image ? html`<img src="${deal.image}" alt="${deal.image_alt}" loading="lazy" />` : ''}
                    <div class="deal-body">
                      ${deal.eyebrow ? html`<span class="eyebrow">${deal.eyebrow}</span>` : ''}
                      <h3>${deal.name}</h3>
                      <span class="deal-price">
                        ${deal.min_cents === deal.max_cents
                          ? formatPrice(deal.min_cents)
                          : `From ${formatPrice(deal.min_cents)}`}
                      </span>
                      <p>${deal.description}</p>
                      <a class="btn btn-pink" href="/p/${deal.slug}">Add to bag</a>
                    </div>
                  </article>
                `,
              )}
            </div>
          </div>
        </section>`
      : ''}

    <section class="section">
      <div class="shell">
        <div class="section-head">
          <h2>Best sellers</h2>
          <div class="pill-row">
            <a class="pill" href="/best-sellers" aria-current="true">All</a>
            ${filters.map((filter) => html`<a class="pill" href="/c/${filter.slug}">${filter.name}</a>`)}
          </div>
        </div>
        <div class="product-grid">${bestSellers.map((product) => productCard(product))}</div>
      </div>
    </section>

    ${miracleKnots
      ? html`<section class="showcase">
          <div class="shell">
            <img src="/img/brand/compare-grams.jpg" alt="Miracle Knots bundles by texture" loading="lazy" />
            <div>
              <p class="eyebrow">Compare our Miracle Knots</p>
              <h2>The grams.</h2>
              <p>
                Each bundle packs 135–145g of hair, so most full installs take just 2 bundles.
                Lightweight, reusable, and no braiding hair needed. Just install and go.
              </p>
              <div class="chips">
                <span>5 textures</span><span>14" to 20"</span><span>Natural black</span><span>Reusable</span>
              </div>
              <p>
                <strong>
                  Bundles from ${formatPrice(miracleKnots.min_cents)}${data.boxFromCents
                    ? ` · Miracle Knot Box from ${formatPrice(data.boxFromCents)}`
                    : ''}
                </strong>
              </p>
              <div class="actions">
                <a class="btn btn-white" href="/p/${miracleKnots.slug}">Shop Miracle Knots</a>
                ${data.boxSlug
                  ? html`<a class="btn btn-ink" href="/p/${data.boxSlug}">Get the box</a>`
                  : ''}
              </div>
            </div>
          </div>
        </section>`
      : ''}

    <section class="section">
      <div class="shell">
        <div class="pack-guide">
          <div>
            <p class="eyebrow">Pack guide</p>
            <h2>How many packs do I need?</h2>
            <p style="color:var(--ink-soft);margin-top:1rem">
              Pick your hair and we'll show you what a full head takes, so you never get home one
              pack short. Still not sure? Send us a photo of the style and we'll tell you.
            </p>
            <a class="btn btn-outline" href="${waLink}" target="_blank" rel="noreferrer">
              ${ICONS.whatsapp} Send us a photo on WhatsApp
            </a>
          </div>
          <div class="pack-picker" data-pack-guide>
            <h3>Choose your hair</h3>
            <div class="pack-options">
              ${packGuide.map(
                (product, index) => html`
                  <button
                    class="pack-option"
                    type="button"
                    aria-pressed="${index === 0 ? 'true' : 'false'}"
                    data-packs-min="${product.packs_min}"
                    data-packs-max="${product.packs_max || product.packs_min}"
                    data-price="${product.min_cents}"
                    data-name="${product.name}"
                    data-slug="${product.slug}"
                    data-unit="${product.unit_label}"
                  >
                    <span class="name">${product.name}</span>
                    <span class="price">${formatPrice(product.min_cents)} ${product.unit_label}</span>
                  </button>
                `,
              )}
            </div>
            <div class="pack-answer">
              <span class="count" data-pack-count>—</span>
              <span class="detail">
                <strong>Packs for a full head</strong>
                <span data-pack-detail></span>
              </span>
            </div>
            <a class="btn btn-pink btn-block" style="margin-top:1rem" data-pack-link href="#">
              See this hair
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-blush">
      <div class="shell">
        <div class="section-head"><h2>Get it your way</h2></div>
        <div class="ways-grid">
          <div class="way-card">
            <span class="icon">${ICONS.truck}</span>
            <h3>Same day, islandwide</h3>
            <p>
              Order by ${formatTime(settings.same_day_cutoff)}, Monday to Saturday, and we deliver
              the same day between ${settings.delivery_window.replace(' to ', ' and ')}.
            </p>
          </div>
          <div class="way-card">
            <span class="icon">${ICONS.truck}</span>
            <h3>Special rates over $${Number(settings.delivery_special_threshold_cents) / 100}</h3>
            <p>
              Spend over $${Number(settings.delivery_special_threshold_cents) / 100} and your delivery
              comes at a special rate.
            </p>
          </div>
          <div class="way-card">
            <span class="icon">${ICONS.store}</span>
            <h3>Pick up in store</h3>
            <p>Order online and collect at ${settings.store_address}. We message you when it's ready.</p>
          </div>
          <div class="way-card">
            <span class="icon">${ICONS.card}</span>
            <h3>Pay your way</h3>
            <p>Pay online by card when you order, or pay when your order arrives.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell store-grid">
        <img src="/img/brand/store-interior.jpg" alt="Inside the Hairify store at Warrens" loading="lazy" />
        <div>
          <p class="eyebrow">Come see us</p>
          <h2>${settings.store_address}</h2>
          <p style="margin-top:.75rem;color:var(--ink-soft)">${settings.store_parish}</p>
          <p class="open-pill ${opening.open ? 'is-open' : ''}"><span class="dot"></span> ${opening.label}</p>
          <table class="hours-table">
            <tbody>
              ${hours.map(
                (row) => html`
                  <tr class="${row.weekday === today ? 'is-today' : ''}">
                    <th scope="row">${weekdayName(row.weekday)}</th>
                    <td>${row.closed ? 'Closed' : `${formatTime(row.opens)} – ${formatTime(row.closes)}`}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
          <div class="hero-actions" style="margin:0">
            <a class="btn btn-outline btn-sm" href="${settings.store_maps_url}" target="_blank" rel="noreferrer">Get directions</a>
            <a class="btn btn-outline btn-sm" href="tel:${settings.store_phone.replace(/[^\d+]/g, '')}">Call ${settings.store_phone}</a>
            <a class="btn btn-pink btn-sm" href="${waLink}" target="_blank" rel="noreferrer">WhatsApp us</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-blush">
      <div class="shell">
        <div class="section-head">
          <div>
            <h2>@${settings.instagram}</h2>
            <p>Hair inspo, new arrivals and a whole lot of fun, every day on Instagram.</p>
          </div>
          <a class="btn btn-ink btn-sm" href="https://instagram.com/${settings.instagram}" target="_blank" rel="noreferrer">
            Follow on Instagram
          </a>
        </div>
        <div class="ig-grid">
          ${IG_TILES.map(
            (id) => html`<a href="https://instagram.com/${settings.instagram}" target="_blank" rel="noreferrer">
              <img src="/img/brand/ig-${id}.jpg" alt="Hairify on Instagram" loading="lazy" />
            </a>`,
          )}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="shell">
        <div class="signup">
          <div>
            <h2>Be first to know.</h2>
            <p>New hair, restocks and deals, sent straight to your WhatsApp or inbox.</p>
          </div>
          <div>
            <form method="post" action="/subscribe">
              <label class="visually-hidden" for="subscribe">WhatsApp number or email</label>
              <input id="subscribe" name="contact" required placeholder="e.g. 246 555 0123" />
              <button class="btn btn-ink" type="submit">Sign me up</button>
            </form>
            <p class="note">We only message you about new arrivals and deals.</p>
          </div>
        </div>
      </div>
    </section>
  `;

  return layout(ctx, {
    title: null,
    description:
      'Shop bundles, wigs, crochet and braiding hair, beauty and fragrance from Hairify at Manor Lodge Complex, Warrens. Same-day delivery anywhere in Barbados.',
    body,
  });
}
