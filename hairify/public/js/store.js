/* Hairify storefront behaviour. Progressive enhancement only: every form on the
   site still works with JavaScript switched off. */

(() => {
  'use strict';

  const money = (cents) =>
    cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 2600);
  }

  function setBagCount(count) {
    const bag = document.querySelector('.bag-button');
    if (!bag) return;
    let badge = bag.querySelector('.bag-count');
    if (!count) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'bag-count';
      bag.appendChild(badge);
    }
    badge.textContent = count;
    bag.setAttribute('aria-label', `Your bag, ${count} items`);
  }

  async function addToBag(payload) {
    const response = await fetch('/api/cart/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'That did not work. Please try again.');
    return data;
  }

  /* ----------------------------------------------------------- mobile nav */

  const navToggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('mobile-nav');
  navToggle?.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  /* --------------------------------------------------------- quick adding */

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-quick-add]');
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    try {
      const result = await addToBag({ slug: button.dataset.quickAdd, quantity: 1 });
      setBagCount(result.count);
      toast(result.message || 'Added to your bag');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  /* ------------------------------------------------------- product detail */

  const pdp = document.querySelector('[data-product]');
  if (pdp) {
    const variants = JSON.parse(document.getElementById('variantData')?.textContent || '[]');
    const selection = {};
    for (const axis of ['texture', 'length', 'colour']) {
      const first = pdp.querySelector(`[data-axis-value="${axis}"][aria-pressed="true"]`);
      if (first) selection[axis] = first.dataset.value;
    }

    const priceDisplay = pdp.querySelector('[data-price-display]');
    const unitDisplay = pdp.querySelector('[data-unit-display]');
    const variantInput = pdp.querySelector('[data-variant-input]');
    const stockNote = pdp.querySelector('[data-stock-note]');
    const addButton = pdp.querySelector('[data-add-form] button[type="submit"]');
    const addLabel = pdp.querySelector('[data-add-label]');
    const qtyInput = pdp.querySelector('[data-add-form] input[name="quantity"]');
    const unitSuffix = unitDisplay?.textContent.trim().split('·')[0].trim() || '';

    const matches = (variant) =>
      ['texture', 'length', 'colour'].every(
        (axis) => !selection[axis] || variant[axis] === selection[axis],
      );

    /** Can this axis value be chosen, given what else is already picked? */
    function valueIsPossible(axis, value) {
      return variants.some((variant) => {
        if (variant[axis] !== value) return false;
        return ['texture', 'length', 'colour'].every(
          (other) => other === axis || !selection[other] || variant[other] === selection[other],
        );
      });
    }

    function currentVariant() {
      return variants.find(matches) || null;
    }

    function refresh() {
      const variant = currentVariant();

      // Grey out combinations that do not exist, and price each length.
      for (const button of pdp.querySelectorAll('[data-axis-value]')) {
        const axis = button.dataset.axisValue;
        const value = button.dataset.value;
        button.disabled = !valueIsPossible(axis, value);
        button.setAttribute('aria-pressed', String(selection[axis] === value));
      }
      for (const priceEl of pdp.querySelectorAll('[data-length-price]')) {
        const length = priceEl.dataset.lengthPrice;
        const candidate = variants.find(
          (entry) =>
            entry.length === length &&
            (!selection.texture || entry.texture === selection.texture) &&
            (!selection.colour || entry.colour === selection.colour),
        );
        priceEl.textContent = candidate ? money(candidate.price) : '';
      }
      for (const chosen of pdp.querySelectorAll('[data-axis-chosen]')) {
        chosen.textContent = selection[chosen.dataset.axisChosen] || '';
      }

      if (!variant) {
        stockNote.textContent = 'That combination is not available.';
        stockNote.className = 'stock-note is-out';
        if (addButton) addButton.disabled = true;
        return;
      }

      if (variantInput) variantInput.value = variant.id;
      const quantity = Math.max(1, Number(qtyInput?.value || 1));
      if (priceDisplay) {
        priceDisplay.textContent = quantity > 1 ? money(variant.price * quantity) : money(variant.price);
      }
      if (unitDisplay) {
        unitDisplay.textContent = [unitSuffix, variant.length].filter(Boolean).join(' · ');
      }

      if (variant.stock <= 0) {
        stockNote.textContent = 'Out of stock — ask us on WhatsApp about the next restock.';
        stockNote.className = 'stock-note is-out';
        if (addButton) addButton.disabled = true;
        if (addLabel) addLabel.textContent = 'Out of stock';
      } else {
        stockNote.textContent =
          variant.stock <= 3 ? `Only ${variant.stock} left in store` : 'In stock, ready to go';
        stockNote.className = `stock-note ${variant.stock <= 3 ? 'is-low' : 'is-in'}`;
        if (addButton) addButton.disabled = false;
        if (addLabel) {
          addLabel.textContent =
            quantity > 1 ? `Add to bag · ${money(variant.price * quantity)}` : 'Add to bag';
        }
      }
    }

    pdp.addEventListener('click', (event) => {
      const option = event.target.closest('[data-axis-value]');
      if (option && !option.disabled) {
        selection[option.dataset.axisValue] = option.dataset.value;
        refresh();
        return;
      }

      const step = event.target.closest('[data-qty]');
      if (step && qtyInput) {
        const next = Math.min(99, Math.max(1, Number(qtyInput.value || 1) + Number(step.dataset.qty)));
        qtyInput.value = next;
        refresh();
        return;
      }

      const thumb = event.target.closest('[data-gallery-thumb]');
      if (thumb) {
        const main = document.getElementById('galleryMain');
        if (main) main.src = thumb.dataset.galleryThumb;
        for (const other of pdp.querySelectorAll('[data-gallery-thumb]')) {
          other.setAttribute('aria-current', String(other === thumb));
        }
      }
    });

    qtyInput?.addEventListener('input', refresh);

    pdp.querySelector('[data-add-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const variant = currentVariant();
      if (!variant) return;
      addButton.disabled = true;
      try {
        const result = await addToBag({
          variantId: variant.id,
          quantity: Number(qtyInput?.value || 1),
        });
        setBagCount(result.count);
        toast(result.message || 'Added to your bag');
      } catch (error) {
        toast(error.message);
      } finally {
        addButton.disabled = false;
        refresh();
      }
    });

    refresh();
  }

  /* ------------------------------------------------------------ pack guide */

  const packGuide = document.querySelector('[data-pack-guide]');
  if (packGuide) {
    const countEl = packGuide.querySelector('[data-pack-count]');
    const detailEl = packGuide.querySelector('[data-pack-detail]');
    const linkEl = packGuide.querySelector('[data-pack-link]');

    function showPacks(button) {
      for (const other of packGuide.querySelectorAll('.pack-option')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
      const min = Number(button.dataset.packsMin);
      const max = Number(button.dataset.packsMax);
      const price = Number(button.dataset.price);
      countEl.textContent = min === max ? min : `${min}–${max}`;
      detailEl.textContent =
        min === max
          ? `${button.dataset.name} · about ${money(price * min)}`
          : `${button.dataset.name} · about ${money(price * min)} to ${money(price * max)}`;
      linkEl.href = `/p/${button.dataset.slug}`;
    }

    packGuide.addEventListener('click', (event) => {
      const button = event.target.closest('.pack-option');
      if (button) showPacks(button);
    });

    const first = packGuide.querySelector('.pack-option');
    if (first) showPacks(first);
  }

  /* -------------------------------------------------------------- checkout */

  const fulfilment = document.querySelector('[data-fulfilment]');
  if (fulfilment) {
    const deliveryFields = document.querySelector('[data-delivery-fields]');
    const parishSelect = document.querySelector('[data-parish]');
    const addressInput = document.getElementById('address');
    const deliveryLabel = document.querySelector('[data-delivery-label]');
    const deliveryAmount = document.querySelector('[data-delivery-amount]');
    const totalAmount = document.querySelector('[data-total-amount]');

    async function quote() {
      const isPickup = fulfilment.querySelector('input:checked')?.value === 'pickup';
      deliveryFields.style.display = isPickup ? 'none' : '';
      if (addressInput) addressInput.required = !isPickup;

      if (isPickup) {
        deliveryLabel.textContent = 'Pickup';
        deliveryAmount.textContent = 'Free';
      }

      const response = await fetch(
        `/api/delivery-quote?parish=${encodeURIComponent(parishSelect?.value || '')}&pickup=${isPickup}`,
      );
      if (!response.ok) return;
      const data = await response.json();
      if (!isPickup) {
        deliveryLabel.textContent = data.special ? 'Delivery (special rate)' : 'Delivery';
        deliveryAmount.textContent = data.deliveryCents === null ? '—' : money(data.deliveryCents);
      }
      totalAmount.textContent = money(data.totalCents);
    }

    fulfilment.addEventListener('change', quote);
    parishSelect?.addEventListener('change', quote);
    quote();
  }
})();
