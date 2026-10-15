import { html } from '../lib/html.js';
import { formatMoney, formatPrice } from '../lib/money.js';
import { ICONS, layout, productCard, tick } from './layout.js';
import { formatTime, weekdayName } from '../lib/store.js';

/** Category, search results, deals and best-sellers all share this listing. */
export function listingPage(ctx, { heading, lede, products, categories = [], activeSlug = null, emptyMessage }) {
  const body = html`
    <div class="shell">
      <div class="page-head">
        <h1>${heading}</h1>
        ${lede ? html`<p>${lede}</p>` : ''}
      </div>

      ${categories.length
        ? html`<div class="pill-row" style="margin-bottom:1.75rem">
            ${categories.map(
              (category) => html`<a
                class="pill"
                href="/c/${category.slug}"
                aria-current="${category.slug === activeSlug ? 'true' : 'false'}"
                >${category.name}</a
              >`,
            )}
          </div>`
        : ''}

      ${products.length
        ? html`<div class="product-grid" style="padding-bottom:3rem">
            ${products.map((product) => productCard(product))}
          </div>`
        : html`<div class="empty-state">
            <p>${emptyMessage || 'Nothing here just yet.'}</p>
            <a class="btn btn-pink" href="/">Back to the shop</a>
          </div>`}
    </div>
  `;

  return layout(ctx, { title: heading, description: lede, body });
}

export function cartPage(ctx, { lines, totals, flash }) {
  if (lines.length === 0) {
    return layout(ctx, {
      title: 'Your bag',
      body: html`<div class="shell empty-state">
        <h1>Your bag is empty</h1>
        <p>Bundles, wigs, crochet and beauty are all a tap away.</p>
        <a class="btn btn-pink btn-lg" href="/">Start shopping</a>
      </div>`,
    });
  }

  const body = html`
    <div class="shell">
      <div class="page-head"><h1>Your bag</h1></div>
      ${flash ? html`<p class="alert alert-${flash.kind}">${flash.message}</p>` : ''}

      <div class="cart-layout" style="padding-bottom:3rem">
        <div>
          ${lines.map(
            (line) => html`
              <div class="cart-line">
                ${line.image
                  ? html`<img src="${line.image}" alt="" loading="lazy" />`
                  : html`<div style="width:84px;height:84px;border-radius:12px;background:var(--blush)"></div>`}
                <div>
                  <p class="name"><a href="/p/${line.slug}">${line.name}</a></p>
                  ${line.label ? html`<p class="meta">${line.label}</p>` : ''}
                  <p class="meta">${formatPrice(line.price_cents)} ${line.unit_label !== 'each' ? line.unit_label : 'each'}</p>
                  ${line.stock !== null && line.stock < line.quantity
                    ? html`<p class="stock-note is-out">Only ${line.stock} left — the quantity will be adjusted.</p>`
                    : ''}
                </div>
                <div class="line-end">
                  <span class="line-total">${formatMoney(line.line_total_cents)}</span>
                  <form class="qty" method="post" action="/cart/update">
                    <input type="hidden" name="itemId" value="${line.id}" />
                    <button type="submit" name="quantity" value="${line.quantity - 1}" aria-label="Fewer">−</button>
                    <input type="number" name="quantity" value="${line.quantity}" min="0" max="99" aria-label="Quantity" />
                    <button type="submit" name="quantity" value="${line.quantity + 1}" aria-label="More">+</button>
                  </form>
                  <form method="post" action="/cart/remove">
                    <input type="hidden" name="itemId" value="${line.id}" />
                    <button class="remove" type="submit">Remove</button>
                  </form>
                </div>
              </div>
            `,
          )}
        </div>

        <aside class="summary">
          <h2>Summary</h2>
          <div class="summary-row"><span>Subtotal</span><span>${formatMoney(totals.subtotalCents)}</span></div>
          <div class="summary-row"><span>Delivery</span><span class="muted">Worked out at checkout</span></div>
          <div class="summary-row total"><span>Total</span><span>${formatMoney(totals.totalCents)}</span></div>
          <a class="btn btn-pink btn-block btn-lg" style="margin-top:1rem" href="/checkout">Checkout</a>
          <p class="muted" style="margin-top:.75rem;text-align:center">
            Or <a href="/">keep shopping</a>
          </p>
        </aside>
      </div>
    </div>
  `;

  return layout(ctx, { title: 'Your bag', body });
}

