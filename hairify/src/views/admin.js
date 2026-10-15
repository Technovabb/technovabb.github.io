import { html } from '../lib/html.js';
import { formatMoney, formatPrice } from '../lib/money.js';
import { money, staffLayout, statusTag } from './staff.js';
import { ORDER_STATUS_FLOW } from '../lib/orders.js';
import { formatTime, weekdayName, PARISHES } from '../lib/store.js';

const NAV = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard' },
  { key: 'orders', href: '/admin/orders', label: 'Orders' },
  { key: 'products', href: '/admin/products', label: 'Products' },
  { key: 'inventory', href: '/admin/inventory', label: 'Inventory' },
  { key: 'customers', href: '/admin/customers', label: 'Customers' },
  { key: 'reports', href: '/admin/reports', label: 'Reports' },
  { key: 'settings', href: '/admin/settings', label: 'Settings' },
];

function shell(options) {
  return staffLayout({
    ...options,
    nav: NAV,
    brandHref: '/admin',
    brandSuffix: 'Back office',
  });
}

function flashBanner(flash) {
  return flash ? html`<p class="alert alert-${flash.kind}">${flash.message}</p>` : '';
}

/* ----------------------------------------------------------- dashboard */

export function dashboardPage({ user, stats, recentOrders, flash }) {
  return shell({
    title: 'Dashboard',
    user,
    active: 'dashboard',
    body: html`
      <div class="page-title"><div><h1>Dashboard</h1><p>How the shop is doing today.</p></div></div>
      ${flashBanner(flash)}

      <div class="grid grid-4" style="margin-bottom:1rem">
        <div class="stat">
          <p class="label">Taken today</p>
          <p class="value">${formatMoney(stats.today.gross_cents)}</p>
          <p class="note">${stats.today.orders} ${stats.today.orders === 1 ? 'order' : 'orders'}</p>
        </div>
        <div class="stat">
          <p class="label">This month</p>
          <p class="value">${formatMoney(stats.month.gross_cents)}</p>
          <p class="note">${stats.month.orders} orders</p>
        </div>
        <div class="stat ${stats.toPack ? 'is-warn' : ''}">
          <p class="label">To pack</p>
          <p class="value">${stats.toPack}</p>
          <p class="note">online orders waiting</p>
        </div>
        <div class="stat ${stats.lowStock.length ? 'is-bad' : 'is-ok'}">
          <p class="label">Low stock</p>
          <p class="value">${stats.lowStock.length}</p>
          <p class="note">lines at or below reorder</p>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card card-flush">
          <div style="padding:1.1rem 1.1rem 0"><h2>Latest orders</h2></div>
          ${recentOrders.length
            ? html`<table>
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Channel</th><th>Status</th><th class="num">Total</th></tr>
                </thead>
                <tbody>
                  ${recentOrders.map(
                    (order) => html`<tr>
                      <td><a href="/admin/orders/${order.reference}">${order.reference}</a></td>
                      <td>${order.customer_name || 'Walk-in'}</td>
                      <td><span class="tag">${order.channel === 'pos' ? 'In store' : 'Online'}</span></td>
                      <td>${statusTag(order.status)}</td>
                      <td class="num">${money(order.total_cents)}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>`
            : html`<p class="empty">No orders yet.</p>`}
        </div>

        <div>
          <div class="card">
            <h2>Needs reordering</h2>
            ${stats.lowStock.length
              ? html`<table>
                  <tbody>
                    ${stats.lowStock.slice(0, 10).map(
                      (line) => html`<tr>
                        <td>
                          ${line.name}
                          <br /><span class="muted" style="font-size:.8rem">
                            ${[line.texture, line.length, line.colour].filter(Boolean).join(' · ') || line.sku}
                          </span>
                        </td>
                        <td class="num">
                          <span class="tag ${line.on_hand === 0 ? 'tag-bad' : 'tag-warn'}">
                            ${line.on_hand} left
                          </span>
                        </td>
                      </tr>`,
                    )}
                  </tbody>
                </table>`
              : html`<p class="muted">Everything is above its reorder point.</p>`}
          </div>

          <div class="card">
            <h2>Stock on hand</h2>
            <table>
              <tbody>
                <tr><th>Units</th><td class="num">${stats.valuation.units}</td></tr>
                <tr><th>Retail value</th><td class="num">${money(stats.valuation.retail_cents)}</td></tr>
                <tr><th>At cost</th><td class="num">${money(stats.valuation.cost_cents)}</td></tr>
                <tr>
                  <th>Owed to the shop</th>
                  <td class="num">${money(stats.awaitingPayment.total_cents)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${stats.openShifts.length
            ? html`<div class="card">
                <h2>Tills open now</h2>
                ${stats.openShifts.map(
                  (shift) => html`<p>
                    <a href="/pos/shift/${shift.id}/summary">${shift.register_name}</a> ·
                    ${shift.user_name} · opened ${shift.opened_at}
                  </p>`,
                )}
              </div>`
            : ''}
        </div>
      </div>
    `,
  });
}

/* -------------------------------------------------------------- orders */

export function ordersPage({ user, orders, filters, flash }) {
  const tabs = [
    { key: '', label: 'All' },
    { key: 'placed', label: 'To pack' },
    { key: 'packed', label: 'Packed' },
    { key: 'out-for-delivery', label: 'Out for delivery' },
    { key: 'ready-for-pickup', label: 'Ready for pickup' },
    { key: 'completed', label: 'Completed' },
  ];

  return shell({
    title: 'Orders',
    user,
    active: 'orders',
    body: html`
      <div class="page-title"><div><h1>Orders</h1><p>Online orders and in-store sales.</p></div></div>
      ${flashBanner(flash)}

      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
        ${tabs.map(
          (tab) => html`<a
            class="btn btn-sm ${filters.status === tab.key ? 'btn-ink' : ''}"
            href="/admin/orders${tab.key ? `?status=${tab.key}` : ''}"
            >${tab.label}</a
          >`,
        )}
      </div>

      <div class="card card-flush">
        ${orders.length
          ? html`<table>
              <thead>
                <tr>
                  <th>Order</th><th>Placed</th><th>Customer</th><th>Fulfilment</th>
                  <th>Status</th><th>Payment</th><th class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(
                  (order) => html`<tr>
                    <td><a href="/admin/orders/${order.reference}">${order.reference}</a></td>
                    <td>${order.placed_at}</td>
                    <td>
                      ${order.customer_name || 'Walk-in'}
                      ${order.customer_phone ? html`<br /><span class="muted" style="font-size:.8rem">${order.customer_phone}</span>` : ''}
                    </td>
                    <td>
                      ${order.fulfilment === 'delivery'
                        ? html`Delivery<br /><span class="muted" style="font-size:.8rem">${order.parish}</span>`
                        : order.fulfilment === 'pickup'
                          ? 'Pickup'
                          : 'In store'}
                    </td>
                    <td>${statusTag(order.status)}</td>
                    <td>${statusTag(order.payment_status)}</td>
                    <td class="num">${money(order.total_cents)}</td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="empty">No orders match that filter.</p>`}
      </div>
    `,
  });
}

export function orderDetailPage({ user, order, csrf, flash, settings }) {
  const flow = ORDER_STATUS_FLOW[order.fulfilment] || [];
  const currentIndex = flow.indexOf(order.status);
  const nextStatus = currentIndex >= 0 ? flow[currentIndex + 1] : null;
  const waLink = order.customer_phone
    ? `https://wa.me/${order.customer_phone.replace(/[^\d]/g, '').replace(/^(?!1)/, '1')}`
    : null;

  return shell({
    title: order.reference,
    user,
    active: 'orders',
    body: html`
      <div class="page-title">
        <div>
          <h1>${order.reference}</h1>
          <p>
            ${order.channel === 'pos' ? 'In store' : 'Online'} · placed ${order.placed_at}
            ${order.served_by ? ` · served by ${order.served_by}` : ''}
          </p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${waLink ? html`<a class="btn" href="${waLink}" target="_blank" rel="noreferrer">WhatsApp customer</a>` : ''}
          <a class="btn" href="/admin/orders">Back</a>
        </div>
      </div>
      ${flashBanner(flash)}

      <div class="grid grid-2">
        <div class="card card-flush">
          <table>
            <thead>
              <tr><th>Item</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Total</th></tr>
            </thead>
            <tbody>
              ${order.items.map(
                (item) => html`<tr>
                  <td>
                    ${item.name_snapshot}
                    ${item.variant_snapshot ? html`<br /><span class="muted" style="font-size:.8rem">${item.variant_snapshot}</span>` : ''}
                    ${item.refunded_qty ? html`<br /><span class="tag tag-bad">${item.refunded_qty} refunded</span>` : ''}
                  </td>
                  <td class="num">${item.quantity}</td>
                  <td class="num">${money(item.unit_price_cents)}</td>
                  <td class="num">${money(item.line_total_cents)}</td>
                </tr>`,
              )}
            </tbody>
            <tfoot>
              <tr><th colspan="3">Subtotal</th><th class="num">${money(order.subtotal_cents)}</th></tr>
              ${order.discount_cents
                ? html`<tr><th colspan="3">Discount</th><th class="num">−${money(order.discount_cents)}</th></tr>`
                : ''}
              ${order.delivery_cents
                ? html`<tr><th colspan="3">Delivery</th><th class="num">${money(order.delivery_cents)}</th></tr>`
                : ''}
              <tr><th colspan="3">Total</th><th class="num">${money(order.total_cents)}</th></tr>
              <tr><th colspan="3">Paid</th><th class="num">${money(order.paid_cents)}</th></tr>
              ${order.refunded_cents
                ? html`<tr><th colspan="3">Refunded</th><th class="num">−${money(order.refunded_cents)}</th></tr>`
                : ''}
            </tfoot>
          </table>
        </div>

        <div>
          <div class="card">
            <h2>Where it's going</h2>
            <table>
              <tbody>
                <tr><th>Customer</th><td>${order.customer_name || 'Walk-in'}</td></tr>
                ${order.customer_phone ? html`<tr><th>WhatsApp</th><td>${order.customer_phone}</td></tr>` : ''}
                ${order.customer_email ? html`<tr><th>Email</th><td>${order.customer_email}</td></tr>` : ''}
                <tr><th>Fulfilment</th><td>${order.fulfilment.replace(/-/g, ' ')}</td></tr>
                ${order.parish ? html`<tr><th>Parish</th><td>${order.parish}</td></tr>` : ''}
                ${order.address ? html`<tr><th>Address</th><td>${order.address}</td></tr>` : ''}
                ${order.delivery_notes ? html`<tr><th>Notes</th><td>${order.delivery_notes}</td></tr>` : ''}
                ${order.same_day ? html`<tr><th>Promised</th><td>Today, ${settings.delivery_window}</td></tr>` : ''}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Status</h2>
            <p>${statusTag(order.status)} ${statusTag(order.payment_status)}</p>

            ${nextStatus
              ? html`<form method="post" action="/admin/orders/${order.reference}/status">
                  <input type="hidden" name="_csrf" value="${csrf}" />
                  <input type="hidden" name="status" value="${nextStatus}" />
                  <button class="btn btn-pink btn-block" type="submit">
                    Mark as ${nextStatus.replace(/-/g, ' ')}
                  </button>
                </form>`
              : ''}

            ${order.payment_status !== 'paid' && order.status !== 'cancelled'
              ? html`<form method="post" action="/admin/orders/${order.reference}/paid" style="margin-top:.5rem">
                  <input type="hidden" name="_csrf" value="${csrf}" />
                  <div class="field" style="margin-bottom:.5rem">
                    <label for="payMethod">Take the outstanding ${formatMoney(order.total_cents - order.paid_cents)} as</label>
                    <select id="payMethod" name="method">
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="transfer">Bank transfer</option>
                    </select>
                  </div>
                  <button class="btn btn-block" type="submit">Mark as paid</button>
                </form>`
              : ''}

            ${order.status !== 'cancelled' && order.status !== 'completed'
              ? html`<form method="post" action="/admin/orders/${order.reference}/cancel" style="margin-top:.5rem">
                  <input type="hidden" name="_csrf" value="${csrf}" />
                  <button class="btn btn-danger btn-block" type="submit">
                    Cancel and put the stock back
                  </button>
                </form>`
              : ''}
          </div>

          ${order.payments.length
            ? html`<div class="card">
                <h2>Payments</h2>
                <table>
                  <tbody>
                    ${order.payments.map(
                      (payment) => html`<tr>
                        <td>${payment.method.replace(/-/g, ' ')}</td>
                        <td class="muted">${payment.created_at}</td>
                        <td class="num">${money(payment.amount_cents)}</td>
                      </tr>`,
                    )}
                  </tbody>
                </table>
              </div>`
            : ''}
        </div>
      </div>
    `,
  });
}

/* ------------------------------------------------------------ products */

export function productsPage({ user, products, flash }) {
  return shell({
    title: 'Products',
    user,
    active: 'products',
    body: html`
      <div class="page-title">
        <div><h1>Products</h1><p>${products.length} lines in the catalogue.</p></div>
        <a class="btn btn-pink" href="/admin/products/new">Add a product</a>
      </div>
      ${flashBanner(flash)}

      <div class="card card-flush">
        <table>
          <thead>
            <tr>
              <th>Product</th><th>Category</th><th>Kind</th>
              <th class="num">Variants</th><th class="num">Price</th><th class="num">Stock</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${products.map(
              (product) => html`<tr>
                <td>
                  <a href="/admin/products/${product.id}">${product.name}</a>
                  ${product.active ? '' : html`<span class="tag tag-bad">Hidden</span>`}
                  ${product.subtitle ? html`<br /><span class="muted" style="font-size:.8rem">${product.subtitle}</span>` : ''}
                </td>
                <td>${product.category_name || '—'}</td>
                <td><span class="tag ${product.kind === 'deal' ? 'tag-pink' : ''}">${product.kind}</span></td>
                <td class="num">${product.variant_count}</td>
                <td class="num">
                  ${product.min_cents === product.max_cents
                    ? formatPrice(product.min_cents)
                    : `${formatPrice(product.min_cents)}–${formatPrice(product.max_cents)}`}
                </td>
                <td class="num">
                  <span class="tag ${product.stock === 0 ? 'tag-bad' : product.stock <= 5 ? 'tag-warn' : 'tag-ok'}">
                    ${product.stock}
                  </span>
                </td>
                <td class="num"><a class="btn btn-sm" href="/p/${product.slug}" target="_blank" rel="noreferrer">View</a></td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `,
  });
}

export function productEditPage({ user, product, variants, categories, csrf, flash, isNew = false }) {
  return shell({
    title: isNew ? 'New product' : product.name,
    user,
    active: 'products',
    body: html`
      <div class="page-title">
        <div><h1>${isNew ? 'Add a product' : product.name}</h1></div>
        <a class="btn" href="/admin/products">Back</a>
      </div>
      ${flashBanner(flash)}

      <div class="grid grid-2">
        <div class="card">
          <h2>Details</h2>
          <form method="post" action="${isNew ? '/admin/products/new' : `/admin/products/${product.id}`}">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <div class="field">
              <label for="name">Name</label>
              <input id="name" name="name" value="${product.name || ''}" required />
            </div>
            <div class="field-row">
              <div class="field">
                <label for="slug">Web address</label>
                <input id="slug" name="slug" value="${product.slug || ''}" required />
                <p class="hint">hairifybb.com/p/<span>${product.slug || 'name'}</span></p>
              </div>
              <div class="field">
                <label for="category">Category</label>
                <select id="category" name="category_id">
                  <option value="">None</option>
                  ${categories.map(
                    (category) => html`<option value="${category.id}" ${category.id === product.category_id ? 'selected' : ''}>
                      ${category.name}
                    </option>`,
                  )}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="subtitle">Subtitle</label>
              <input id="subtitle" name="subtitle" value="${product.subtitle || ''}" />
            </div>
            <div class="field-row">
              <div class="field">
                <label for="brand">Brand</label>
                <input id="brand" name="brand" value="${product.brand || ''}" />
              </div>
              <div class="field">
                <label for="eyebrow">Eyebrow</label>
                <input id="eyebrow" name="eyebrow" value="${product.eyebrow || ''}" />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="unit">Sold</label>
                <input id="unit" name="unit_label" value="${product.unit_label || 'each'}" />
                <p class="hint">e.g. per pack, per bundle, each</p>
              </div>
              <div class="field">
                <label for="badge">Badge</label>
                <select id="badge" name="badge">
                  ${['', 'best-seller', 'new', 'deal'].map(
                    (value) => html`<option value="${value}" ${value === (product.badge || '') ? 'selected' : ''}>
                      ${value || 'None'}
                    </option>`,
                  )}
                </select>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label for="packsMin">Packs for a full head (from)</label>
                <input id="packsMin" name="packs_min" type="number" min="0" value="${product.packs_min || ''}" />
              </div>
              <div class="field">
                <label for="packsMax">Packs (to)</label>
                <input id="packsMax" name="packs_max" type="number" min="0" value="${product.packs_max || ''}" />
              </div>
            </div>
            <div class="field">
              <label for="description">Description</label>
              <textarea id="description" name="description" rows="4">${product.description || ''}</textarea>
            </div>
            <div class="field">
              <label for="howTo">How to wear it</label>
              <textarea id="howTo" name="how_to" rows="3">${product.how_to || ''}</textarea>
            </div>
            <div class="field">
              <label for="care">Care notes</label>
              <textarea id="care" name="care_notes" rows="3">${product.care_notes || ''}</textarea>
            </div>
            <div class="field-row">
              <label class="field" style="display:flex;gap:.5rem;align-items:center">
                <input type="checkbox" name="featured" value="1" ${product.featured ? 'checked' : ''} style="width:auto" />
                <span>Show in best sellers</span>
              </label>
              <label class="field" style="display:flex;gap:.5rem;align-items:center">
                <input type="checkbox" name="active" value="1" ${isNew || product.active ? 'checked' : ''} style="width:auto" />
                <span>Visible in the shop</span>
              </label>
            </div>
            <button class="btn btn-pink btn-block" type="submit">${isNew ? 'Create product' : 'Save changes'}</button>
          </form>
        </div>

        <div>
          ${isNew
            ? html`<div class="card"><p class="muted">Add variants once the product is created.</p></div>`
            : html`
                <div class="card card-flush">
                  <div style="padding:1.1rem 1.1rem 0"><h2>Variants</h2></div>
                  <table>
                    <thead>
                      <tr><th>SKU</th><th>Options</th><th class="num">Price</th><th class="num">Stock</th><th></th></tr>
                    </thead>
                    <tbody>
                      ${variants.map(
                        (variant) => html`<tr>
                          <td>
                            ${variant.sku}
                            ${variant.barcode ? html`<br /><span class="muted" style="font-size:.78rem">${variant.barcode}</span>` : ''}
                          </td>
                          <td>${[variant.texture, variant.length, variant.colour].filter(Boolean).join(' · ') || '—'}</td>
                          <td class="num">${money(variant.price_cents)}</td>
                          <td class="num">
                            <span class="tag ${variant.stock === 0 ? 'tag-bad' : variant.stock <= 3 ? 'tag-warn' : 'tag-ok'}">
                              ${variant.stock}
                            </span>
                          </td>
                          <td class="num"><a class="btn btn-sm" href="/admin/inventory?variant=${variant.id}">Stock</a></td>
                        </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>

                <div class="card">
                  <h2>Add a variant</h2>
                  <form method="post" action="/admin/products/${product.id}/variants">
                    <input type="hidden" name="_csrf" value="${csrf}" />
                    <div class="field-row">
                      <div class="field"><label for="vTexture">Texture</label><input id="vTexture" name="texture" /></div>
                      <div class="field"><label for="vLength">Length</label><input id="vLength" name="length" placeholder='18"' /></div>
                      <div class="field"><label for="vColour">Colour</label><input id="vColour" name="colour" /></div>
                    </div>
                    <div class="field-row">
                      <div class="field">
                        <label for="vPrice">Price ($)</label>
                        <input id="vPrice" name="price" type="number" step="0.01" min="0" required />
                      </div>
                      <div class="field">
                        <label for="vCost">Cost ($)</label>
                        <input id="vCost" name="cost" type="number" step="0.01" min="0" />
                      </div>
                      <div class="field">
                        <label for="vStock">Opening stock</label>
                        <input id="vStock" name="stock" type="number" min="0" value="0" />
                      </div>
                    </div>
                    <div class="field">
                      <label for="vSku">SKU</label>
                      <input id="vSku" name="sku" required placeholder="MIRACLE-KINKY-CURLY-18" />
                    </div>
                    <button class="btn btn-ink btn-block" type="submit">Add variant</button>
                  </form>
                </div>

                <div class="card">
                  <h2>Photos</h2>
                  <form method="post" action="/admin/products/${product.id}/images">
                    <input type="hidden" name="_csrf" value="${csrf}" />
                    <div class="field">
                      <label for="imgUrl">Image address</label>
                      <input id="imgUrl" name="url" required placeholder="/img/products/new-photo.jpg" />
                      <p class="hint">Upload the file to public/img/products first.</p>
                    </div>
                    <div class="field">
                      <label for="imgAlt">Describe the photo</label>
                      <input id="imgAlt" name="alt" placeholder="Model wearing 18 inch feather crochet" />
                    </div>
                    <button class="btn btn-block" type="submit">Add photo</button>
                  </form>
                </div>
              `}
        </div>
      </div>
    `,
  });
}

/* ----------------------------------------------------------- inventory */

export function inventoryPage({ user, rows, ledger, csrf, flash, filter, lowOnly }) {
  return shell({
    title: 'Inventory',
    user,
    active: 'inventory',
    body: html`
      <div class="page-title">
        <div><h1>Inventory</h1><p>Counts, adjustments and the movement ledger.</p></div>
        <div style="display:flex;gap:.5rem">
          <a class="btn ${lowOnly ? 'btn-ink' : ''}" href="/admin/inventory${lowOnly ? '' : '?low=1'}">
            ${lowOnly ? 'Show everything' : 'Low stock only'}
          </a>
          <a class="btn btn-pink" href="/admin/inventory/receive">Receive stock</a>
        </div>
      </div>
      ${flashBanner(flash)}

      <form method="get" action="/admin/inventory" style="margin-bottom:1rem;display:flex;gap:.5rem;max-width:460px">
        <input class="field" name="q" value="${filter || ''}" placeholder="Search by product, SKU or barcode" style="margin:0;padding:.65rem .8rem;border:1px solid var(--line);border-radius:10px" />
        <button class="btn btn-ink" type="submit">Search</button>
      </form>

      <div class="card card-flush">
        <table>
          <thead>
            <tr>
              <th>Item</th><th>SKU</th><th class="num">On hand</th>
              <th class="num">Reorder at</th><th>Adjust</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows.map(
                  (row) => html`<tr>
                    <td>
                      ${row.name}
                      <br /><span class="muted" style="font-size:.8rem">
                        ${[row.texture, row.length, row.colour].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td>
                      ${row.sku}
                      ${row.is_kit ? html`<br /><span class="tag tag-pink">kit</span>` : ''}
                    </td>
                    <td class="num">
                      <span class="tag ${row.on_hand === 0 ? 'tag-bad' : row.reorder_point > 0 && row.on_hand <= row.reorder_point ? 'tag-warn' : 'tag-ok'}">
                        ${row.on_hand}
                      </span>
                    </td>
                    <td class="num">
                      <form method="post" action="/admin/inventory/reorder-point" style="display:flex;gap:.3rem;justify-content:flex-end">
                        <input type="hidden" name="_csrf" value="${csrf}" />
                        <input type="hidden" name="variantId" value="${row.variant_id}" />
                        <input name="reorder" type="number" min="0" value="${row.reorder_point}" style="width:62px;padding:.3rem;border:1px solid var(--line);border-radius:7px" />
                        <button class="btn btn-sm" type="submit">Set</button>
                      </form>
                    </td>
                    <td>
                      ${row.is_kit
                        ? html`<span class="muted" style="font-size:.8rem">Counted from its parts</span>`
                        : html`<form method="post" action="/admin/inventory/adjust" style="display:flex;gap:.3rem">
                            <input type="hidden" name="_csrf" value="${csrf}" />
                            <input type="hidden" name="variantId" value="${row.variant_id}" />
                            <input name="delta" type="number" placeholder="+/−" style="width:72px;padding:.3rem;border:1px solid var(--line);border-radius:7px" required />
                            <select name="reason" style="padding:.3rem;border:1px solid var(--line);border-radius:7px">
                              <option value="Stock take">Stock take</option>
                              <option value="Received">Received</option>
                              <option value="Damaged">Damaged</option>
                              <option value="Lost">Lost</option>
                              <option value="Returned to supplier">Returned to supplier</option>
                            </select>
                            <button class="btn btn-sm" type="submit">Apply</button>
                          </form>`}
                    </td>
                  </tr>`,
                )
              : html`<tr><td colspan="5" class="empty">Nothing matched that.</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card card-flush" style="margin-top:1rem">
        <div style="padding:1.1rem 1.1rem 0"><h2>Movement ledger</h2></div>
        <table>
          <thead>
            <tr><th>When</th><th>Item</th><th>Reason</th><th class="num">Change</th><th class="num">Balance</th><th>By</th></tr>
          </thead>
          <tbody>
            ${ledger.map(
              (movement) => html`<tr>
                <td class="muted">${movement.created_at}</td>
                <td>
                  ${movement.name}
                  <br /><span class="muted" style="font-size:.78rem">${movement.sku}</span>
                </td>
                <td>
                  ${movement.reason}
                  ${movement.reference_type ? html`<br /><span class="muted" style="font-size:.78rem">${movement.reference_type} ${movement.reference_id}</span>` : ''}
                </td>
                <td class="num">
                  <span class="tag ${movement.delta > 0 ? 'tag-ok' : 'tag-bad'}">
                    ${movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </span>
                </td>
                <td class="num">${movement.balance_after}</td>
                <td class="muted">${movement.user_name || 'System'}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `,
  });
}

export function receivePage({ user, variants, csrf, flash }) {
  return shell({
    title: 'Receive stock',
    user,
    active: 'inventory',
    body: html`
      <div class="page-title">
        <div><h1>Receive stock</h1><p>Book in a delivery from a supplier.</p></div>
        <a class="btn" href="/admin/inventory">Back</a>
      </div>
      ${flashBanner(flash)}

      <form method="post" action="/admin/inventory/receive" class="card">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <div class="field-row">
          <div class="field">
            <label for="supplier">Supplier</label>
            <input id="supplier" name="supplier" placeholder="e.g. Outre" />
          </div>
          <div class="field">
            <label for="note">Reference or note</label>
            <input id="note" name="note" placeholder="Invoice number" />
          </div>
        </div>

        <h2 style="margin:1.25rem 0 .75rem">What came in</h2>
        <p class="muted" style="font-size:.9rem">Enter a quantity against each line you received.</p>
        <table>
          <thead>
            <tr><th>Item</th><th>SKU</th><th class="num">On hand</th><th class="num">Received</th><th class="num">Unit cost ($)</th></tr>
          </thead>
          <tbody>
            ${variants.map(
              (variant) => html`<tr>
                <td>
                  ${variant.name}
                  <br /><span class="muted" style="font-size:.8rem">
                    ${[variant.texture, variant.length, variant.colour].filter(Boolean).join(' · ') || '—'}
                  </span>
                </td>
                <td>${variant.sku}</td>
                <td class="num">${variant.on_hand}</td>
                <td class="num">
                  <input name="qty-${variant.variant_id}" type="number" min="0" placeholder="0" style="width:80px;padding:.35rem;border:1px solid var(--line);border-radius:7px;text-align:right" />
                </td>
                <td class="num">
                  <input name="cost-${variant.variant_id}" type="number" step="0.01" min="0" value="${(variant.cost_cents / 100).toFixed(2)}" style="width:90px;padding:.35rem;border:1px solid var(--line);border-radius:7px;text-align:right" />
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
        <button class="btn btn-pink btn-lg" style="margin-top:1rem" type="submit">Book the delivery in</button>
      </form>
    `,
  });
}

/* ----------------------------------------------------------- customers */

export function customersPage({ user, customers }) {
  return shell({
    title: 'Customers',
    user,
    active: 'customers',
    body: html`
      <div class="page-title"><div><h1>Customers</h1><p>${customers.length} people have ordered.</p></div></div>
      <div class="card card-flush">
        ${customers.length
          ? html`<table>
              <thead>
                <tr><th>Name</th><th>WhatsApp</th><th>Email</th><th>Parish</th><th class="num">Orders</th><th class="num">Spent</th></tr>
              </thead>
              <tbody>
                ${customers.map(
                  (customer) => html`<tr>
                    <td>${customer.name || '—'}</td>
                    <td>
                      ${customer.phone
                        ? html`<a href="https://wa.me/${customer.phone.replace(/[^\d]/g, '').replace(/^(?!1)/, '1')}" target="_blank" rel="noreferrer">${customer.phone}</a>`
                        : '—'}
                    </td>
                    <td>${customer.email || '—'}</td>
                    <td>${customer.parish || '—'}</td>
                    <td class="num">${customer.orders}</td>
                    <td class="num">${money(customer.spent_cents)}</td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="empty">No customers yet.</p>`}
      </div>
    `,
  });
}

/* ------------------------------------------------------------- reports */

export function reportsPage({ user, days, byDay, top, channels, payments, margin }) {
  const peak = Math.max(1, ...byDay.map((row) => row.gross_cents));
  const marginPct = margin.revenue_cents
    ? Math.round(((margin.revenue_cents - margin.cost_cents) / margin.revenue_cents) * 100)
    : 0;

  return shell({
    title: 'Reports',
    user,
    active: 'reports',
    body: html`
      <div class="page-title">
        <div><h1>Reports</h1><p>The last ${days} days.</p></div>
        <div style="display:flex;gap:.4rem">
          ${[7, 30, 90].map(
            (option) => html`<a class="btn btn-sm ${option === days ? 'btn-ink' : ''}" href="/admin/reports?days=${option}">
              ${option} days
            </a>`,
          )}
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:1rem">
        <div class="stat">
          <p class="label">Revenue</p>
          <p class="value">${formatMoney(margin.revenue_cents)}</p>
        </div>
        <div class="stat">
          <p class="label">At cost</p>
          <p class="value">${formatMoney(margin.cost_cents)}</p>
        </div>
        <div class="stat is-ok">
          <p class="label">Gross margin</p>
          <p class="value">${marginPct}%</p>
          <p class="note">${formatMoney(margin.revenue_cents - margin.cost_cents)}</p>
        </div>
        <div class="stat">
          <p class="label">Orders</p>
          <p class="value">${channels.reduce((sum, row) => sum + row.orders, 0)}</p>
        </div>
      </div>

      <div class="card">
        <h2>Sales by day</h2>
        ${byDay.length
          ? html`<table>
              <thead>
                <tr><th>Day</th><th class="num">Orders</th><th class="num">Online</th><th class="num">In store</th><th class="num">Total</th><th></th></tr>
              </thead>
              <tbody>
                ${byDay.map(
                  (row) => html`<tr>
                    <td>${row.day}</td>
                    <td class="num">${row.orders}</td>
                    <td class="num">${money(row.online_cents)}</td>
                    <td class="num">${money(row.pos_cents)}</td>
                    <td class="num">${money(row.gross_cents)}</td>
                    <td style="width:35%">
                      <span
                        style="display:block;height:10px;border-radius:999px;background:var(--pink);width:${Math.round((row.gross_cents / peak) * 100)}%"
                        role="img"
                        aria-label="${formatMoney(row.gross_cents)}"
                      ></span>
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="muted">No sales in this period.</p>`}
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Best sellers</h2>
          <table>
            <thead><tr><th>Product</th><th class="num">Units</th><th class="num">Revenue</th></tr></thead>
            <tbody>
              ${top.length
                ? top.map(
                    (row) => html`<tr>
                      <td>${row.name}</td>
                      <td class="num">${row.units}</td>
                      <td class="num">${money(row.revenue_cents)}</td>
                    </tr>`,
                  )
                : html`<tr><td colspan="3" class="muted">Nothing sold yet.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div>
          <div class="card">
            <h2>Where sales come from</h2>
            <table>
              <tbody>
                ${channels.map(
                  (row) => html`<tr>
                    <td>${row.channel === 'pos' ? 'In store' : 'Online'}</td>
                    <td class="num">${row.orders}</td>
                    <td class="num">${money(row.gross_cents)}</td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>
          <div class="card">
            <h2>How people pay</h2>
            <table>
              <tbody>
                ${payments.length
                  ? payments.map(
                      (row) => html`<tr>
                        <td>${row.method.replace(/-/g, ' ')}</td>
                        <td class="num">${row.count}</td>
                        <td class="num">${money(row.total_cents)}</td>
                      </tr>`,
                    )
                  : html`<tr><td class="muted">Nothing taken yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `,
  });
}

/* ------------------------------------------------------------ settings */

export function settingsPage({ user, settings, hours, rates, staff, csrf, flash }) {
  return shell({
    title: 'Settings',
    user,
    active: 'settings',
    body: html`
      <div class="page-title"><div><h1>Settings</h1><p>Shop details, hours, delivery and staff.</p></div></div>
      ${flashBanner(flash)}

      <div class="grid grid-2">
        <div>
          <div class="card">
            <h2>Shop details</h2>
            <form method="post" action="/admin/settings">
              <input type="hidden" name="_csrf" value="${csrf}" />
              ${[
                ['store_name', 'Shop name'],
                ['store_tagline', 'Tagline'],
                ['store_phone', 'Phone'],
                ['store_whatsapp', 'WhatsApp number (digits only)'],
                ['store_email', 'Email'],
                ['store_address', 'Address'],
                ['store_parish', 'Parish and country'],
                ['store_maps_url', 'Google Maps link'],
                ['instagram', 'Instagram handle'],
                ['instagram_beauty', 'Beauty Instagram'],
                ['instagram_cropover', 'Crop Over Instagram'],
                ['tiktok', 'TikTok handle'],
                ['receipt_footer', 'Receipt footer'],
              ].map(
                ([key, label]) => html`<div class="field">
                  <label for="${key}">${label}</label>
                  <input id="${key}" name="${key}" value="${settings[key] || ''}" />
                </div>`,
              )}
              <button class="btn btn-pink btn-block" type="submit">Save shop details</button>
            </form>
          </div>

          <div class="card">
            <h2>Delivery</h2>
            <form method="post" action="/admin/settings/delivery">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <div class="field-row">
                <div class="field">
                  <label for="cutoff">Same-day cutoff</label>
                  <input id="cutoff" name="same_day_cutoff" type="time" value="${settings.same_day_cutoff}" />
                </div>
                <div class="field">
                  <label for="window">Delivery window</label>
                  <input id="window" name="delivery_window" value="${settings.delivery_window}" />
                </div>
              </div>
              <div class="field">
                <label for="threshold">Special rate applies over ($)</label>
                <input
                  id="threshold"
                  name="delivery_special_threshold"
                  type="number"
                  step="0.01"
                  value="${(Number(settings.delivery_special_threshold_cents) / 100).toFixed(2)}"
                />
              </div>

              <h3 style="margin:1rem 0 .5rem">Rates by parish</h3>
              <table>
                <thead><tr><th>Parish</th><th class="num">Standard ($)</th><th class="num">Special ($)</th></tr></thead>
                <tbody>
                  ${rates.map(
                    (rate) => html`<tr>
                      <td>${rate.parish}</td>
                      <td class="num">
                        <input name="rate-${rate.id}" type="number" step="0.01" min="0" value="${(rate.rate_cents / 100).toFixed(2)}" style="width:90px;padding:.3rem;border:1px solid var(--line);border-radius:7px;text-align:right" />
                      </td>
                      <td class="num">
                        <input name="special-${rate.id}" type="number" step="0.01" min="0" value="${(rate.special_cents / 100).toFixed(2)}" style="width:90px;padding:.3rem;border:1px solid var(--line);border-radius:7px;text-align:right" />
                      </td>
                    </tr>`,
                  )}
                </tbody>
              </table>
              <button class="btn btn-pink btn-block" style="margin-top:1rem" type="submit">Save delivery</button>
            </form>
          </div>
        </div>

        <div>
          <div class="card">
            <h2>Opening hours</h2>
            <form method="post" action="/admin/settings/hours">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <table>
                <thead><tr><th>Day</th><th>Opens</th><th>Closes</th><th>Closed</th></tr></thead>
                <tbody>
                  ${hours.map(
                    (row) => html`<tr>
                      <td>${weekdayName(row.weekday)}</td>
                      <td><input name="opens-${row.weekday}" type="time" value="${row.opens || ''}" style="padding:.3rem;border:1px solid var(--line);border-radius:7px" /></td>
                      <td><input name="closes-${row.weekday}" type="time" value="${row.closes || ''}" style="padding:.3rem;border:1px solid var(--line);border-radius:7px" /></td>
                      <td><input name="closed-${row.weekday}" type="checkbox" value="1" ${row.closed ? 'checked' : ''} /></td>
                    </tr>`,
                  )}
                </tbody>
              </table>
              <button class="btn btn-pink btn-block" style="margin-top:1rem" type="submit">Save hours</button>
            </form>
          </div>

          <div class="card card-flush">
            <div style="padding:1.1rem 1.1rem 0"><h2>Staff</h2></div>
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>PIN</th><th></th></tr></thead>
              <tbody>
                ${staff.map(
                  (member) => html`<tr>
                    <td>${member.name}</td>
                    <td>${member.email}</td>
                    <td><span class="tag">${member.role}</span></td>
                    <td>${member.pin ? '••••' : '—'}</td>
                    <td class="num">
                      ${member.id === user.id
                        ? html`<span class="muted" style="font-size:.8rem">You</span>`
                        : html`<form method="post" action="/admin/settings/staff/${member.id}/toggle">
                            <input type="hidden" name="_csrf" value="${csrf}" />
                            <button class="btn btn-sm" type="submit">${member.active ? 'Disable' : 'Enable'}</button>
                          </form>`}
                    </td>
                  </tr>`,
                )}
              </tbody>
            </table>
          </div>

          <div class="card">
            <h2>Add a staff member</h2>
            <form method="post" action="/admin/settings/staff">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <div class="field"><label for="sName">Name</label><input id="sName" name="name" required /></div>
              <div class="field"><label for="sEmail">Email</label><input id="sEmail" name="email" type="email" required /></div>
              <div class="field-row">
                <div class="field">
                  <label for="sRole">Role</label>
                  <select id="sRole" name="role">
                    <option value="cashier">Cashier — till only</option>
                    <option value="manager">Manager — till and back office</option>
                    <option value="admin">Admin — everything</option>
                  </select>
                </div>
                <div class="field">
                  <label for="sPin">Till PIN</label>
                  <input id="sPin" name="pin" inputmode="numeric" pattern="[0-9]{4,6}" placeholder="4 to 6 digits" />
                </div>
              </div>
              <div class="field">
                <label for="sPassword">Password</label>
                <input id="sPassword" name="password" type="password" minlength="10" required />
                <p class="hint">At least 10 characters.</p>
              </div>
              <button class="btn btn-ink btn-block" type="submit">Add staff member</button>
            </form>
          </div>

          <div class="card">
            <h2>Change your password</h2>
            <form method="post" action="/admin/settings/password">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <div class="field">
                <label for="currentPassword">Current password</label>
                <input id="currentPassword" name="current" type="password" required />
              </div>
              <div class="field">
                <label for="newPassword">New password</label>
                <input id="newPassword" name="password" type="password" minlength="10" required />
              </div>
              <button class="btn btn-block" type="submit">Update password</button>
            </form>
          </div>
        </div>
      </div>
    `,
  });
}

export { PARISHES, formatTime };
