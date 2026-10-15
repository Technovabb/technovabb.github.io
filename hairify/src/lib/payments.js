/**
 * Card payments.
 *
 * The shop runs out of the box on "pay on delivery" and in-store card, with
 * `PAYMENT_PROVIDER=manual`: card checkout then goes to a clearly-labelled test
 * page inside the app, so the whole flow can be walked through before a merchant
 * account exists.
 *
 * To go live, add a provider below. A provider takes an order and returns either
 * a `redirectUrl` to send the shopper to, or `{ ok: true }` once captured. The
 * provider's webhook or return URL then calls `markOrderPaid`.
 */

import { recordPayment, updateOrderStatus } from './orders.js';

const providers = {
  /** Built-in test page. Never charges anything. */
  manual: {
    label: 'Test card page (no money moves)',
    live: false,
    async start({ order }) {
      return { ok: true, redirectUrl: `/pay/${order.reference}` };
    },
  },

  /**
   * First Atlantic Commerce — the gateway most Barbadian merchant accounts sit
   * behind. Fill this in with the credentials from the client's acquirer.
   */
  firstatlantic: {
    label: 'First Atlantic Commerce',
    live: true,
    async start({ order, config }) {
      if (!config.secretKey) {
        return { ok: false, error: 'Card payments are not configured yet.' };
      }
      // INTEGRATION POINT: post the order to the gateway's hosted page and
      // return the URL it gives back. The gateway then redirects the shopper to
      // /payment-return, which calls markOrderPaid.
      throw new Error(
        'The First Atlantic Commerce integration still needs the merchant credentials. ' +
          'See README → Card payments.',
      );
    },
  },

  /** Stripe, for a card-present-free setup or testing with real test keys. */
  stripe: {
    label: 'Stripe Checkout',
    live: true,
    async start({ order, config, siteUrl }) {
      if (!config.secretKey) {
        return { ok: false, error: 'Card payments are not configured yet.' };
      }

      const body = new URLSearchParams({
        mode: 'payment',
        success_url: `${siteUrl}/payment-return?reference=${order.reference}&status=paid`,
        cancel_url: `${siteUrl}/payment-return?reference=${order.reference}&status=cancelled`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'bbd',
        'line_items[0][price_data][unit_amount]': String(order.total_cents),
        'line_items[0][price_data][product_data][name]': `Hairify order ${order.reference}`,
        client_reference_id: order.reference,
      });

      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body,
      });
      const session = await response.json();
      if (!response.ok) {
        return { ok: false, error: session.error?.message || 'The payment page could not be opened.' };
      }
      return { ok: true, redirectUrl: session.url };
    },
  },
};

export function paymentProvider(config) {
  return providers[config.provider] || providers.manual;
}

export function paymentProviderLabel(config) {
  return paymentProvider(config).label;
}

/** Starts a card payment for an order. */
export async function capturePayment(config, { order, siteUrl }) {
  const provider = paymentProvider(config);
  try {
    return await provider.start({ order, config, siteUrl });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/** Called once a gateway confirms the money is taken. */
export function markOrderPaid(db, order, { providerRef = null, method = 'online-card' } = {}) {
  recordPayment(db, order.id, {
    method,
    amountCents: order.total_cents - order.paid_cents,
    providerRef,
  });
  if (order.status === 'pending-payment') updateOrderStatus(db, order.id, 'placed');
  return order;
}