export function checkoutPage(ctx, { lines, totals, parishes, settings, errors = [], values = {}, paymentProvider }) {
  const body = html`
    <div class="shell">
      <div class="page-head"><h1>Checkout</h1></div>

      ${errors.length
        ? html`<div class="alert alert-bad">
            ${errors.length === 1 ? errors[0] : html`<ul style="margin:0;padding-left:1.1rem">${errors.map((error) => html`<li>${error}</li>`)}</ul>`}
          </div>`
        : ''}

      <form method="post" action="/checkout" class="cart-layout" style="padding-bottom:3rem">
        <div>
          <h2 style="font-size:1.1rem;margin-bottom:1rem">Your bag · ${totals.itemCount} items</h2>
          ${lines.map(
            (line) => html`
              <div class="cart-line">
                ${line.image ? html`<img src="${line.image}" alt="" loading="lazy" />` : html`<div></div>`}
                <div>
                  <p class="name">${line.name}</p>
                  ${line.label ? html`<p class="meta">${line.label}</p>` : ''}
                  <p class="meta">Qty ${line.quantity}</p>
                </div>
                <div class="line-end"><span class="line-total">${formatMoney(line.line_total_cents)}</span></div>
              </div>
            `,
          )}

          <h2 style="font-size:1.1rem;margin:2rem 0 1rem">How do you want it?</h2>
          <div class="choice-group" data-fulfilment>
            <label class="choice">
              <input type="radio" name="fulfilment" value="delivery" ${values.fulfilment !== 'pickup' ? 'checked' : ''} />
              <span>
                <span class="title">Delivery</span>
                <span class="desc">
                  Islandwide, ${settings.delivery_window}, Monday to Saturday. Order by
                  ${formatTime(settings.same_day_cutoff)} for today.
                </span>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="fulfilment" value="pickup" ${values.fulfilment === 'pickup' ? 'checked' : ''} />
              <span>
                <span class="title">Pick up in store</span>
                <span class="desc">Collect at ${settings.store_address}. We message you when it's ready.</span>
              </span>
            </label>
          </div>

          <div data-delivery-fields>
            <div class="field">
              <label for="parish">Parish</label>
              <select id="parish" name="parish" data-parish>
                ${parishes.map(
                  (parish) => html`<option value="${parish.parish}" ${values.parish === parish.parish ? 'selected' : ''}>
                    ${parish.parish}
                  </option>`,
                )}
              </select>
            </div>
            <div class="field">
              <label for="address">Address</label>
              <input id="address" name="address" value="${values.address || ''}" placeholder="House, street and district" />
            </div>
          </div>

          <h2 style="font-size:1.1rem;margin:2rem 0 1rem">Your details</h2>
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" value="${values.name || ''}" required />
          </div>
          <div class="field-row">
            <div class="field">
              <label for="phone">WhatsApp number</label>
              <input id="phone" name="phone" type="tel" value="${values.phone || ''}" required />
              <p class="hint">So we can reach you about your order.</p>
            </div>
            <div class="field">
              <label for="email">Email for your receipt</label>
              <input id="email" name="email" type="email" value="${values.email || ''}" placeholder="name@example.com" />
            </div>
          </div>
          <div class="field">
            <label for="notes">Anything we should know?</label>
            <textarea id="notes" name="notes" placeholder="Landmarks, gate codes, best time to call">${values.notes || ''}</textarea>
          </div>

          <h2 style="font-size:1.1rem;margin:2rem 0 1rem">Pay with</h2>
          <div class="choice-group">
            <label class="choice">
              <input type="radio" name="payment" value="online-card" ${values.payment === 'online-card' ? 'checked' : ''} />
              <span>
                <span class="title">Pay now by card</span>
                <span class="desc">
                  Visa or Mastercard, on a secure payment page.
                  ${paymentProvider === 'manual'
                    ? ' Card payments are not switched on yet, so this is a test page.'
                    : ''}
                </span>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="payment" value="on-delivery" ${values.payment !== 'online-card' ? 'checked' : ''} />
              <span>
                <span class="title">Pay on delivery or collection</span>
                <span class="desc">Pay the driver when your order arrives, or at the counter when you collect.</span>
              </span>
            </label>
          </div>
        </div>

        <aside class="summary">
          <h2>Order summary</h2>
          <div class="summary-row"><span>Subtotal</span><span>${formatMoney(totals.subtotalCents)}</span></div>
          <div class="summary-row">
            <span data-delivery-label>Delivery</span>
            <span data-delivery-amount>${totals.deliveryCents ? formatMoney(totals.deliveryCents) : '—'}</span>
          </div>
          <div class="summary-row total">
            <span>Total</span><span data-total-amount>${formatMoney(totals.totalCents)}</span>
          </div>
          <button class="btn btn-pink btn-block btn-lg" style="margin-top:1rem" type="submit">Place order</button>
          <p class="muted" style="margin-top:.75rem;text-align:center">
            ${tick()} Secure checkout · prices in Barbados dollars
          </p>
        </aside>
      </form>
    </div>
  `;

  return layout(ctx, { title: 'Checkout', body });
}

