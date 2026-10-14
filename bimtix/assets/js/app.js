/* BimTix front-end (design build). Sample data lives in data.js.
   Nothing here takes payment or sends messages: purchases are stored in the
   browser only so the flow can be reviewed end to end. */
(async function () {
  "use strict";

  const D = window.BIMTIX;
  const ICONS = "assets/img/icons.svg";
  const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icon = (name, cls) => `<svg class="i ${cls || ""}" aria-hidden="true"><use href="${ICONS}#${name}"></use></svg>`;
  const findEvent = (id) => D.events.find((e) => e.id === id);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function dateParts(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      m: MON[dt.getMonth()],
      d: String(dt.getDate()).padStart(2, "0"),
      y: dt.getFullYear(),
      long: `${DAY[dt.getDay()]} ${dt.getDate()} ${MONTH[dt.getMonth()]} ${dt.getFullYear()}`,
      short: `${DAY[dt.getDay()].slice(0, 3)} ${dt.getDate()} ${MONTH[dt.getMonth()].slice(0, 3)} ${dt.getFullYear()}`
    };
  }

  function money(n, cents) {
    const digits = cents ? 2 : 0;
    const text = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${n < 0 && text.replace(/[0.,]/g, "") ? "−" : ""}BBD $${text}`;
  }

  /* Storage that never throws (private windows, blocked storage). */
  function box(kind) {
    try { return kind === "session" ? window.sessionStorage : window.localStorage; } catch (e) { return null; }
  }
  function load(key, fallback, kind) {
    try { const v = box(kind) && box(kind).getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function store(key, value, kind) {
    try { const b = box(kind); if (b) b.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }

  /* Toast */
  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl.timer);
    toastEl.timer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* Header menu (phones) */
  const navToggle = $("[data-nav-toggle]");
  const nav = $("[data-nav]");
  if (navToggle && nav) {
    const close = () => { navToggle.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); };
    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      navToggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("open", open);
    });
    nav.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }

  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* Buttons for features that come with the full build */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-demo]");
    if (b) { e.preventDefault(); toast(b.getAttribute("data-demo")); }
  });

  /* Saved events (hearts): in the person's account when signed in on the server, else on this device. */
  const SAVED = "bimtix-saved";
  let accountSaved = null;
  const savedIds = () => accountSaved || load(SAVED, []);
  function paintSave(btn, on) {
    const ev = findEvent(btn.getAttribute("data-save"));
    const title = ev ? ev.title : "event";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? `Remove ${title} from saved events` : `Save ${title}`);
  }
  function initSaves(root) {
    const ids = savedIds();
    $$("[data-save]", root).forEach((b) => paintSave(b, ids.includes(b.getAttribute("data-save"))));
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-save]");
    if (!btn) return;
    const id = btn.getAttribute("data-save");
    const ids = savedIds();
    const on = !ids.includes(id);
    const next = on ? ids.concat(id) : ids.filter((x) => x !== id);
    $$(`[data-save="${id}"]`).forEach((b) => paintSave(b, on));
    if (accountSaved) {
      accountSaved = next;
      window.BTAPI.call("me/saved", { method: "POST", body: JSON.stringify({ events: [id], saved: on }) })
        .then((r) => { accountSaved = r.saved; })
        .catch(() => toast("Couldn’t save that. Please try again."));
      toast(on ? "Saved to your account" : "Removed from saved events");
    } else {
      store(SAVED, next);
      const onServer = document.documentElement.hasAttribute("data-server");
      toast(on ? (onServer ? "Saved on this device. Sign in to keep it in your account" : "Saved to your account") : "Removed from saved events");
    }
  });

  /* ---------- Home: event list, search and filters ---------- */
  function eventCard(ev) {
    const p = dateParts(ev.date);
    return `<article class="event-card">
      <div class="photo-slot${ev.flyer ? " has-flyer" : ""}">
        ${ev.flyer
          ? `<img class="flyer" src="${esc(ev.flyer)}" alt="${esc(ev.title)} flyer" loading="lazy">`
          : `<img class="mark" src="assets/img/bimtix-icon.png" alt=""><span class="photo-label">Promoter flyer</span>`}
        <div class="date-badge"><span class="m">${p.m}</span><span class="d">${p.d}</span><span class="y">${p.y}</span></div>
        <button type="button" class="save-btn" data-save="${ev.id}" aria-pressed="false" aria-label="Save ${esc(ev.title)}">${icon("heart")}</button>
      </div>
      <div class="event-body">
        <h3>${esc(ev.title)}</h3>
        <span>${esc(ev.sub)}</span>
        <span class="event-meta">${icon("pin", "i-sm")}${esc(ev.area)}</span>
        <span class="tags">${ev.tags.map(esc).join("  |  ")}</span>
        <span class="spacer"></span>
        <a class="btn btn-outline btn-pill" href="event.html?id=${ev.id}">Get tickets<span class="sr-only"> for ${esc(ev.title)}</span></a>
      </div>
    </article>`;
  }

  /* Shared helpers for owner.js (set before waiting on the server) */
  window.BTX = { money, dateParts, toast, esc, icon, load, store, plural };
  // owner.js waits on this: resolves once the server and the signed-in person are checked.
  let markReady;
  window.BTX.ready = new Promise((resolve) => { markReady = resolve; });

  /* Real server (laptop / bimtix.com) or sample data (design preview)? */
  const API = window.BTAPI || null;
  const root = document.documentElement;
  const page = location.pathname.split("/").pop() || "index.html";
  const ownerPage = /^owner[\w-]*\.html$/.test(page);
  const promoterPage = /^promoter(-[\w-]+)?\.html$/.test(page);   // not promoters.html (the public page)
  if (API && API.onServer && (ownerPage || promoterPage || $("[data-account]"))) root.setAttribute("data-gate", "");
  const live = API ? await API.ready : false;
  if (live) {
    root.setAttribute("data-server", "");
    // The "design preview" note is only true on the preview. Pages with their own note change it later.
    const bar = $(".preview-bar");
    if (bar && D.live.mode === "laptop") bar.textContent = "Laptop test server · real data · test payments only";
    else if (bar) bar.hidden = true;
  }

  /* Who is signed in (real server only). Owners count only once they've passed their 2-step check. */
  const me = live ? await API.me() : { user: null };
  const signedIn = me.user && !me.twoStepNeeded ? me.user : null;
  if (live) {
    if (ownerPage && !(signedIn && signedIn.isOwner)) {
      location.replace(signedIn ? "account.html" : `signin.html?next=${page}`);
      return;
    }
    if (($("[data-account]") || promoterPage) && !signedIn) {
      location.replace(`signin.html?next=${encodeURIComponent(page + location.search)}`);
      return;
    }
    if (promoterPage && $(".dash-side")) {
      $(".dash-side").insertAdjacentHTML("beforeend", `<button type="button" class="side-item" data-signout>${icon("lock")}Sign out</button>`);
    }
    const acct = $(".signin-link[href='signin.html'], .signin-link[href='account.html']");
    if (acct && signedIn) {
      acct.href = "account.html";
      acct.setAttribute("aria-label", "My account");
      $("span", acct).textContent = signedIn.firstName || "Account";
    }
    if (signedIn && !ownerPage) {
      // Hearts live in the account; anything saved on this device before signing in moves there.
      try {
        accountSaved = (await API.call("me/saved")).saved;
        const local = load(SAVED, []).filter((id) => !accountSaved.includes(id));
        if (local.length) accountSaved = (await API.call("me/saved", { method: "POST", body: JSON.stringify({ events: local, saved: true }) })).saved;
        store(SAVED, []);
      } catch (err) { accountSaved = null; }
    }
    if (ownerPage) {
      const hello = $("[data-owner-hello]");
      if (hello) hello.textContent = `Hello, ${signedIn.firstName || "owner"}`;
      $(".dash-side").insertAdjacentHTML("beforeend", `<button type="button" class="side-item" data-signout>${icon("lock")}Sign out</button>`);
    }
  }
  if (!(live && promoterPage)) root.removeAttribute("data-gate");   // promoter.js shows its pages once their real data is in
  markReady({ live, signedIn });

  /* Sign out (real server). On the design preview the link just goes home. */
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-signout]");
    if (!b || !live) return;
    e.preventDefault();
    try { await API.call("auth/signout", { method: "POST", body: "{}" }); } catch (err) { /* the session ends anyway */ }
    location.href = "index.html";
  });

  /* Home: the next few events */
  const teaser = $("[data-event-teaser]");
  if (teaser) {
    const n = Number(teaser.getAttribute("data-limit")) || 3;
    teaser.innerHTML = D.events.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, n).map(eventCard).join("");
    initSaves(teaser);
  }

  /* Events page: search and filters (read from and written to the URL) */
  const grid = $("[data-event-grid]");
  if (grid) {
    const params = new URLSearchParams(location.search);
    const state = {
      cat: params.get("cat") || "all",
      q: params.get("q") || "",
      where: params.get("where") || "all",
      when: params.get("when") || "all"
    };
    if (!$$("[data-cat]").some((b) => b.getAttribute("data-cat") === state.cat)) state.cat = "all";
    const syncUrl = () => {
      const p = new URLSearchParams();
      if (state.q.trim()) p.set("q", state.q.trim());
      if (state.where !== "all") p.set("where", state.where);
      if (state.when !== "all") p.set("when", state.when);
      if (state.cat !== "all") p.set("cat", state.cat);
      const qs = p.toString();
      history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
    };
    const render = () => {
      const q = state.q.trim().toLowerCase();
      const list = D.events.filter((ev) => {
        if (state.cat !== "all" && !ev.cats.includes(state.cat)) return false;
        if (state.where !== "all" && ev.region !== state.where) return false;
        if (state.when !== "all" && ev.date.slice(0, 4) !== state.when) return false;
        if (q && ![ev.title, ev.sub, ev.area, ev.tags.join(" ")].join(" ").toLowerCase().includes(q)) return false;
        return true;
      });
      grid.innerHTML = list.length
        ? list.map(eventCard).join("")
        : `<p class="empty-state">No ${live ? "" : "sample "}events match that. Try another search or category.</p>`;
      initSaves(grid);
      const count = $("[data-event-count]");
      if (count) count.textContent = plural(list.length, "event");
      syncUrl();
    };

    $$("[data-cat]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-cat") === state.cat));
      b.addEventListener("click", () => {
        state.cat = b.getAttribute("data-cat");
        $$("[data-cat]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        render();
      });
    });

    const form = $("[data-search]");
    if (form) {
      form.q.value = state.q;
      form.where.value = state.where;
      form.when.value = state.when;
      if (form.where.value !== state.where) { state.where = "all"; form.where.value = "all"; }
      if (form.when.value !== state.when) { state.when = "all"; form.when.value = "all"; }
      const read = () => { state.q = form.q.value; state.where = form.where.value; state.when = form.when.value; };
      form.addEventListener("submit", (e) => { e.preventDefault(); read(); render(); });
      form.q.addEventListener("input", () => { read(); render(); });
      form.where.addEventListener("change", () => { read(); render(); });
      form.when.addEventListener("change", () => { read(); render(); });
    }
    render();
  }
  initSaves(document);

  /* ---------- Event page ---------- */
  const eventPage = $("[data-event-page]");
  if (eventPage) {
    const ev = findEvent(new URLSearchParams(location.search).get("id")) || findEvent("island-riddim");
    const p = dateParts(ev.date);
    document.title = `${ev.title} — BimTix`;
    $("[data-ev-kicker]").textContent = ev.tags.join(" · ");
    $("[data-ev-title]").textContent = ev.title;
    $("[data-ev-sub]").textContent = ev.sub;
    $("[data-ev-date]").textContent = p.long;
    $("[data-ev-time]").textContent = `${ev.time} start`;
    $("[data-ev-venue]").textContent = ev.venue;
    $("[data-ev-area]").textContent = ev.area;
    $("[data-ev-directions]").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.area);
    $("[data-ev-badge]").innerHTML = `<span class="m">${p.m}</span><span class="d">${p.d}</span><span class="y">${p.y}</span>`;
    if (ev.description || (ev.lineup && ev.lineup.length)) {
      $("[data-ev-about]").hidden = false;
      $("[data-ev-description]").textContent = ev.description || "";
      if (ev.lineup && ev.lineup.length) {
        $("[data-ev-lineup]").hidden = false;
        $("[data-ev-lineup] span").textContent = ev.lineup.join(" · ");
      }
    }
    if (ev.flyer) {
      const slot = $(".event-photo");
      $$(".mark, .photo-label", slot).forEach((x) => x.remove());
      slot.classList.add("has-flyer");
      slot.insertAdjacentHTML("afterbegin", `<img class="flyer" src="${esc(ev.flyer)}" alt="${esc(ev.title)} flyer">`);
    }
    $$("[data-save]", eventPage).forEach((b) => b.setAttribute("data-save", ev.id));
    initSaves(eventPage);

    const qty = {};
    ev.tiers.forEach((t) => { qty[t.id] = 0; });
    const firstOpen = ev.tiers.find((t) => !t.soldOut);
    if (firstOpen) qty[firstOpen.id] = 2;

    const tiersEl = $("[data-tiers]");
    const count = () => Object.values(qty).reduce((s, n) => s + n, 0);
    const subtotal = () => ev.tiers.reduce((s, t) => s + qty[t.id] * t.price, 0);
    const cont = $("[data-continue]");

    const MAX = ev.maxPerOrder || D.maxPerOrder;
    const renderTiers = () => {
      const full = count() >= MAX;
      tiersEl.innerHTML = ev.tiers.map((t) => {
        if (t.soldOut) {
          return `<div class="tier is-sold"><div><div class="tier-name">${esc(t.name)}</div><span class="muted small">${money(t.price)}</span></div><strong class="muted small">Sold out</strong></div>`;
        }
        const q = qty[t.id];
        return `<div class="tier${q > 0 ? " is-active" : ""}">
          <div><div class="tier-name">${t.vip ? `<span class="vip-badge">${esc(t.name)}</span>` : esc(t.name)}</div><span class="muted small">${money(t.price)} · ${esc(t.note || "")}</span></div>
          <div class="stepper">
            <button type="button" class="minus" data-step="${t.id}" data-delta="-1" aria-label="Remove one ${esc(t.name)} ticket"${q === 0 ? " disabled" : ""}>−</button>
            <span class="qty" aria-label="${plural(q, esc(t.name) + " ticket")}">${q}</span>
            <button type="button" class="plus" data-step="${t.id}" data-delta="1" aria-label="Add one ${esc(t.name)} ticket"${full ? " disabled" : ""}>+</button>
          </div>
        </div>`;
      }).join("");
      const n = count();
      const sub = subtotal();
      const feeRate = D.live && typeof D.live.feeRate === "number" ? D.live.feeRate : D.feeRate;
      $("[data-count]").textContent = plural(n, "ticket");
      $("[data-total]").textContent = money(sub);
      $("[data-fee-note]").textContent = n ? `+ ${money(Math.round(sub * feeRate * 100) / 100, true)} service fee` : "";
      $("[data-points]").textContent = `${(sub * D.pointsPerDollar).toLocaleString("en-US")} points`;
      cont.setAttribute("aria-disabled", n === 0 ? "true" : "false");
      if (n === 0) cont.setAttribute("tabindex", "-1"); else cont.removeAttribute("tabindex");
    };

    tiersEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]");
      if (!b || b.disabled) return;
      const id = b.getAttribute("data-step");
      const delta = Number(b.getAttribute("data-delta"));
      if (delta > 0 && count() >= MAX) { toast(`Up to ${MAX} tickets per person`); return; }
      qty[id] = Math.max(0, qty[id] + delta);
      renderTiers();
      $("[data-live]").textContent = `${plural(count(), "ticket")}, ${money(subtotal())}`;
      const again = tiersEl.querySelector(`[data-step="${id}"][data-delta="${delta}"]`);
      if (again && !again.disabled) again.focus();
    });
    renderTiers();

    cont.addEventListener("click", async (e) => {
      if (count() === 0) { e.preventDefault(); return; }
      if (!live) { store("bimtix-order", { eventId: ev.id, qty }, "session"); return; }
      // Real server: hold the tickets for this buyer before going to checkout.
      e.preventDefault();
      cont.setAttribute("aria-disabled", "true");
      try {
        const items = Object.entries(qty).filter(([, q]) => q > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
        const hold = await API.call("checkout/hold", {
          method: "POST",
          body: JSON.stringify({ event: ev.id, items })
        });
        store("bimtix-hold", hold, "session");
        location.href = "checkout.html";
      } catch (err) {
        toast(err.message);
        cont.setAttribute("aria-disabled", "false");
      }
    });

    $("[data-share]").addEventListener("click", () => {
      const url = location.href;
      if (navigator.share) navigator.share({ title: `${ev.title} — BimTix`, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast(url));
      else toast(url);
    });
  }

  /* ---------- Checkout (real server) ---------- */
  function liveCheckout() {
    const hold = load("bimtix-hold", null, "session");
    if (!hold) { location.replace("events.html"); return; }
    $("[data-co-back]").href = `event.html?id=${hold.event.id}`;
    $("[data-co-title]").textContent = hold.event.title;
    $("[data-co-date]").textContent = dateParts(hold.event.date).short;
    $("[data-co-lines]").innerHTML = hold.lines.map((l) =>
      `<div class="row muted"><span>${esc(l.name)} × ${l.quantity}</span><span>${money((l.quantity * l.unitPriceCents) / 100, true)}</span></div>`
    ).join("");
    $("[data-co-sub]").textContent = money(hold.subtotalCents / 100, true);
    $("[data-co-fee]").textContent = money(hold.feeCents / 100, true);
    const payBtn = $("[data-co-pay]");
    const paintTotals = () => {
      const discount = hold.discountCents || 0;
      $("[data-co-discount-row]").hidden = !discount;
      $("[data-co-discount]").textContent = `−${money(discount / 100, true)}`;
      const total = money(hold.totalCents / 100, true);
      $("[data-co-total]").textContent = total;
      payBtn.textContent = `Pay ${total}`;
    };
    paintTotals();

    // Rewards points: members with enough points can take whole blocks off the tickets.
    const points = $("[data-co-usepoints]");
    const redeem = (D.live && D.live.redeem) || { points: 1000, valueCents: 1000 };
    const balance = (me.points || 0) + (hold.pointsUsed || 0);
    const blocks = Math.min(Math.floor(balance / redeem.points), Math.floor(hold.subtotalCents / redeem.valueCents));
    points.closest("label").hidden = !signedIn || blocks < 1;
    points.checked = Boolean(hold.pointsUsed);
    if (blocks >= 1) {
      $("[data-co-points-label]").textContent = `Use ${(blocks * redeem.points).toLocaleString("en-US")} points`;
      $("[data-co-points-save]").textContent = `Save ${money((blocks * redeem.valueCents) / 100)} · you have ${balance.toLocaleString("en-US")}`;
    }
    points.addEventListener("change", async () => {
      points.disabled = true;
      try {
        const r = await API.call("checkout/points", { method: "POST", body: JSON.stringify({ orderId: hold.orderId, use: points.checked }) });
        Object.assign(hold, { discountCents: r.discountCents, totalCents: r.totalCents, pointsUsed: r.pointsUsed });
        store("bimtix-hold", hold, "session");
        paintTotals();
      } catch (err) {
        points.checked = !points.checked;
        toast(err.message);
      } finally {
        points.disabled = false;
      }
    });

    // Signed in: show who's buying. Everyone confirms the details the tickets are sent to.
    const member = $("[data-co-member]");
    member.hidden = !signedIn;
    if (signedIn) {
      $(".avatar", member).textContent = signedIn.initials;
      $("strong", member).textContent = signedIn.name || signedIn.email || signedIn.phone;
      $(".muted", member).textContent = `${(me.points || 0).toLocaleString("en-US")} Rewards points`;
      $("a", member).addEventListener("click", async (e) => {
        e.preventDefault();
        try { await API.call("auth/signout", { method: "POST", body: "{}" }); } catch (err) { /* signed out anyway */ }
        location.href = `event.html?id=${hold.event.id}`;
      });
    }
    $("[data-co-details]").hidden = false;
    $("[data-co-wa-label]").textContent = "WhatsApp";
    $("[data-co-email-label]").textContent = "Email";
    const field = { name: $("#co-name"), email: $("#co-email"), phone: $("#co-phone") };
    const errBox = $("[data-co-error]");
    // Signed in: only their own account details (never another buyer's remembered on this device).
    const prefill = signedIn
      ? { name: signedIn.name, email: signedIn.email, phone: signedIn.phone }
      : load("bimtix-buyer", null) || {};
    Object.keys(field).forEach((k) => { field[k].value = prefill[k] || ""; });
    const fail = (input, message) => {
      Object.values(field).forEach((x) => x.removeAttribute("aria-invalid"));
      errBox.textContent = message;
      if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    };

    const timer = $("[data-co-timer]");
    const ends = new Date(hold.holdExpiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, ends - Date.now());
      timer.textContent = `Your tickets are held for ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
      if (left === 0) {
        clearInterval(every);
        payBtn.disabled = true;
        timer.textContent = "Time’s up — these tickets were released. Go back to choose again.";
      }
    };
    const every = setInterval(tick, 1000);
    tick();

    $("[data-co-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      fail(null, "");
      const name = field.name.value.trim();
      const email = field.email.value.trim();
      const phone = field.phone.value.trim();
      if (name.length < 2) { fail(field.name, "Please enter your full name."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fail(field.email, "Please enter a valid email address."); return; }
      if ($("[data-co-wa]").checked && !phone) { fail(field.phone, "Add your WhatsApp number, or untick WhatsApp."); return; }
      if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) { fail(field.phone, "That WhatsApp number doesn’t look right."); return; }
      if (!D.live || !D.live.testPayments) { toast("Payments aren’t connected yet"); return; }
      payBtn.disabled = true;
      payBtn.textContent = "Paying…";
      try {
        await API.call("checkout/details", {
          method: "POST",
          body: JSON.stringify({ orderId: hold.orderId, orderToken: hold.orderToken, name, email, ...(phone ? { phone } : {}) })
        });
        if (!signedIn) store("bimtix-buyer", { name, email, phone });   // guests: remembered for next time on this device
        const res = await API.call("checkout/test-pay", {
          method: "POST",
          body: JSON.stringify({ orderId: hold.orderId, orderToken: hold.orderToken })
        });
        clearInterval(every);
        const delivery = { whatsapp: $("[data-co-wa]").checked, email: $("[data-co-email]").checked };
        store("bimtix-ticket", { live: true, event: hold.event, tickets: res.tickets, delivery }, "session");
        const mine = load("bimtix-mine", []).filter((m) => m.orderId !== hold.orderId);
        mine.unshift({ eventId: hold.event.id, qty: res.tickets.length, tier: hold.lines.map((l) => l.name).join(" + "), orderId: hold.orderId, orderToken: hold.orderToken });
        store("bimtix-mine", mine.slice(0, 10));
        try { sessionStorage.removeItem("bimtix-hold"); } catch (err) { /* ignore */ }
        location.href = "ticket.html";
      } catch (err) {
        fail(null, err.message);
        toast(err.message);
        payBtn.disabled = false;
        paintTotals();
      }
    });
  }

  /* ---------- Checkout (sample data) ---------- */
  const checkout = $("[data-checkout]");
  if (checkout && live) {
    liveCheckout();
  } else if (checkout) {
    let order = load("bimtix-order", null, "session");
    if (!order || !findEvent(order.eventId)) order = { eventId: "island-riddim", qty: { general: 2 } };
    const ev = findEvent(order.eventId);
    const lines = ev.tiers.filter((t) => (order.qty[t.id] || 0) > 0).map((t) => ({ name: t.name, qty: order.qty[t.id], price: t.price }));
    const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const fee = Math.round(sub * D.feeRate * 100) / 100;

    $("[data-co-back]").href = `event.html?id=${ev.id}`;
    $("[data-co-title]").textContent = ev.title;
    $("[data-co-date]").textContent = dateParts(ev.date).short;
    $("[data-co-lines]").innerHTML = lines.map((l) => `<div class="row muted"><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.qty * l.price, true)}</span></div>`).join("");
    $("[data-co-sub]").textContent = money(sub, true);
    $("[data-co-fee]").textContent = money(fee, true);
    $("[data-co-points-label]").textContent = `Use ${D.redeem.points.toLocaleString("en-US")} points`;
    $("[data-co-points-save]").textContent = `Save ${money(D.redeem.value)} · you have ${D.member.points.toLocaleString("en-US")}`;
    $("[data-co-discount]").textContent = "−" + money(D.redeem.value, true);

    const usePoints = $("[data-co-usepoints]");
    const total = () => sub + fee - (usePoints.checked ? D.redeem.value : 0);
    const update = () => {
      $("[data-co-discount-row]").hidden = !usePoints.checked;
      const t = money(total(), true);
      $("[data-co-total]").textContent = t;
      $("[data-co-pay]").textContent = `Pay ${t}`;
    };
    usePoints.addEventListener("change", update);
    update();

    $("[data-co-form]").addEventListener("submit", (e) => {
      e.preventDefault();
      const whatsapp = $("[data-co-wa]").checked;
      const email = $("[data-co-email]").checked;
      const code = "BTX-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      const n = lines.reduce((s, l) => s + l.qty, 0);
      store("bimtix-ticket", { eventId: ev.id, lines, code, delivery: { whatsapp, email } }, "session");
      const mine = load("bimtix-mine", []).filter((m) => m.eventId !== ev.id);
      mine.unshift({ eventId: ev.id, qty: n, tier: lines.map((l) => l.name).join(" + ") });
      store("bimtix-mine", mine.slice(0, 5));
      location.href = "ticket.html";
    });
  }

  /* ---------- Refund request (real server, tickets I bought) ---------- */
  function wireRefund(slug, refund) {
    if (!refund) return;
    const open = $("[data-refund-open]");
    const form = $("[data-refund-form]");
    const pending = $("[data-refund-pending]");
    const err = $("[data-refund-error]");
    pending.hidden = !refund.pending;
    open.hidden = !refund.canAsk;
    $("[data-refund-note]").textContent =
      `You’d get ${money(refund.amount, true)} back: what you paid for the tickets (the BimTix service fee isn’t refunded). ` +
      "Your tickets keep working until BimTix approves it; then they’re cancelled.";
    open.addEventListener("click", () => { form.hidden = false; open.hidden = true; $("#refund-reason").focus(); });
    $("[data-refund-cancel]").addEventListener("click", () => { form.hidden = true; open.hidden = false; err.textContent = ""; open.focus(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const reason = $("#refund-reason").value.trim();
      if (reason.length < 3) { err.textContent = "Tell us briefly why you need a refund."; $("#refund-reason").focus(); return; }
      const btn = $("button[type='submit']", form);
      btn.disabled = true;
      try {
        const r = await API.call("me/refunds", { method: "POST", body: JSON.stringify({ event: slug, reason }) });
        toast(r.message);
        form.hidden = true;
        pending.hidden = false;
      } catch (e2) {
        err.textContent = e2.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Ticket (real server: signed codes, real QR) ---------- */
  async function liveTickets() {
    const params = new URLSearchParams(location.search);
    const orderId = params.get("order");
    const eventSlug = params.get("event");
    let data = null;
    let fromSession = false;
    if (eventSlug && signedIn) {
      // Every ticket I hold for this event, bought or sent to me.
      const r = await API.call(`me/tickets/${encodeURIComponent(eventSlug)}`);
      data = { live: true, event: r.event, tickets: r.tickets, delivery: null };
      wireRefund(eventSlug, r.refund);
    } else if (orderId) {
      // Guests open their order with its secret token; signed-in buyers don't need one.
      const entry = load("bimtix-mine", []).find((m) => m.orderId === orderId);
      if (!entry && !signedIn) return false;
      const o = await API.call(`orders/${orderId}`, { headers: entry ? { "x-order-token": entry.orderToken } : {} });
      data = { live: true, event: o.event, tickets: o.tickets, delivery: null };
    } else {
      data = load("bimtix-ticket", null, "session");
      fromSession = true;
    }
    if (!data || !data.live || !data.tickets || !data.tickets.length) return false;

    const ev = data.event;
    const sent = [];
    if (data.delivery && data.delivery.whatsapp) sent.push("WhatsApp");
    if (data.delivery && data.delivery.email) sent.push("email");
    $("[data-tk-sent]").textContent = data.delivery
      ? `Payment received — you’re going.${sent.length ? " Sent to " + sent.join(" and ") + "." : ""}`
      : "Your tickets — show this at the gate.";
    $("[data-tk-title]").textContent = ev.title;
    $("[data-tk-when]").textContent = `${dateParts(ev.date).short} · ${ev.time}`;
    $("[data-tk-where]").textContent = ev.venue ? `${ev.venue}, ${(ev.area || "").split(",")[0]}` : (findEvent(ev.id) || {}).area || "";
    $("[data-tk-directions]").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.area || (findEvent(ev.id) || {}).area || "Barbados");

    const qrBox = $(".qr");
    let idx = 0;
    const show = () => {
      const t = data.tickets[idx];
      const shortCode = `BTX-${t.id.slice(0, 8).toUpperCase()}`;
      qrBox.innerHTML = t.qrSvg;
      const svg = qrBox.querySelector("svg");
      if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `QR code for ticket ${shortCode}, scanned at the gate`); }
      $("[data-tk-count]").textContent = `Ticket ${idx + 1} of ${data.tickets.length}`;
      $("[data-tk-type]").textContent = t.type;
      $("[data-tk-name]").textContent = t.holderName || "—";
      $("[data-tk-code]").textContent = t.used ? `${shortCode} · used at the gate` : shortCode;
      $("[data-tk-article]").setAttribute("aria-label", `Ticket ${idx + 1} of ${data.tickets.length}, ${ev.title}`);
      $("[data-tk-prev]").disabled = idx === 0;
      $("[data-tk-next]").disabled = idx === data.tickets.length - 1;
      $("[data-tk-pager]").hidden = data.tickets.length < 2;
    };
    $("[data-tk-prev]").addEventListener("click", () => { if (idx > 0) { idx -= 1; show(); } });
    $("[data-tk-next]").addEventListener("click", () => { if (idx < data.tickets.length - 1) { idx += 1; show(); } });
    show();

    // Send the ticket on screen to a friend (signed-in holders only).
    const sendBtn = $("[data-tk-send]");
    const form = $("[data-send-form]");
    const sendErr = $("[data-send-error]");
    sendBtn.removeAttribute("data-demo");
    sendBtn.addEventListener("click", () => {
      if (!signedIn) { toast("Sign in with the phone or email you bought with to send tickets"); return; }
      form.hidden = false;
      $("#send-name").focus();
    });
    $("[data-send-cancel]").addEventListener("click", () => { form.hidden = true; sendErr.textContent = ""; sendBtn.focus(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      sendErr.textContent = "";
      const name = $("#send-name").value.trim();
      const to = $("#send-to").value.trim();
      if (name.length < 2) { sendErr.textContent = "Enter their full name: it goes on the ticket."; $("#send-name").focus(); return; }
      if (!to.includes("@") && to.replace(/\D/g, "").length < 7) { sendErr.textContent = "Enter their mobile number or email."; $("#send-to").focus(); return; }
      const btn = $("button[type='submit']", form);
      btn.disabled = true;
      try {
        const r = await API.call(`tickets/${data.tickets[idx].id}/transfer`, { method: "POST", body: JSON.stringify({ name, to }) });
        toast(r.message);
        form.reset();
        form.hidden = true;
        data.tickets.splice(idx, 1);
        if (fromSession) store("bimtix-ticket", data, "session");
        if (!data.tickets.length) { setTimeout(() => { location.href = "account.html"; }, 1800); return; }
        idx = Math.min(idx, data.tickets.length - 1);
        show();
      } catch (err) {
        sendErr.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
    return true;
  }

  /* ---------- Ticket (sample data) ---------- */
  const ticketPage = $("[data-ticket-page]");
  const shownLive = ticketPage && live ? await liveTickets().catch(() => false) : false;
  if (ticketPage && live && !shownLive) {
    // Never show a sample ticket on the real site.
    location.replace(signedIn ? "account.html" : "signin.html?next=account.html");
    return;
  }
  if (ticketPage && !shownLive) {
    const params = new URLSearchParams(location.search);
    let t = null;
    if (params.get("event") && findEvent(params.get("event"))) {
      const n = Math.max(1, Math.min(D.maxPerOrder, Number(params.get("qty")) || 1));
      t = { eventId: params.get("event"), lines: [{ name: params.get("tier") || "General", qty: n }], code: "BTX-" + params.get("event").slice(0, 4).toUpperCase(), delivery: null };
    } else {
      t = load("bimtix-ticket", null, "session");
    }
    if (!t || !findEvent(t.eventId)) {
      t = { eventId: "island-riddim", lines: [{ name: "General", qty: 2 }], code: "BTX-7Q4K", delivery: { whatsapp: true, email: true } };
    }
    const ev = findEvent(t.eventId);
    const list = [];
    t.lines.forEach((l) => { for (let i = 0; i < l.qty; i += 1) list.push(l.name); });
    let idx = 0;

    const sent = [];
    if (t.delivery && t.delivery.whatsapp) sent.push("WhatsApp");
    if (t.delivery && t.delivery.email) sent.push("email");
    $("[data-tk-sent]").textContent = t.delivery
      ? `Payment received — you’re going.${sent.length ? " Sent to " + sent.join(" and ") + "." : ""}`
      : "Your tickets — show this at the gate.";
    $("[data-tk-title]").textContent = ev.title;
    $("[data-tk-when]").textContent = `${dateParts(ev.date).short} · ${ev.time}`;
    $("[data-tk-where]").textContent = `${ev.venue}, ${ev.area.split(",")[0]}`;
    $("[data-tk-name]").textContent = D.member.name;
    $("[data-tk-directions]").href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.area);

    const canvas = $("[data-tk-qr]");
    const drawQR = (text) => {
      const N = 21;
      const S = 9;
      canvas.width = N * S;
      canvas.height = N * S;
      const g = canvas.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = "#080808";
      let seed = 0;
      for (let i = 0; i < text.length; i += 1) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
      const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return (seed >>> 16) / 65536; };
      const finders = [[0, 0], [0, N - 7], [N - 7, 0]];
      for (let r = 0; r < N; r += 1) {
        for (let c = 0; c < N; c += 1) {
          const f = finders.find(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);
          let on;
          if (f) {
            const y = r - f[0];
            const x = c - f[1];
            on = y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4);
          } else if ((r < 8 && c < 8) || (r < 8 && c > N - 9) || (r > N - 9 && c < 8)) {
            on = false;
          } else {
            on = rnd() > 0.5;
          }
          if (on) g.fillRect(c * S, r * S, S, S);
        }
      }
    };

    const show = () => {
      const code = `${t.code}-${String(idx + 1).padStart(2, "0")}`;
      $("[data-tk-count]").textContent = `Ticket ${idx + 1} of ${list.length}`;
      $("[data-tk-type]").textContent = list[idx];
      $("[data-tk-code]").textContent = code;
      canvas.setAttribute("aria-label", `QR code for ticket ${code}, scanned at the gate`);
      $("[data-tk-article]").setAttribute("aria-label", `Ticket ${idx + 1} of ${list.length}, ${ev.title}`);
      $("[data-tk-prev]").disabled = idx === 0;
      $("[data-tk-next]").disabled = idx === list.length - 1;
      drawQR(code);
    };
    $("[data-tk-pager]").hidden = list.length < 2;
    $("[data-tk-prev]").addEventListener("click", () => { if (idx > 0) { idx -= 1; show(); } });
    $("[data-tk-next]").addEventListener("click", () => { if (idx < list.length - 1) { idx += 1; show(); } });
    show();
  }

  /* ---------- Sign in (real server) ---------- */
  async function liveSignin() {
    const nextParam = new URLSearchParams(location.search).get("next");
    const next = nextParam && /^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/.test(nextParam) ? nextParam : null;
    const goOn = (user) => { location.href = next || (user && user.isOwner ? "owner.html" : "account.html"); };
    if (signedIn) { goOn(signedIn); return; }

    const phoneForm = $("[data-phone-form]");
    const emailForm = $("[data-email-form]");
    const codeForm = $("[data-code-form]");
    const nameForm = $("[data-name-form]");
    const twoForm = $("[data-twostep-form]");
    const forms = [phoneForm, emailForm, codeForm, nameForm, twoForm];
    const errBox = $("[data-signin-error]");
    const bar = $(".preview-bar");
    if (bar && D.live.mode === "laptop") bar.textContent = "Laptop test server · sign-in codes show on this page instead of being sent";
    $$("[data-social]").forEach((a) => { a.hidden = true; });   // Apple and Google sign-in come later

    const clearError = () => { errBox.textContent = ""; $$("[aria-invalid]", signin).forEach((x) => x.removeAttribute("aria-invalid")); };
    const fail = (input, message) => {
      errBox.textContent = message;
      if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    };
    const showOnly = (form) => {
      forms.forEach((f) => { f.hidden = f !== form; });
      $$("[data-signin-alt]").forEach((x) => { x.hidden = !(form === phoneForm || form === emailForm); });
      clearError();
      const first = $("input:not([type='radio'])", form);
      if (first) first.focus();
    };
    const busy = async (form, fn) => {
      const btn = $("button[type='submit']", form);
      btn.disabled = true;
      try { await fn(); } finally { btn.disabled = false; }
    };

    let sent = null;   // the code we're waiting for: { challengeId, channel, to, from }
    async function sendCode(channel, to, fromForm, input) {
      try {
        const res = await API.call("auth/start", { method: "POST", body: JSON.stringify({ channel, to }) });
        sent = { challengeId: res.challengeId, channel, to, from: fromForm };
        const how = channel === "whatsapp" ? " on WhatsApp" : channel === "sms" ? " by text" : "";
        $("[data-code-to]").textContent = `${res.sentTo}${how}`;
        const dev = $("[data-dev-code]");
        dev.hidden = !res.devCode;
        dev.textContent = res.devCode ? `Laptop test: your code is ${res.devCode}` : "";
        $("[data-change-number]").textContent = channel === "email" ? "Use a different email" : "Use a different number";
        codeForm.code.value = "";
        showOnly(codeForm);
        const resend = $("[data-resend]");
        resend.hidden = false;
        resend.disabled = true;
        setTimeout(() => { resend.disabled = false; }, 30_000);
      } catch (err) {
        fail(input, err.message);
      }
    }

    phoneForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      const typed = phoneForm.phone.value.trim();
      if (typed.replace(/\D/g, "").length < 7) { fail(phoneForm.phone, "Enter your mobile number."); return; }
      const to = typed.startsWith("+") ? typed : `${phoneForm.cc.value} ${typed}`;
      const channel = $("input[name='channel']:checked", phoneForm).value;
      busy(phoneForm, () => sendCode(channel, to, phoneForm, phoneForm.phone));
    });
    emailForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      const to = emailForm.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { fail(emailForm.email, "Please enter a valid email address."); return; }
      busy(emailForm, () => sendCode("email", to, emailForm, emailForm.email));
    });
    $("[data-use-email]").addEventListener("click", (e) => { e.preventDefault(); showOnly(emailForm); });
    $("[data-use-phone]").addEventListener("click", () => showOnly(phoneForm));
    $("[data-change-number]").addEventListener("click", () => showOnly(sent ? sent.from : phoneForm));
    $("[data-resend]").addEventListener("click", () => {
      if (!sent) return;
      busy(codeForm, () => sendCode(sent.channel, sent.to, sent.from, codeForm.code));
    });

    async function showTwoStep(setUp) {
      showOnly(twoForm);
      if (setUp) return;
      $("[data-twostep-intro]").textContent =
        "First time on this account: install Microsoft Authenticator or Google Authenticator on your phone, scan this code with it, then type the 6 digits it shows.";
      try {
        const s = await API.call("auth/2step/setup", { method: "POST", body: "{}" });
        const qr = $("[data-twostep-qr]");
        qr.innerHTML = s.qrSvg;
        const svg = $("svg", qr);
        if (svg) { svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "QR code to add BimTix to your authenticator app"); }
        $("[data-twostep-key]").textContent = s.manualKey.replace(/(.{4})/g, "$1 ").trim();
        $("[data-twostep-setup]").hidden = false;
      } catch (err) {
        fail(null, err.message);
      }
    }

    codeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      const code = codeForm.code.value.replace(/\D/g, "");
      if (code.length !== 6) { fail(codeForm.code, "Enter the 6-digit code."); return; }
      busy(codeForm, async () => {
        try {
          const res = await API.call("auth/verify", { method: "POST", body: JSON.stringify({ challengeId: sent.challengeId, code }) });
          if (res.claimedOrders) store("bimtix-welcome", res.claimedOrders, "session");
          if (res.twoStepNeeded) { await showTwoStep(res.twoStepSetUp); return; }
          if (res.needsName) { showOnly(nameForm); return; }
          goOn(res.user);
        } catch (err) {
          codeForm.code.value = "";
          fail(codeForm.code, err.message);
        }
      });
    });

    nameForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      const name = nameForm.name.value.trim();
      if (name.length < 2) { fail(nameForm.name, "Please enter your full name."); return; }
      busy(nameForm, async () => {
        try {
          const res = await API.call("me", { method: "POST", body: JSON.stringify({ name }) });
          goOn(res.user);
        } catch (err) {
          fail(nameForm.name, err.message);
        }
      });
    });

    twoForm.addEventListener("submit", (e) => {
      e.preventDefault();
      clearError();
      const code = twoForm.code.value.replace(/\D/g, "");
      if (code.length !== 6) { fail(twoForm.code, "Enter the 6-digit code from your authenticator app."); return; }
      busy(twoForm, async () => {
        try {
          await API.call("auth/2step/verify", { method: "POST", body: JSON.stringify({ code }) });
          location.href = next || "owner.html";
        } catch (err) {
          twoForm.code.value = "";
          if (err.code === "too_many_tries" || err.code === "signed_out" || err.status === 401) {
            showOnly(phoneForm);
            fail(null, err.message);
          } else {
            fail(twoForm.code, err.message);
          }
        }
      });
    });

    // An owner who signed in but hasn't finished the 2-step check yet.
    if (me.user && me.twoStepNeeded) await showTwoStep(me.twoStepSetUp);
  }

  /* ---------- Sign in (design preview: any 6-digit code) ---------- */
  const signin = $("[data-signin]");
  if (signin && live) {
    await liveSignin();
  } else if (signin) {
    const phoneForm = $("[data-phone-form]");
    const codeForm = $("[data-code-form]");
    phoneForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const digits = phoneForm.phone.value.replace(/\D/g, "");
      if (digits.length < 7) {
        phoneForm.phone.setAttribute("aria-invalid", "true");
        toast("Enter your mobile number");
        phoneForm.phone.focus();
        return;
      }
      phoneForm.phone.removeAttribute("aria-invalid");
      $("[data-code-to]").textContent = `${phoneForm.cc.value} ${phoneForm.phone.value}`;
      phoneForm.hidden = true;
      codeForm.hidden = false;
      codeForm.code.focus();
    });
    $("[data-change-number]").addEventListener("click", () => {
      codeForm.hidden = true;
      phoneForm.hidden = false;
      phoneForm.phone.focus();
    });
    codeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (codeForm.code.value.replace(/\D/g, "").length !== 6) {
        codeForm.code.setAttribute("aria-invalid", "true");
        toast("Enter the 6-digit code (any 6 digits in this preview)");
        codeForm.code.focus();
        return;
      }
      location.href = "account.html";
    });
  }

  /* ---------- Account ---------- */
  const account = $("[data-account]");
  if (account) {
    const listEl = $("[data-acct-list]");
    const upcoming = () => {
      const mine = load("bimtix-mine", []).map((m) => ({ ev: findEvent(m.eventId), qty: m.qty, tier: m.tier, isNew: true, orderId: m.orderId }));
      const seen = new Set(mine.map((m) => m.ev && m.ev.id));
      const sample = D.upcoming.filter((u) => !seen.has(u.eventId)).map((u) => ({ ev: findEvent(u.eventId), qty: u.qty, tier: u.tier }));
      return mine.concat(sample).filter((x) => x.ev).sort((a, b) => a.ev.date.localeCompare(b.ev.date));
    };
    const row = (iso, title, meta, action) => {
      const p = dateParts(iso);
      return `<div class="ticket-row"><div class="mini-date"><span class="m">${p.m}</span><span class="d">${p.d}</span></div><div class="grow"><strong>${esc(title)}</strong><span class="muted small">${esc(meta)}</span></div>${action}</div>`;
    };
    const viewBtn = (href, title) => `<a class="btn btn-outline btn-sm" href="${href}">View<span class="sr-only"> ${esc(title)} tickets</span></a>`;

    // Real server: this person's own tickets and points.
    let liveOrders = null;
    if (live) {
      const bar = $(".preview-bar");
      if (bar) bar.hidden = true;
      $(".account-head .avatar").textContent = signedIn.initials;
      $(".account-head h1").textContent = signedIn.firstName ? `Hi, ${signedIn.firstName}` : "Hi there";
      $(".account-head .muted").textContent = `Member since ${signedIn.memberSince}`;
      $(".points-value").innerHTML = `${(me.points || 0).toLocaleString("en-US")} <small>points</small>`;
      $(".points-card .tier-badge").textContent = "Member";
      $(".points-card .progress").hidden = true;
      $(".points-card .row.small span").textContent = `${D.pointsPerDollar} point for every BBD $1 you spend`;
      $(".settings .val").textContent = "None saved";

      // Their data: download it, or delete the account.
      const dl = $("[data-my-data]");
      dl.removeAttribute("data-demo");
      dl.addEventListener("click", () => { location.href = "api/me/export"; });
      const delOpen = $("[data-delete-open]");
      const delForm = $("[data-delete-form]");
      const delErr = $("[data-delete-error]");
      delOpen.removeAttribute("data-demo");
      delOpen.addEventListener("click", () => { delForm.hidden = false; $("#delete-confirm").focus(); });
      $("[data-delete-cancel]").addEventListener("click", () => { delForm.hidden = true; delErr.textContent = ""; delOpen.focus(); });
      delForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        delErr.textContent = "";
        if ($("#delete-confirm").value.trim() !== "DELETE") { delErr.textContent = "Type DELETE in capitals to confirm."; $("#delete-confirm").focus(); return; }
        const btn = $("button[type='submit']", delForm);
        btn.disabled = true;
        try {
          await API.call("me/delete", { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) });
          store("bimtix-mine", []);
          location.href = "index.html";
        } catch (err) {
          delErr.textContent = err.message;
          btn.disabled = false;
        }
      });
      liveOrders = (await API.call("me/tickets")).events;
      const welcome = load("bimtix-welcome", 0, "session");
      if (welcome) {
        toast(`We found ${plural(welcome, "earlier order")} and added ${welcome === 1 ? "it" : "them"} to your account`);
        try { sessionStorage.removeItem("bimtix-welcome"); } catch (err) { /* ignore */ }
      }
    }
    const fromFriend = (o) => (o.received ? " · includes tickets sent to you" : "");
    const upcomingRows = () => (live
      ? liveOrders.filter((o) => !o.past).map((o) => row(o.event.date, o.event.title,
        `${dateParts(o.event.date).short} · ${o.event.time} · ${plural(o.tickets, "ticket")} · ${o.types}${fromFriend(o)}`, viewBtn(`ticket.html?event=${o.event.id}`, o.event.title)))
      : upcoming().map((it) => row(
        it.ev.date,
        it.isNew ? `${it.ev.title} · new` : it.ev.title,
        `${dateParts(it.ev.date).short} · ${plural(it.qty, "ticket")} · ${it.tier}`,
        viewBtn(it.orderId ? `ticket.html?order=${it.orderId}` : `ticket.html?event=${it.ev.id}&amp;qty=${it.qty}&amp;tier=${encodeURIComponent(it.tier)}`, it.ev.title)
      )));
    const pastRows = () => (live
      ? liveOrders.filter((o) => o.past).map((o) => row(o.event.date, o.event.title,
        `${dateParts(o.event.date).short} · ${plural(o.tickets, "ticket")} · ${o.types}`, viewBtn(`ticket.html?event=${o.event.id}`, o.event.title)))
      : D.past.map((p) => row(
        p.date,
        p.title,
        `${dateParts(p.date).short} · ${plural(p.qty, "ticket")} · +${p.points} pts`,
        `<button type="button" class="btn btn-ghost btn-sm" data-demo="Thanks — ratings help promoters improve.">Rate<span class="sr-only"> ${esc(p.title)}</span></button>`
      )));
    const tabs = $$("[data-tab]");
    const show = (which) => {
      tabs.forEach((t) => {
        const on = t.getAttribute("data-tab") === which;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      $("[data-acct-panel]").setAttribute("aria-labelledby", `tab-${which}`);
      const rows = which === "upcoming" ? upcomingRows() : pastRows();
      listEl.innerHTML = rows.length
        ? rows.join("")
        : `<p class="empty-state">${which === "upcoming" ? `No upcoming tickets yet. <a class="gold" href="events.html">Find an event</a>` : "No past events yet."}</p>`;
    };
    tabs.forEach((t) => t.addEventListener("click", () => show(t.getAttribute("data-tab"))));
    $("[data-tablist]").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      next.click();
    });
    $("[data-count-upcoming]").textContent = upcomingRows().length;
    $("[data-count-past]").textContent = pastRows().length;
    show("upcoming");

    let ids = savedIds();
    if (!ids.length && !live) ids = ["first-light", "sea-and-sound"];
    const saved = ids.map(findEvent).filter(Boolean);
    $("[data-acct-saved]").innerHTML = saved.length
      ? saved.map((ev) => `<a class="chip" href="event.html?id=${ev.id}">${icon("heart", "i-sm")}${esc(ev.title)}</a>`).join("")
      : `<span class="muted small">Tap the heart on any event to save it here.</span>`;
  }
})();
