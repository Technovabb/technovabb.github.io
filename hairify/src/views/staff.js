/** Shell and shared pieces for the POS and the back office. */

import { html, raw } from '../lib/html.js';
import { formatMoney } from '../lib/money.js';

export function staffLayout({
  title,
  user,
  nav = [],
  active = '',
  body,
  scripts = '',
  brandHref = '/pos',
  brandLabel = 'Hairify',
  brandSuffix = 'POS',
  aside = '',
}) {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Hairify</title>
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="#1b1116" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=Figtree:wght@400;600;700;800&display=swap"
    />
    <link rel="stylesheet" href="/css/pos.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <header class="top-bar no-print">
      <a class="brand" href="${brandHref}">${brandLabel}<span>${brandSuffix ? ` ${brandSuffix}` : ''}</span></a>
      <nav>
        ${nav.map(
          (item) => html`<a href="${item.href}" aria-current="${item.key === active ? 'page' : 'false'}">${item.label}</a>`,
        )}
      </nav>
      <span class="spacer"></span>
      ${aside}
      ${user
        ? html`<span class="who"><strong>${user.name}</strong> · ${user.role}</span>
            <a class="btn btn-sm" href="${brandHref === '/pos' ? '/pos/signout' : '/admin/signout'}">Sign out</a>`
        : ''}
    </header>
    <div class="wrap">${body}</div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    ${scripts}
  </body>
</html>`;
}

export function signInPage({ title, subtitle, action, error = null, csrf, nextUrl = '', withPin = false }) {
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Hairify</title>
    <meta name="robots" content="noindex" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=Figtree:wght@400;600;700;800&display=swap"
    />
    <link rel="stylesheet" href="/css/pos.css" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body class="signin-page">
    <main class="signin-card">
      <p class="brand">Hairify</p>
      <p class="sub">${subtitle}</p>
      ${error ? html`<p class="alert alert-bad">${error}</p>` : ''}

      <form method="post" action="${action}">
        <input type="hidden" name="_csrf" value="${csrf}" />
        <input type="hidden" name="next" value="${nextUrl}" />
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="username" required autofocus />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-pink btn-block btn-lg" type="submit">Sign in</button>
      </form>

      ${withPin
        ? html`<form method="post" action="${action}" style="margin-top:1.5rem" id="pinForm">
            <input type="hidden" name="_csrf" value="${csrf}" />
            <input type="hidden" name="next" value="${nextUrl}" />
            <input type="hidden" name="pin" id="pinValue" />
            <p class="field" style="margin-bottom:.4rem">
              <label for="pinDisplay">Or sign in with your till PIN</label>
            </p>
            <div class="pin-display" id="pinDisplay" aria-live="polite"></div>
            <div class="pin-pad">
              ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => html`<button type="button" data-digit="${digit}">${digit}</button>`)}
              <button type="button" data-clear>Clear</button>
              <button type="button" data-digit="0">0</button>
              <button class="btn-pink" type="submit" style="font-weight:800">Enter</button>
            </div>
          </form>
          <script>
            (() => {
              const display = document.getElementById('pinDisplay');
              const value = document.getElementById('pinValue');
              let pin = '';
              document.getElementById('pinForm').addEventListener('click', (event) => {
                const digit = event.target.closest('[data-digit]');
                if (digit) { pin = (pin + digit.dataset.digit).slice(0, 6); }
                if (event.target.closest('[data-clear]')) { pin = ''; }
                display.textContent = '•'.repeat(pin.length);
                value.value = pin;
              });
            })();
          </script>`
        : ''}
    </main>
  </body>
</html>`;
}

/** Money cell helper for tables. */
export function money(cents) {
  return raw(formatMoney(cents));
}

export const STATUS_TAGS = {
  'pending-payment': 'tag-warn',
  placed: 'tag-pink',
  packed: 'tag-pink',
  'out-for-delivery': 'tag-warn',
  'ready-for-pickup': 'tag-warn',
  completed: 'tag-ok',
  cancelled: 'tag-bad',
  paid: 'tag-ok',
  unpaid: 'tag-warn',
  'part-paid': 'tag-warn',
  refunded: 'tag-bad',
  voided: 'tag-bad',
};

export function statusTag(value) {
  return html`<span class="tag ${STATUS_TAGS[value] || ''}">${String(value).replace(/-/g, ' ')}</span>`;
}