export function thanksPage(ctx, { order }) {
  const { settings } = ctx;
  const waLink = `https://wa.me/${settings.store_whatsapp}`;

  const body = html`
    <div class="shell thanks">
      <span class="tick">${tick()}</span>
      <p class="pdp-eyebrow">Thank you</p>
      <h1>Order placed!</h1>
      <p class="ref">Order ${order.reference} · ${formatMoney(order.total_cents)}</p>
      <p>
        ${order.customer_email ? 'We’ve emailed your receipt. ' : ''}
        ${order.fulfilment === 'delivery'
          ? order.same_day
            ? `Your order arrives today, ${settings.delivery_window}, and we’ll WhatsApp you when the driver sets off.`
            : `Your order goes out on our next delivery run, ${settings.delivery_window}, and we’ll WhatsApp you when the driver sets off.`
          : `We’ll WhatsApp you when it’s ready to collect at ${settings.store_address}.`}
      </p>

      <div class="order-lines">
        ${order.items.map(
          (item) => html`<div class="line">
            <span>${item.quantity} × ${item.name_snapshot}${item.variant_snapshot ? ` · ${item.variant_snapshot}` : ''}</span>
            <span>${formatMoney(item.line_total_cents)}</span>
          </div>`,
        )}
        <div class="line"><span>Subtotal</span><span>${formatMoney(order.subtotal_cents)}</span></div>
        ${order.delivery_cents
          ? html`<div class="line"><span>Delivery</span><span>${formatMoney(order.delivery_cents)}</span></div>`
          : ''}
        <div class="line" style="font-weight:800">
          <span>Total</span><span>${formatMoney(order.total_cents)}</span>
        </div>
        <div class="line">
          <span>Payment</span>
          <span>${order.payment_status === 'paid' ? 'Paid by card' : 'Pay when it arrives'}</span>
        </div>
      </div>

      <div class="actions">
        <a class="btn btn-pink" href="/">Keep shopping</a>
        <a class="btn btn-outline" href="${waLink}" target="_blank" rel="noreferrer">${ICONS.whatsapp} Track on WhatsApp</a>
      </div>
    </div>
  `;

  return layout(ctx, { title: `Order ${order.reference}`, body });
}

