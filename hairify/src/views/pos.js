import { html, jsonScript } from '../lib/html.js';
import { formatMoney, formatPrice } from '../lib/money.js';
import { money, staffLayout, statusTag } from './staff.js';
import { variantLabel } from '../lib/catalog.js';

const NAV = [
  { key: 'till', href: '/pos', label: 'Till' },
  { key: 'sales', href: '/pos/sales', label: 'Sales' },
  { key: 'held', href: '/pos/held', label: 'Held' },
  { key: 'shift', href: '/pos/shift', label: 'Shift' },
];

function shell(options) {
  return staffLayout({ ...options, nav: NAV, brandHref: '/pos', brandSuffix: 'POS' });
}

/** Shown when no shift is open at this register. */
export function openShiftPage({ user, register, csrf, error = null }) {
  return shell({
    title: 'Open the till',
    user,
    active: 'shift',
    body: html`
      <div class="wrap-narrow" style="margin:0 auto">
        <div class="page-title"><div><h1>Open the till</h1><p>${register.name}</p></div></div>
        ${error ? html`<p class="alert alert-bad">${error}</p>` : ''}
        <div class="card">
          <h2>Count your opening float</h2>
          <p class="muted" style="font-size:.9rem">
            Count the cash in the drawer before the first sale. The system compares it against what
            should be there when you cash up.
          </p>
          <form method="post" action="/pos/shift/open">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <div class="field">
              <label for="float">Opening float ($)</label>
              <input id="float" name="float" type="number" step="0.01" min="0" value="200.00" required autofocus />
            </div>
            <button class="btn btn-pink btn-lg btn-block" type="submit">Open the till</button>
          </form>
        </div>
      </div>
    `,
  });
}

