/* BimTix front-end (design build). Sample data lives in data.js.
   Nothing here takes payment or sends messages: purchases are stored in the
   browser only so the flow can be reviewed end to end. */
(function () {
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
    return "BBD $" + n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
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

  /* Saved events (hearts) */
  const SAVED = "bimtix-saved";
  const savedIds = () => load(SAVED, []);
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
    store(SAVED, on ? ids.concat(id) : ids.filter((x) => x !== id));
    $$(`[data-save="${id}"]`).forEach((b) => paintSave(b, on));
    toast(on ? "Saved to your account" : "Removed from saved events");
  });

  /* ---------- Home: event list, search and filters ---------- */
  function eventCard(ev) {
    const p = dateParts(ev.date);
    return `<article class="event-card">
      <div class="photo-slot">
        <img class="mark" src="assets/img/bimtix-icon.png" alt="">
        <span class="photo-label">Promoter flyer</span>
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
        : `<p class="empty-state">No sample events match that. Try another search or category.</p>`;
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

    const renderTiers = () => {
      const full = count() >= D.maxPerOrder;
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
      $("[data-count]").textContent = plural(n, "ticket");
      $("[data-total]").textContent = money(sub);
      $("[data-points]").textContent = `${(sub * D.pointsPerDollar).toLocaleString("en-US")} points`;
      cont.setAttribute("aria-disabled", n === 0 ? "true" : "false");
      if (n === 0) cont.setAttribute("tabindex", "-1"); else cont.removeAttribute("tabindex");
    };

    tiersEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-step]");
      if (!b || b.disabled) return;
      const id = b.getAttribute("data-step");
      const delta = Number(b.getAttribute("data-delta"));
      if (delta > 0 && count() >= D.maxPerOrder) { toast(`Up to ${D.maxPerOrder} tickets per person`); return; }
      qty[id] = Math.max(0, qty[id] + delta);
      renderTiers();
      $("[data-live]").textContent = `${plural(count(), "ticket")}, ${money(subtotal())}`;
      const again = tiersEl.querySelector(`[data-step="${id}"][data-delta="${delta}"]`);
      if (again && !again.disabled) again.focus();
    });
    renderTiers();

    cont.addEventListener("click", (e) => {
      if (count() === 0) { e.preventDefault(); return; }
      store("bimtix-order", { eventId: ev.id, qty }, "session");
    });

    $("[data-share]").addEventListener("click", () => {
      const url = location.href;
      if (navigator.share) navigator.share({ title: `${ev.title} — BimTix`, url }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast(url));
      else toast(url);
    });
  }

  /* ---------- Checkout ---------- */
  const checkout = $("[data-checkout]");
  if (checkout) {
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

  /* ---------- Ticket ---------- */
  const ticketPage = $("[data-ticket-page]");
  if (ticketPage) {
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

  /* ---------- Sign in ---------- */
  const signin = $("[data-signin]");
  if (signin) {
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
      const mine = load("bimtix-mine", []).map((m) => ({ ev: findEvent(m.eventId), qty: m.qty, tier: m.tier, isNew: true }));
      const seen = new Set(mine.map((m) => m.ev && m.ev.id));
      const sample = D.upcoming.filter((u) => !seen.has(u.eventId)).map((u) => ({ ev: findEvent(u.eventId), qty: u.qty, tier: u.tier }));
      return mine.concat(sample).filter((x) => x.ev).sort((a, b) => a.ev.date.localeCompare(b.ev.date));
    };
    const row = (iso, title, meta, action) => {
      const p = dateParts(iso);
      return `<div class="ticket-row"><div class="mini-date"><span class="m">${p.m}</span><span class="d">${p.d}</span></div><div class="grow"><strong>${esc(title)}</strong><span class="muted small">${esc(meta)}</span></div>${action}</div>`;
    };
    const tabs = $$("[data-tab]");
    const show = (which) => {
      tabs.forEach((t) => {
        const on = t.getAttribute("data-tab") === which;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      });
      $("[data-acct-panel]").setAttribute("aria-labelledby", `tab-${which}`);
      if (which === "upcoming") {
        listEl.innerHTML = upcoming().map((it) => row(
          it.ev.date,
          it.isNew ? `${it.ev.title} · new` : it.ev.title,
          `${dateParts(it.ev.date).short} · ${plural(it.qty, "ticket")} · ${it.tier}`,
          `<a class="btn btn-outline btn-sm" href="ticket.html?event=${it.ev.id}&amp;qty=${it.qty}&amp;tier=${encodeURIComponent(it.tier)}">View<span class="sr-only"> ${esc(it.ev.title)} tickets</span></a>`
        )).join("");
      } else {
        listEl.innerHTML = D.past.map((p) => row(
          p.date,
          p.title,
          `${dateParts(p.date).short} · ${plural(p.qty, "ticket")} · +${p.points} pts`,
          `<button type="button" class="btn btn-ghost btn-sm" data-demo="Thanks — ratings help promoters improve.">Rate<span class="sr-only"> ${esc(p.title)}</span></button>`
        )).join("");
      }
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
    $("[data-count-upcoming]").textContent = upcoming().length;
    $("[data-count-past]").textContent = D.past.length;
    show("upcoming");

    let ids = savedIds();
    if (!ids.length) ids = ["first-light", "sea-and-sound"];
    $("[data-acct-saved]").innerHTML = ids.map(findEvent).filter(Boolean)
      .map((ev) => `<a class="chip" href="event.html?id=${ev.id}">${icon("heart", "i-sm")}${esc(ev.title)}</a>`).join("");
  }

  /* Shared helpers for owner.js */
  window.BTX = { money, dateParts, toast, esc, icon, load, store, plural };
})();
