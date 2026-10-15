/* Hairify till. Keeps the current sale in memory and posts it as one request,
   so a sale is either written whole or not at all. */

(() => {
  'use strict';

  const config = JSON.parse(document.getElementById('posConfig')?.textContent || '{}');
  const lines = [];

  const el = {
    searchForm: document.querySelector('[data-search-form]'),
    searchInput: document.getElementById('posSearch'),
    results: document.querySelector('[data-results]'),
    ticket: document.querySelector('[data-ticket-lines]'),
    count: document.querySelector('[data-count]'),
    subtotal: document.querySelector('[data-subtotal]'),
    discount: document.querySelector('[data-discount]'),
    total: document.querySelector('[data-total]'),
    tenderBtn: document.querySelector('[data-tender]'),
    holdBtn: document.querySelector('[data-hold]'),
    tenderDialog: document.getElementById('tenderDialog'),
    holdDialog: document.getElementById('holdDialog'),
    toast: document.getElementById('toast'),
  };

  const money = (cents) => `$${(cents / 100).toFixed(2)}`;

  let toastTimer;
  function toast(message, bad = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('is-bad', bad);
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2800);
  }

  async function api(path, body) {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json', 'x-csrf-token': config.csrf } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That did not work.');
    return data;
  }

  /* ------------------------------------------------------------ totals */

  function totals() {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discount = lines.reduce((sum, line) => sum + line.discount, 0);
    return { subtotal, discount, total: Math.max(0, subtotal - discount) };
  }

  function renderTicket() {
    if (lines.length === 0) {
      el.ticket.innerHTML = '<p class="empty">Scan or search to start a sale.</p>';
    } else {
      el.ticket.innerHTML = lines
        .map(
          (line, index) => `
          <div class="ticket-line">
            <div>
              <p class="name">${escapeHtml(line.name)}</p>
              <p class="meta">${escapeHtml(line.label || line.sku)} · ${money(line.price)}${
                line.discount ? ` · less ${money(line.discount)}` : ''
              }</p>
            </div>
            <p class="amount">${money(line.price * line.quantity - line.discount)}</p>
            <div class="controls">
              <button type="button" data-step="-1" data-index="${index}" aria-label="Fewer">−</button>
              <span class="qty-value">${line.quantity}</span>
              <button type="button" data-step="1" data-index="${index}" aria-label="More">+</button>
              <button type="button" class="grow" data-discount-line="${index}">Discount</button>
              <button type="button" data-remove="${index}" aria-label="Remove">✕</button>
            </div>
          </div>`,
        )
        .join('');
    }

    const sums = totals();
    el.count.textContent = lines.reduce((sum, line) => sum + line.quantity, 0);
    el.subtotal.textContent = money(sums.subtotal);
    el.discount.textContent = money(sums.discount);
    el.total.textContent = money(sums.total);
    el.tenderBtn.disabled = lines.length === 0;
    el.holdBtn.disabled = lines.length === 0;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  }

  function addLine(variant) {
    if (variant.stock <= 0) {
      toast(`${variant.name} is out of stock`, true);
      return;
    }
    const existing = lines.find((line) => line.variantId === variant.id);
    const already = existing ? existing.quantity : 0;
    if (already + 1 > variant.stock) {
      toast(`Only ${variant.stock} of ${variant.name} in stock`, true);
      return;
    }
    if (existing) existing.quantity += 1;
    else
      lines.push({
        variantId: variant.id,
        name: variant.name,
        label: variant.label,
        sku: variant.sku,
        price: variant.price_cents,
        quantity: 1,
        discount: 0,
        stock: variant.stock,
      });
    renderTicket();
  }

  /* ------------------------------------------------------------ search */

  let searchTimer;
  async function runSearch(term) {
    if (!term.trim()) return;
    try {
      const data = await api(`/pos/api/search?q=${encodeURIComponent(term)}`);

      // A barcode scanner types fast and ends with Enter; one exact hit goes
      // straight onto the ticket.
      if (data.exact) {
        addLine(data.exact);
        el.searchInput.value = '';
        el.searchInput.focus();
        return;
      }

      el.results.innerHTML = data.results.length
        ? data.results
            .map(
              (variant) => `
            <button class="result" type="button" data-add-variant="${variant.id}" ${
              variant.stock <= 0 ? 'disabled' : ''
            }>
              <span class="name">${escapeHtml(variant.name)}</span>
              <span class="meta">${escapeHtml(variant.label || variant.sku)}</span>
              <span class="price">${money(variant.price_cents)}</span>
              <span class="stock ${variant.stock <= 0 ? 'out' : variant.stock <= 3 ? 'low' : 'in'}">${
                variant.stock <= 0 ? 'Out of stock' : `${variant.stock} in stock`
              }</span>
            </button>`,
            )
            .join('')
        : '<p class="empty">Nothing matched that.</p>';
      window.__posResults = data.results;
    } catch (error) {
      toast(error.message, true);
    }
  }

  el.searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    runSearch(el.searchInput.value);
  });

  el.searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const term = el.searchInput.value;
    if (term.length < 2) return;
    searchTimer = setTimeout(() => runSearch(term), 220);
  });

  /* ------------------------------------------------------- ticket edits */

  document.addEventListener('click', async (event) => {
    const addButton = event.target.closest('[data-add-variant]');
    if (addButton && !addButton.disabled) {
      const id = Number(addButton.dataset.addVariant);
      const found =
        (window.__posResults || []).find((variant) => variant.id === id) ||
        (await api(`/pos/api/variant/${id}`).catch(() => null));
      if (found) addLine(found);
      return;
    }

    const step = event.target.closest('[data-step]');
    if (step) {
      const line = lines[Number(step.dataset.index)];
      const next = line.quantity + Number(step.dataset.step);
      if (next > line.stock) {
        toast(`Only ${line.stock} in stock`, true);
        return;
      }
      if (next <= 0) lines.splice(Number(step.dataset.index), 1);
      else line.quantity = next;
      renderTicket();
      return;
    }

    const remove = event.target.closest('[data-remove]');
    if (remove) {
      lines.splice(Number(remove.dataset.remove), 1);
      renderTicket();
      return;
    }

    const discountLine = event.target.closest('[data-discount-line]');
    if (discountLine) {
      const line = lines[Number(discountLine.dataset.discountLine)];
      const input = window.prompt(`Discount on ${line.name} ($)`, (line.discount / 100).toFixed(2));
      if (input === null) return;
      const amount = Math.round(Number(input) * 100);
      const maximum = line.price * line.quantity;
      if (!Number.isFinite(amount) || amount < 0 || amount > maximum) {
        toast(`A discount has to be between $0 and ${money(maximum)}`, true);
        return;
      }
      line.discount = amount;
      renderTicket();
      return;
    }

    if (event.target.closest('[data-clear-sale]')) {
      if (lines.length && !window.confirm('Clear this sale?')) return;
      lines.length = 0;
      renderTicket();
    }
  });

  /* ------------------------------------------------------------ tender */

  let method = 'cash';
  const tender = {
    total: () => totals().total,
    tenderedEl: document.querySelector('[data-tendered]'),
    splitCardEl: document.querySelector('[data-split-card]'),
    changeEl: document.querySelector('[data-change]'),
    cashFields: document.querySelector('[data-cash-fields]'),
    splitFields: document.querySelector('[data-split-fields]'),
    quickCash: document.querySelector('[data-quick-cash]'),
    customerEl: document.querySelector('[data-customer]'),
  };

  function renderQuickCash() {
    const due = tender.total();
    const notes = [due, Math.ceil(due / 1000) * 1000, Math.ceil(due / 5000) * 5000, 10000, 20000];
    const unique = [...new Set(notes.filter((value) => value >= due))].slice(0, 4);
    tender.quickCash.innerHTML = unique
      .map((value) => `<button type="button" data-cash="${value}">${money(value)}</button>`)
      .join('');
  }

  function renderChange() {
    const due = tender.total();
    let paid;
    if (method === 'cash') paid = Math.round(Number(tender.tenderedEl.value || 0) * 100);
    else if (method === 'card') paid = due;
    else paid = due; // split always covers the total between card and cash

    const change = paid - due;
    tender.changeEl.hidden = method !== 'cash';
    tender.changeEl.classList.toggle('is-short', change < 0);
    tender.changeEl.innerHTML =
      change < 0
        ? `<span>Still to pay</span><span>${money(-change)}</span>`
        : `<span>Change due</span><span>${money(change)}</span>`;
  }

  function setMethod(next) {
    method = next;
    for (const button of document.querySelectorAll('[data-method]')) {
      button.setAttribute('aria-pressed', String(button.dataset.method === next));
    }
    tender.cashFields.hidden = next !== 'cash';
    tender.splitFields.hidden = next !== 'split';
    renderChange();
  }

  el.tenderBtn?.addEventListener('click', () => {
    document.querySelector('[data-tender-total]').textContent = money(tender.total());
    tender.tenderedEl.value = '';
    tender.splitCardEl.value = '';
    setMethod('cash');
    renderQuickCash();
    el.tenderDialog.showModal();
    tender.tenderedEl.focus();
  });

  el.tenderDialog?.addEventListener('click', (event) => {
    const methodButton = event.target.closest('[data-method]');
    if (methodButton) setMethod(methodButton.dataset.method);

    const cashButton = event.target.closest('[data-cash]');
    if (cashButton) {
      tender.tenderedEl.value = (Number(cashButton.dataset.cash) / 100).toFixed(2);
      renderChange();
    }

    if (event.target.closest('[data-tender-cancel]')) el.tenderDialog.close();
  });

  tender.tenderedEl?.addEventListener('input', renderChange);
  tender.splitCardEl?.addEventListener('input', renderChange);

  document.querySelector('[data-tender-confirm]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const due = tender.total();
    const payments = [];

    if (method === 'cash') {
      const tendered = Math.round(Number(tender.tenderedEl.value || 0) * 100);
      if (tendered < due) {
        toast('That is less than the amount due', true);
        return;
      }
      payments.push({ method: 'cash', amountCents: due, tenderedCents: tendered });
    } else if (method === 'card') {
      payments.push({ method: 'card', amountCents: due });
    } else {
      const card = Math.round(Number(tender.splitCardEl.value || 0) * 100);
      if (card <= 0 || card >= due) {
        toast('Split the sale between card and cash', true);
        return;
      }
      payments.push({ method: 'card', amountCents: card });
      payments.push({ method: 'cash', amountCents: due - card, tenderedCents: due - card });
    }

    button.disabled = true;
    try {
      const result = await api('/pos/api/sale', {
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          discountCents: line.discount,
        })),
        payments,
        customerName: tender.customerEl.value.trim() || null,
      });
      window.location.href = result.receiptUrl;
    } catch (error) {
      toast(error.message, true);
      button.disabled = false;
    }
  });

  /* -------------------------------------------------------------- hold */

  el.holdBtn?.addEventListener('click', () => {
    document.querySelector('[data-hold-label]').value = '';
    el.holdDialog.showModal();
  });
  document.querySelector('[data-hold-cancel]')?.addEventListener('click', () => el.holdDialog.close());
  document.querySelector('[data-hold-confirm]')?.addEventListener('click', async () => {
    const label = document.querySelector('[data-hold-label]').value.trim() || 'Held sale';
    try {
      await api('/pos/api/hold', { label, lines });
      lines.length = 0;
      renderTicket();
      el.holdDialog.close();
      toast('Sale held');
    } catch (error) {
      toast(error.message, true);
    }
  });

  /* ------------------------------------------------- resuming a held sale */

  const resumed = sessionStorage.getItem('hairify-resume');
  if (resumed) {
    sessionStorage.removeItem('hairify-resume');
    try {
      for (const line of JSON.parse(resumed)) lines.push(line);
    } catch {
      // A malformed hold is simply dropped rather than breaking the till.
    }
  }

  renderTicket();
})();