export function tillPage({ user, shift, settings, csrf, heldCount, quickPicks }) {
  const body = html`
    <div class="till">
      <section class="card">
        <form class="search-row" data-search-form>
          <label class="visually-hidden" for="posSearch">Search or scan</label>
          <input
            id="posSearch"
            name="q"
            placeholder="Scan a barcode, or search by name or SKU"
            autocomplete="off"
            autofocus
          />
          <button class="btn btn-ink" type="submit">Search</button>
        </form>
        <div class="results" data-results>
          ${quickPicks.map(
            (variant) => html`
              <button
                class="result"
                type="button"
                data-add-variant="${variant.id}"
                ${variant.stock <= 0 ? 'disabled' : ''}
              >
                <span class="name">${variant.name}</span>
                <span class="meta">${variant.label || variant.sku}</span>
                <span class="price">${formatPrice(variant.price_cents)}</span>
                <span class="stock ${variant.stock <= 0 ? 'out' : variant.stock <= 3 ? 'low' : 'in'}">
                  ${variant.stock <= 0 ? 'Out of stock' : `${variant.stock} in stock`}
                </span>
              </button>
            `,
          )}
        </div>
      </section>

      <section class="ticket">
        <div class="ticket-head">
          <h2>Current sale</h2>
          <button class="btn btn-sm" type="button" data-clear-sale>Clear</button>
        </div>
        <div class="ticket-lines" data-ticket-lines>
          <p class="empty">Scan or search to start a sale.</p>
        </div>
        <div class="ticket-foot">
          <div class="row"><span>Items</span><span data-count>0</span></div>
          <div class="row"><span>Subtotal</span><span data-subtotal>$0.00</span></div>
          <div class="row"><span>Discount</span><span data-discount>$0.00</span></div>
          <div class="row total"><span>Total</span><span data-total>$0.00</span></div>
          <div class="ticket-actions">
            <button class="btn btn-pink btn-lg" type="button" data-tender disabled>Take payment</button>
            <button class="btn" type="button" data-hold disabled>Hold sale</button>
            <a class="btn" href="/pos/held">Held (${heldCount})</a>
          </div>
        </div>
      </section>
    </div>

    <dialog id="tenderDialog">
      <form method="dialog">
        <div class="modal-head">
          <h2>Take payment</h2>
          <button class="btn btn-sm" value="cancel" type="submit">Close</button>
        </div>
      </form>
      <div class="modal-body">
        <p class="tender-total" data-tender-total>$0.00</p>
        <p class="tender-label">Amount due</p>

        <div class="tender-methods" role="group" aria-label="Payment method">
          <button type="button" data-method="cash" aria-pressed="true">Cash</button>
          <button type="button" data-method="card" aria-pressed="false">Card</button>
          <button type="button" data-method="split" aria-pressed="false">Split</button>
        </div>

        <div data-cash-fields>
          <div class="quick-cash" data-quick-cash></div>
          <div class="field">
            <label for="tendered">Cash received ($)</label>
            <input id="tendered" type="number" step="0.01" min="0" data-tendered />
          </div>
          <p class="change-due" data-change><span>Change due</span><span>$0.00</span></p>
        </div>

        <div data-split-fields hidden>
          <div class="field">
            <label for="splitCard">Paid by card ($)</label>
            <input id="splitCard" type="number" step="0.01" min="0" data-split-card />
          </div>
          <p class="muted" style="font-size:.85rem">The rest is taken as cash.</p>
        </div>

        <div class="field" style="margin-top:1rem">
          <label for="posCustomer">Customer name (optional)</label>
          <input id="posCustomer" data-customer placeholder="For the receipt or a callback" />
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" data-tender-cancel>Cancel</button>
        <button class="btn btn-pink btn-lg" type="button" data-tender-confirm>Complete sale</button>
      </div>
    </dialog>

    <dialog id="holdDialog">
      <div class="modal-head"><h2>Hold this sale</h2></div>
      <div class="modal-body">
        <div class="field">
          <label for="holdLabel">Label</label>
          <input id="holdLabel" data-hold-label placeholder="e.g. lady in the pink top" />
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" type="button" data-hold-cancel>Cancel</button>
        <button class="btn btn-ink" type="button" data-hold-confirm>Hold sale</button>
      </div>
    </dialog>
  `;

  return shell({
    title: 'Till',
    user,
    active: 'till',
    aside: html`<span class="who">${shift.register_name} · float ${formatMoney(shift.opening_float_cents)}</span>`,
    body,
    scripts: html`
      <script id="posConfig" type="application/json">
        ${jsonScript({ csrf, shiftId: shift.id, currency: settings.currency_code })}
      </script>
      <script src="/js/pos.js" defer></script>
    `,
  });
}

export function receiptPage({ user, order, settings, changeCents = 0 }) {
  return shell({
    title: `Receipt ${order.reference}`,
    user,
    active: 'sales',
    body: html`
      <div class="no-print" style="text-align:center;margin-bottom:1rem">
        <button class="btn btn-ink" type="button" onclick="window.print()">Print receipt</button>
        <a class="btn btn-pink" href="/pos">New sale</a>
        <a class="btn" href="/pos/sales">All sales</a>
      </div>

      <div class="receipt">
        <h2>Hairify</h2>
        <p class="center">
          ${settings.store_address}<br />${settings.store_parish}<br />${settings.store_phone}
        </p>
        <hr />
        <div class="line"><span>${order.reference}</span><span>${order.placed_at}</span></div>
        <div class="line"><span>Served by</span><span>${order.served_by || '—'}</span></div>
        <hr />
        ${order.items.map(
          (item) => html`
            <div class="line">
              <span>${item.quantity} × ${item.name_snapshot}</span>
              <span>${formatMoney(item.line_total_cents)}</span>
            </div>
            ${item.variant_snapshot ? html`<div class="line indent"><span>${item.variant_snapshot}</span><span></span></div>` : ''}
          `,
        )}
        <hr />
        <div class="line"><span>Subtotal</span><span>${formatMoney(order.subtotal_cents)}</span></div>
        ${order.discount_cents
          ? html`<div class="line"><span>Discount</span><span>−${formatMoney(order.discount_cents)}</span></div>`
          : ''}
        <div class="line total"><span>Total</span><span>${formatMoney(order.total_cents)}</span></div>
        ${order.payments.map(
          (payment) => html`<div class="line">
            <span>${payment.method === 'card' ? 'Card' : 'Cash'}</span>
            <span>${formatMoney(payment.amount_cents)}</span>
          </div>`,
        )}
        ${changeCents > 0
          ? html`<div class="line total"><span>Change</span><span>${formatMoney(changeCents)}</span></div>`
          : ''}
        <hr />
        <p class="center">${settings.receipt_footer}</p>
        <p class="center">hairifybb.com · @${settings.instagram}</p>
      </div>
    `,
  });
}