export function orderLookupPage(ctx, { order = null, error = null, reference = '' }) {
  const body = html`
    <div class="shell" style="max-width:640px;padding-bottom:3rem">
      <div class="page-head">
        <h1>Track an order</h1>
        <p>Enter the order number from your receipt, for example HF-1048.</p>
      </div>
      ${error ? html`<p class="alert alert-bad">${error}</p>` : ''}
      <form method="get" action="/order-lookup" class="field-row" style="align-items:end">
        <div class="field">
          <label for="reference">Order number</label>
          <input id="reference" name="reference" value="${reference}" placeholder="HF-1048" required />
        </div>
        <div class="field"><button class="btn btn-pink btn-block" type="submit">Find my order</button></div>
      </form>

      ${order
        ? html`<div class="order-lines">
            <div class="line" style="font-weight:800">
              <span>${order.reference}</span><span>${formatMoney(order.total_cents)}</span>
            </div>
            <div class="line"><span>Placed</span><span>${order.placed_at}</span></div>
            <div class="line"><span>Status</span><span>${order.status.replace(/-/g, ' ')}</span></div>
            <div class="line"><span>Payment</span><span>${order.payment_status.replace(/-/g, ' ')}</span></div>
            <div class="line">
              <span>${order.fulfilment === 'delivery' ? 'Delivering to' : 'Collect at'}</span>
              <span>${order.fulfilment === 'delivery' ? order.parish : ctx.settings.store_address}</span>
            </div>
            ${order.items.map(
              (item) => html`<div class="line">
                <span>${item.quantity} × ${item.name_snapshot}</span>
                <span>${formatMoney(item.line_total_cents)}</span>
              </div>`,
            )}
          </div>`
        : ''}
    </div>
  `;

  return layout(ctx, { title: 'Track an order', body });
}

export function deliveryPage(ctx, { rates }) {
  const { settings } = ctx;
  const threshold = Number(settings.delivery_special_threshold_cents);

  const body = html`
    <div class="shell prose" style="padding-bottom:3rem">
      <div class="page-head">
        <h1>Delivery and pickup</h1>
        <p>Order by ${formatTime(settings.same_day_cutoff)}, Monday to Saturday, and we deliver the same day.</p>
      </div>

      <h2>Same-day delivery</h2>
      <p>
        We deliver anywhere in Barbados between ${settings.delivery_window}, Monday to Saturday.
        Orders placed after ${formatTime(settings.same_day_cutoff)} go out on the next delivery run.
      </p>

      <h2>Delivery rates</h2>
      <p>Spend over ${formatPrice(threshold)} and your delivery comes at the special rate.</p>
      <table class="hours-table">
        <thead>
          <tr>
            <th scope="col">Parish</th>
            <th scope="col" style="text-align:right">Standard</th>
            <th scope="col" style="text-align:right">Over ${formatPrice(threshold)}</th>
          </tr>
        </thead>
        <tbody>
          ${rates.map(
            (rate) => html`<tr>
              <th scope="row">${rate.parish}</th>
              <td>${formatMoney(rate.rate_cents)}</td>
              <td>${formatMoney(rate.special_cents)}</td>
            </tr>`,
          )}
        </tbody>
      </table>

      <h2>Pick up in store</h2>
      <p>
        Choose pickup at checkout and collect at ${settings.store_address}, ${settings.store_parish}.
        We WhatsApp you as soon as your order is packed and ready.
      </p>

      <h2>Paying</h2>
      <p>
        Pay online by card when you order, or pay the driver when your order arrives. In store we
        take cash and cards.
      </p>
    </div>
  `;

  return layout(ctx, { title: 'Delivery and pickup', body });
}

export function visitPage(ctx, { hours, opening, today }) {
  const { settings } = ctx;
  const waLink = `https://wa.me/${settings.store_whatsapp}`;

  const body = html`
    <div class="shell" style="padding-bottom:3rem">
      <div class="page-head"><h1>Come see us</h1></div>
      <div class="store-grid">
        <img src="/img/brand/storefront.jpg" alt="The Hairify store at Manor Lodge Complex, Warrens" />
        <div>
          <h2>${settings.store_address}</h2>
          <p style="margin-top:.75rem;color:var(--ink-soft)">${settings.store_parish}</p>
          <p class="open-pill ${opening.open ? 'is-open' : ''}"><span class="dot"></span> ${opening.label}</p>
          <table class="hours-table">
            <tbody>
              ${hours.map(
                (row) => html`<tr class="${row.weekday === today ? 'is-today' : ''}">
                  <th scope="row">${weekdayName(row.weekday)}</th>
                  <td>${row.closed ? 'Closed' : `${formatTime(row.opens)} – ${formatTime(row.closes)}`}</td>
                </tr>`,
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
    </div>
  `;

  return layout(ctx, { title: 'Opening hours', body });
}