export function salesPage({ user, orders }) {
  return shell({
    title: 'Sales',
    user,
    active: 'sales',
    body: html`
      <div class="page-title"><div><h1>Recent sales</h1><p>Reprint a receipt or process a return.</p></div></div>
      <div class="card card-flush">
        ${orders.length
          ? html`<table>
              <thead>
                <tr>
                  <th>Sale</th><th>When</th><th>Served by</th><th>Payment</th>
                  <th class="num">Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(
                  (order) => html`<tr>
                    <td><a href="/pos/sales/${order.reference}">${order.reference}</a></td>
                    <td>${order.placed_at}</td>
                    <td>${order.served_by || '—'}</td>
                    <td>${statusTag(order.payment_status)}</td>
                    <td class="num">${money(order.total_cents)}</td>
                    <td class="num"><a class="btn btn-sm" href="/pos/receipt/${order.reference}">Receipt</a></td>
                  </tr>`,
                )}
              </tbody>
            </table>`
          : html`<p class="empty">No sales at this register yet.</p>`}
      </div>
    `,
  });
}

export function saleDetailPage({ user, order, csrf, flash = null }) {
  const refundable = order.items.filter((item) => item.quantity > item.refunded_qty);

  return shell({
    title: order.reference,
    user,
    active: 'sales',
    body: html`
      <div class="page-title">
        <div><h1>${order.reference}</h1><p>${order.placed_at} · served by ${order.served_by || '—'}</p></div>
        <div>
          <a class="btn" href="/pos/receipt/${order.reference}">Receipt</a>
          <a class="btn" href="/pos/sales">Back</a>
        </div>
      </div>
      ${flash ? html`<p class="alert alert-${flash.kind}">${flash.message}</p>` : ''}

      <div class="grid grid-2">
        <div class="card card-flush">
          <table>
            <thead>
              <tr><th>Item</th><th class="num">Qty</th><th class="num">Refunded</th><th class="num">Total</th></tr>
            </thead>
            <tbody>
              ${order.items.map(
                (item) => html`<tr>
                  <td>
                    ${item.name_snapshot}
                    ${item.variant_snapshot ? html`<br /><span class="muted" style="font-size:.82rem">${item.variant_snapshot}</span>` : ''}
                  </td>
                  <td class="num">${item.quantity}</td>
                  <td class="num">${item.refunded_qty || '—'}</td>
                  <td class="num">${money(item.line_total_cents)}</td>
                </tr>`,
              )}
            </tbody>
            <tfoot>
              <tr><th colspan="3">Total</th><th class="num">${money(order.total_cents)}</th></tr>
              ${order.refunded_cents
                ? html`<tr><th colspan="3">Refunded</th><th class="num">−${money(order.refunded_cents)}</th></tr>`
                : ''}
            </tfoot>
          </table>
        </div>

        <div class="card">
          <h2>Return or refund</h2>
          ${refundable.length
            ? html`<form method="post" action="/pos/sales/${order.reference}/refund">
                <input type="hidden" name="_csrf" value="${csrf}" />
                ${refundable.map(
                  (item) => html`
                    <div class="field">
                      <label for="qty-${item.id}">
                        ${item.name_snapshot}${item.variant_snapshot ? ` · ${item.variant_snapshot}` : ''}
                      </label>
                      <input
                        id="qty-${item.id}"
                        name="item-${item.id}"
                        type="number"
                        min="0"
                        max="${item.quantity - item.refunded_qty}"
                        value="0"
                      />
                      <p class="hint">
                        Up to ${item.quantity - item.refunded_qty} ·
                        ${formatMoney(Math.round(item.line_total_cents / item.quantity))} each
                      </p>
                    </div>
                  `,
                )}
                <div class="field">
                  <label for="method">Refund as</label>
                  <select id="method" name="method">
                    <option value="cash">Cash from the drawer</option>
                    <option value="card">Back to the card</option>
                  </select>
                </div>
                <div class="field">
                  <label for="reason">Reason</label>
                  <input id="reason" name="reason" placeholder="e.g. wrong texture" />
                </div>
                <label class="field" style="display:flex;gap:.5rem;align-items:center">
                  <input type="checkbox" name="restock" value="1" checked style="width:auto" />
                  <span>Put the stock back on the shelf</span>
                </label>
                <button class="btn btn-danger btn-block" type="submit">Refund</button>
              </form>`
            : html`<p class="muted">Everything on this sale has already been refunded.</p>`}
        </div>
      </div>
    `,
  });
}

export function heldPage({ user, held, csrf }) {
  return shell({
    title: 'Held sales',
    user,
    active: 'held',
    body: html`
      <div class="page-title"><div><h1>Held sales</h1><p>Parked sales waiting to be finished.</p></div></div>
      ${held.length
        ? html`<div class="grid grid-3">
            ${held.map(
              (sale) => html`
                <div class="card">
                  <h3>${sale.label}</h3>
                  <p class="muted" style="font-size:.85rem">${sale.created_at} · ${sale.user_name || '—'}</p>
                  <ul style="padding-left:1.1rem;font-size:.88rem">
                    ${sale.lines.map((line) => html`<li>${line.quantity} × ${line.name}</li>`)}
                  </ul>
                  <form method="post" action="/pos/held/${sale.id}/resume">
                    <input type="hidden" name="_csrf" value="${csrf}" />
                    <button class="btn btn-pink btn-block" type="submit">Resume</button>
                  </form>
                  <form method="post" action="/pos/held/${sale.id}/delete" style="margin-top:.5rem">
                    <input type="hidden" name="_csrf" value="${csrf}" />
                    <button class="btn btn-sm btn-block" type="submit">Discard</button>
                  </form>
                </div>
              `,
            )}
          </div>`
        : html`<div class="card"><p class="empty">Nothing is on hold.</p></div>`}
    `,
  });
}