export function packGuidePage(ctx, { products }) {
  const waLink = `https://wa.me/${ctx.settings.store_whatsapp}`;

  const body = html`
    <div class="shell" style="padding-bottom:3rem">
      <div class="page-head">
        <h1>How many packs do I need?</h1>
        <p>
          Pick your hair and we'll show you what a full head takes, so you never get home one pack
          short. Still not sure? Send us a photo of the style and we'll tell you.
        </p>
      </div>

      <table class="hours-table">
        <thead>
          <tr>
            <th scope="col">Hair</th>
            <th scope="col" style="text-align:right">Price</th>
            <th scope="col" style="text-align:right">Full head</th>
            <th scope="col" style="text-align:right">About</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const min = product.packs_min;
            const max = product.packs_max || min;
            return html`<tr>
              <th scope="row"><a href="/p/${product.slug}">${product.name}</a></th>
              <td>${formatPrice(product.min_cents)} ${product.unit_label}</td>
              <td>${min === max ? min : `${min}–${max}`}</td>
              <td>
                ${min === max
                  ? formatPrice(product.min_cents * min)
                  : `${formatPrice(product.min_cents * min)} to ${formatPrice(product.min_cents * max)}`}
              </td>
            </tr>`;
          })}
        </tbody>
      </table>

      <p style="margin-top:1.5rem">
        <a class="btn btn-pink" href="${waLink}" target="_blank" rel="noreferrer">
          ${ICONS.whatsapp} Send us a photo on WhatsApp
        </a>
      </p>
    </div>
  `;

  return layout(ctx, { title: 'Pack guide', body });
}

export function notFoundPage(ctx) {
  return layout(ctx, {
    title: 'Page not found',
    body: html`<div class="shell empty-state">
      <h1>We can't find that page</h1>
      <p>It may have sold out or moved. Try the shop, or ask us on WhatsApp.</p>
      <a class="btn btn-pink btn-lg" href="/">Back to the shop</a>
    </div>`,
  });
}

/** The clearly-labelled test card page used while no gateway is configured. */
export function testPayPage(ctx, { order, error = null }) {
  const body = html`
    <div class="shell" style="max-width:520px;padding-bottom:4rem">
      <div class="page-head">
        <h1>Card payment</h1>
        <p>Order ${order.reference} · ${formatMoney(order.total_cents)}</p>
      </div>

      <p class="alert alert-warn">
        This is a test payment page. No card details are taken and no money moves. Switch
        <code>PAYMENT_PROVIDER</code> in the environment to the live gateway once the merchant
        account is open.
      </p>
      ${error ? html`<p class="alert alert-bad">${error}</p>` : ''}

      <form method="post" action="/pay/${order.reference}">
        <div class="field">
          <label for="card">Card number</label>
          <input id="card" value="4111 1111 1111 1111" disabled />
        </div>
        <div class="field-row">
          <div class="field"><label for="exp">Expiry</label><input id="exp" value="12 / 29" disabled /></div>
          <div class="field"><label for="cvc">CVC</label><input id="cvc" value="123" disabled /></div>
        </div>
        <button class="btn btn-pink btn-block btn-lg" type="submit" name="outcome" value="approve">
          Pay ${formatMoney(order.total_cents)}
        </button>
        <button class="btn btn-outline btn-block" style="margin-top:.6rem" type="submit" name="outcome" value="decline">
          Simulate a declined card
        </button>
      </form>

      <p style="margin-top:1.25rem;text-align:center">
        <a href="/thanks/${order.reference}">Pay on delivery instead</a>
      </p>
    </div>
  `;

  return layout(ctx, { title: 'Card payment', body });
}