export function shiftPage({ user, shift, summary, csrf, flash = null }) {
  const variance = summary.expectedCashCents;

  return shell({
    title: 'Shift',
    user,
    active: 'shift',
    body: html`
      <div class="page-title">
        <div>
          <h1>Shift at ${shift.register_name}</h1>
          <p>Opened ${shift.opened_at} by ${shift.user_name}</p>
        </div>
      </div>
      ${flash ? html`<p class="alert alert-${flash.kind}">${flash.message}</p>` : ''}

      <div class="grid grid-4" style="margin-bottom:1rem">
        <div class="stat"><p class="label">Sales</p><p class="value">${summary.sales.orders}</p></div>
        <div class="stat"><p class="label">Taken</p><p class="value">${formatMoney(summary.sales.gross_cents)}</p></div>
        <div class="stat">
          <p class="label">Refunds</p>
          <p class="value">${formatMoney(summary.refunds.total_cents)}</p>
          <p class="note">${summary.refunds.count} refunded</p>
        </div>
        <div class="stat">
          <p class="label">Cash expected</p>
          <p class="value">${formatMoney(variance)}</p>
          <p class="note">Float ${formatMoney(shift.opening_float_cents)}</p>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>Taken by method</h2>
          <table>
            <tbody>
              ${summary.byMethod.length
                ? summary.byMethod.map(
                    (row) => html`<tr>
                      <td>${row.method.replace(/-/g, ' ')}</td>
                      <td class="num">${row.count}</td>
                      <td class="num">${money(row.total_cents)}</td>
                    </tr>`,
                  )
                : html`<tr><td colspan="3" class="muted">Nothing taken yet.</td></tr>`}
            </tbody>
          </table>

          <h2 style="margin-top:1.25rem">Cash drawer</h2>
          <table>
            <tbody>
              ${summary.cashMovements.map(
                (movement) => html`<tr>
                  <td>${movement.type.replace(/-/g, ' ')}</td>
                  <td class="muted">${movement.reason || ''}</td>
                  <td class="num">${money(movement.amount_cents)}</td>
                </tr>`,
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div class="card">
            <h2>Pay in or pay out</h2>
            <form method="post" action="/pos/shift/cash">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <div class="field-row">
                <div class="field">
                  <label for="cashType">Type</label>
                  <select id="cashType" name="type">
                    <option value="pay-in">Pay in</option>
                    <option value="pay-out">Pay out</option>
                    <option value="drop">Safe drop</option>
                  </select>
                </div>
                <div class="field">
                  <label for="cashAmount">Amount ($)</label>
                  <input id="cashAmount" name="amount" type="number" step="0.01" min="0.01" required />
                </div>
              </div>
              <div class="field">
                <label for="cashReason">Reason</label>
                <input id="cashReason" name="reason" placeholder="e.g. change from the bank" required />
              </div>
              <button class="btn btn-ink btn-block" type="submit">Record</button>
            </form>
          </div>

          <div class="card">
            <h2>Cash up and close</h2>
            <p class="muted" style="font-size:.9rem">
              Count the drawer and enter the total. Anything over or short is recorded against this shift.
            </p>
            <form method="post" action="/pos/shift/close">
              <input type="hidden" name="_csrf" value="${csrf}" />
              <div class="field">
                <label for="counted">Counted cash ($)</label>
                <input id="counted" name="counted" type="number" step="0.01" min="0" required />
                <p class="hint">The system expects ${formatMoney(variance)}.</p>
              </div>
              <div class="field">
                <label for="closeNote">Note (optional)</label>
                <input id="closeNote" name="note" />
              </div>
              <button class="btn btn-danger btn-block" type="submit">Close the till</button>
            </form>
          </div>
        </div>
      </div>
    `,
  });
}

export function shiftClosedPage({ user, shift }) {
  const over = shift.variance_cents > 0;
  const kind = shift.variance_cents === 0 ? 'ok' : over ? 'warn' : 'bad';

  return shell({
    title: 'Till closed',
    user,
    active: 'shift',
    body: html`
      <div class="wrap-narrow" style="margin:0 auto">
        <div class="page-title"><div><h1>Till closed</h1><p>${shift.register_name} · ${shift.closed_at}</p></div></div>
        <div class="card">
          <table>
            <tbody>
              <tr><th>Expected</th><td class="num">${money(shift.expected_cents)}</td></tr>
              <tr><th>Counted</th><td class="num">${money(shift.counted_cents)}</td></tr>
              <tr>
                <th>Variance</th>
                <td class="num">
                  <span class="tag tag-${kind}">
                    ${shift.variance_cents === 0 ? 'Balanced' : `${over ? 'Over' : 'Short'} ${formatMoney(Math.abs(shift.variance_cents))}`}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          ${shift.note ? html`<p class="muted" style="margin-top:1rem">${shift.note}</p>` : ''}
          <a class="btn btn-pink btn-block btn-lg" style="margin-top:1rem" href="/pos">Open a new till</a>
        </div>
      </div>
    `,
  });
}

export { variantLabel };
