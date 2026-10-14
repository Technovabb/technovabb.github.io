/* BimTix promoter pages: apply, overview, one event's sales, new event.
   On the real server (laptop or bimtix.com) everything is the signed-in
   promoter's own data. On the design preview the pages show samples and
   the forms don't send anything. */
(async function () {
  "use strict";

  const D = window.BIMTIX;
  const X = window.BTX;
  if (!D || !X) return;
  const { money, dateParts, toast, esc, plural, load, store } = X;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const ctx = X.ready ? await X.ready : { live: false };
  const LIVE = Boolean(ctx.live);
  const API = window.BTAPI;

  const STATUS = {
    pending: ["review", "Waiting for BimTix approval"],
    on_sale: ["live", "On sale"],
    sales_closed: ["paid", "Sales closed"],
    ended: ["paid", "Ended"],
    rejected: ["hold", "Not approved"],
    cancelled: ["hold", "Cancelled"],
    draft: ["none", "Draft"]
  };
  const pill = (status) => {
    const [key, label] = STATUS[status] || ["none", status];
    return `<span class="pill pill-${key}">${esc(label)}</span>`;
  };
  const pad = (n) => String(n).padStart(2, "0");
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function ago(iso) {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`;
    return dateParts(localDay(new Date(iso))).short;
  }
  const flash = () => {
    const msg = load("bimtix-flash", null, "session");
    if (msg) { toast(msg); try { sessionStorage.removeItem("bimtix-flash"); } catch (e) { /* ignore */ } }
  };

  /* ---------- One event's sales (shared by the real and sample views) ---------- */
  function fillEvent(d) {
    const ev = d.event;
    document.title = `${ev.title} sales — BimTix promoter`;
    $("[data-pe-title]").textContent = ev.title;
    $("[data-pe-status]").textContent = (STATUS[ev.status] || [, ev.status])[1];
    $("[data-pe-when]").textContent = [`${dateParts(ev.date).short} · ${ev.time}`, [ev.venue, (ev.area || "").split(",")[0]].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    const pageLink = $("[data-pe-page]");
    pageLink.hidden = ev.status !== "on_sale";
    pageLink.href = `event.html?id=${encodeURIComponent(ev.id)}`;
    const editLink = $("[data-pe-edit]");
    if (editLink) {
      editLink.hidden = !(LIVE && ev.status === "pending");
      editLink.href = `promoter-event-new.html?edit=${encodeURIComponent(ev.id)}`;
    }

    const sold = d.types.reduce((s, t) => s + t.sold, 0);
    const cap = d.types.reduce((s, t) => s + t.quantity, 0);
    const pct = cap ? Math.round((sold / cap) * 100) : 0;
    $("[data-pe-sold]").innerHTML = `${sold.toLocaleString("en-US")} <small>/ ${cap.toLocaleString("en-US")}</small>`;
    $("[data-pe-meter]").style.width = `${pct}%`;
    $("[data-pe-sales]").textContent = money(d.types.reduce((s, t) => s + t.sold * t.price, 0));
    const today = d.days.length ? d.days[d.days.length - 1].tickets : 0;
    $("[data-pe-today]").textContent = today ? `+ ${plural(today, "ticket")} today` : "";
    if (d.payout) {
      $("[data-pe-payout]").textContent = money(d.payout.amount);
      $("[data-pe-payout-note]").textContent = d.payout.sentOn ? `Paid ${dateParts(d.payout.sentOn).short}` : d.payout.status;
    } else {
      $("[data-pe-payout]").textContent = "After the event";
      $("[data-pe-payout-note]").textContent = "To your bank once BimTix approves it";
    }
    $("[data-pe-in]").textContent = d.checkedIn.toLocaleString("en-US");

    const most = Math.max(1, ...d.days.map((x) => x.tickets));
    const bars = $("[data-pe-bars]");
    bars.innerHTML = d.days.map((x, i) =>
      `<span${i === d.days.length - 1 ? ' class="today"' : ""} style="height: ${Math.max(2, Math.round((x.tickets / most) * 100))}%"></span>`).join("");
    bars.setAttribute("aria-label", `Tickets sold per day over the last 14 days: ${d.days.map((x) => x.tickets).join(", ")}. Today ${today}.`);

    $("[data-pe-types]").innerHTML = d.types.map((t) => {
      const tp = t.quantity ? Math.round((t.sold / t.quantity) * 100) : 0;
      const full = t.sold >= t.quantity;
      return `<div class="stack" style="gap: 6px"><div class="row"><strong>${esc(t.name)} · ${money(t.price)}</strong><span class="muted small">${t.sold} / ${t.quantity}${full ? " · sold out" : ""}</span></div><div class="meter"><span class="${full ? "grey" : t.vip ? "blue" : ""}" style="width: ${tp}%"></span></div></div>`;
    }).join("");
    $("[data-pe-limit]").textContent = `${ev.maxPerOrder} per person`;

    // Flyer: shown, and changeable while the event waits for approval.
    const preview = $("[data-pe-flyer]");
    const showFlyer = (src) => { if (src) preview.innerHTML = `<img src="${esc(src)}" alt="${esc(ev.title)} flyer">`; };
    showFlyer(ev.flyer);
    const pick = $("[data-pe-flyer-pick]");
    const flyerErr = $("[data-pe-flyer-error]");
    if (LIVE && ev.status !== "pending") {
      pick.hidden = true;
      $("[data-pe-flyer-note]").textContent = ev.flyer
        ? "The event is approved, so the flyer is locked. Ask BimTix if it needs changing."
        : "The event is approved without a flyer. Ask BimTix to add one.";
    }
    $("[data-pe-flyer-file]").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      flyerErr.textContent = "";
      if (!file) return;
      if (!LIVE) { toast("Design preview: nothing is uploaded"); return; }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { flyerErr.textContent = "Choose a JPEG, PNG or WebP picture."; return; }
      if (file.size > 3 * 1024 * 1024) { flyerErr.textContent = "That picture is too big: the limit is 3 MB."; return; }
      pick.setAttribute("aria-disabled", "true");
      try {
        const r = await API.call(`promoter/events/${encodeURIComponent(ev.id)}/flyer`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        showFlyer(r.flyer);
        toast(r.message);
      } catch (err) {
        flyerErr.textContent = err.message;
      } finally {
        pick.removeAttribute("aria-disabled");
      }
    });

    $("[data-pe-orders]").innerHTML = d.orders.length
      ? d.orders.map((o) => `<tr><td class="gold">${esc(o.ref)}</td><td>${esc(o.buyer)}</td><td>${esc(o.tickets)}</td><td class="num">${money(o.amount, true)}</td><td class="num muted">${o.paidAt ? ago(o.paidAt) : esc(o.when || "")}</td></tr>`).join("")
      : `<tr><td colspan="5" class="muted" style="text-align: center; padding: 24px">No orders yet.</td></tr>`;
  }

  /* ---------- Overview (real server) ---------- */
  async function renderOverview() {
    const { promoter: p, events } = await API.call("promoter/events");
    const sum = (k) => events.reduce((s, e) => s + e[k], 0);
    const status = { verified: "Verified promoter", pending: "Waiting for BimTix to verify you", rejected: "Not approved: contact BimTix", suspended: "Paused: contact BimTix" }[p.status] || p.status;
    const checks = p.status === "pending"
      ? `<section class="panel panel-gold stack" style="gap: 8px" aria-labelledby="checks-title">
          <h2 id="checks-title">BimTix is checking your details</h2>
          <p class="muted" style="margin: 0">You can add events now. They go on sale once you’re verified and an owner approves each one.</p>
          <p class="small" style="margin: 0">${p.checks.map((c) => `${c.done ? "✓" : "✗"} ${esc(c.label)}`).join(" · ")}</p>
        </section>`
      : "";
    const rows = events.map((e) => `<tr>
        <td><a href="promoter-event.html?id=${encodeURIComponent(e.id)}"><strong>${esc(e.title)}</strong></a></td>
        <td>${dateParts(e.date).short}</td>
        <td>${pill(e.status)}</td>
        <td class="num">${e.sold.toLocaleString("en-US")} / ${e.capacity.toLocaleString("en-US")}</td>
        <td class="num">${e.sales ? money(e.sales) : "—"}</td>
        <td>${e.payout ? `${esc(e.payout)}${e.payoutAmount != null ? ` · ${money(e.payoutAmount)}` : ""}` : `<span class="muted small">After the event</span>`}</td>
        <td class="num"><a class="btn btn-ghost btn-sm" href="promoter-event.html?id=${encodeURIComponent(e.id)}">Sales<span class="sr-only"> for ${esc(e.title)}</span></a></td>
      </tr>`).join("");
    $("[data-promoter-overview]").innerHTML = `
      <div class="dash-title">
        <div><h1>${esc(p.name)}</h1><span class="muted">${esc(status)}</span></div>
        <div class="btn-row"><a class="btn btn-gold" href="promoter-event-new.html">New event</a></div>
      </div>
      ${checks}
      <div class="stats">
        <div class="stat"><span class="muted">Tickets sold</span><div class="stat-value">${sum("sold").toLocaleString("en-US")}</div><span class="small muted">All events</span></div>
        <div class="stat"><span class="muted">Ticket sales (your share)</span><div class="stat-value">${money(sum("sales"))}</div><span class="small muted">Before refunds</span></div>
        <div class="stat stat-blue"><span>On sale now</span><div class="stat-value">${events.filter((e) => e.status === "on_sale").length}</div><span class="small">${plural(events.length, "event")} in total</span></div>
        <div class="stat"><span class="muted">Waiting for approval</span><div class="stat-value">${events.filter((e) => e.status === "pending").length}</div><span class="small muted">BimTix checks every event</span></div>
      </div>
      <section class="panel panel-gold" aria-labelledby="events-title">
        <div class="row" style="margin-bottom: 8px"><h2 id="events-title">My events</h2></div>
        ${events.length
          ? `<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Status</th><th scope="col" class="num">Sold</th><th scope="col" class="num">Sales</th><th scope="col">Payout</th><th scope="col" class="num"><span class="sr-only">Details</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : `<p class="empty-state">No events yet. <a class="gold" href="promoter-event-new.html">Add your first event</a></p>`}
      </section>`;
  }

  /* ---------- New event form (and changing one that waits for approval) ---------- */
  function wireNewEvent(existing) {
    const form = $("[data-new-event]");
    const rowsEl = $("[data-type-rows]");
    const err = $("[data-new-error]");
    const start = $("#ev-start");
    const tomorrow = new Date(Date.now() + 86400_000);
    start.min = `${localDay(tomorrow)}T00:00`;
    let n = 0;
    const addRow = (preset) => {
      if ($$(".type-row", rowsEl).length >= 8) { toast("Up to 8 ticket types"); return; }
      n += 1;
      const p = preset || {};
      rowsEl.insertAdjacentHTML("beforeend", `<div class="type-row" data-type-row>
        <div class="field"><label for="tt-name-${n}">Ticket name</label><input class="input" id="tt-name-${n}" data-tt-name maxlength="40" value="${esc(p.name || "")}" placeholder="e.g. General"></div>
        <div class="field"><label for="tt-price-${n}">Price (BBD)</label><input class="input" id="tt-price-${n}" data-tt-price type="number" inputmode="decimal" min="0" step="0.01" value="${p.price ?? ""}"></div>
        <div class="field"><label for="tt-qty-${n}">How many</label><input class="input" id="tt-qty-${n}" data-tt-qty type="number" inputmode="numeric" min="1" step="1" value="${p.quantity ?? ""}"></div>
        <div class="field wide"><label for="tt-desc-${n}">What’s included <span class="muted small">(optional)</span></label><input class="input" id="tt-desc-${n}" data-tt-desc maxlength="80" value="${esc(p.description || "")}" placeholder="e.g. all-inclusive drinks"></div>
        <div class="type-row-foot"><label class="check-row"><input type="checkbox" data-tt-vip${p.vip ? " checked" : ""}>VIP ticket</label><button type="button" class="link-btn" data-remove-type>Remove</button></div>
      </div>`);
    };
    if (existing) {
      // Changing an event that waits for approval: start from what's saved.
      const ev = existing.event;
      document.title = `Change ${ev.title} — BimTix promoter`;
      $(".dash-title h1").textContent = "Change event";
      $(".dash-title .muted").textContent = "You can change anything until BimTix approves it. The link to the event stays the same.";
      $("#ev-title").value = ev.title;
      $("#ev-sub").value = ev.subtitle || "";
      $("#ev-about").value = ev.description || "";
      $("#ev-lineup").value = (ev.lineup || []).join(", ");
      start.value = ev.startsAt;
      $("#ev-max").value = ev.maxPerOrder;
      $("#ev-venue").value = ev.venue || "";
      $("#ev-area").value = ev.area || "";
      $("#ev-region").value = ev.region || "";
      $("#ev-tags").value = (ev.tags || []).join(", ");
      $$("[data-ev-cat]").forEach((c) => { c.checked = (ev.cats || []).includes(c.value); });
      existing.types.forEach((t) => addRow(t));
      $("button[type='submit']", form).textContent = "Save changes";
      $("a.btn-ghost", form).href = `promoter-event.html?id=${encodeURIComponent(ev.id)}`;
    } else {
      addRow({ name: "General" });
    }
    $("[data-add-type]").addEventListener("click", () => { addRow(); $$("[data-tt-name]", rowsEl).pop().focus(); });
    rowsEl.addEventListener("click", (e) => {
      const b = e.target.closest("[data-remove-type]");
      if (!b) return;
      if ($$(".type-row", rowsEl).length === 1) { toast("An event needs at least one ticket type"); return; }
      b.closest(".type-row").remove();
    });

    const fail = (input, message) => {
      $$("[aria-invalid]", form).forEach((x) => x.removeAttribute("aria-invalid"));
      err.textContent = message;
      if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      fail(null, "");
      const title = $("#ev-title").value.trim();
      if (title.length < 3) { fail($("#ev-title"), "Give the event a name."); return; }
      if (!start.value) { fail(start, "Choose the date and start time."); return; }
      const maxPerOrder = Number($("#ev-max").value);
      if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1 || maxPerOrder > 20) { fail($("#ev-max"), "Tickets per person must be between 1 and 20."); return; }
      const types = [];
      for (const row of $$("[data-type-row]", rowsEl)) {
        const name = $("[data-tt-name]", row);
        const price = $("[data-tt-price]", row);
        const qty = $("[data-tt-qty]", row);
        if (name.value.trim().length < 2) { fail(name, "Each ticket type needs a name."); return; }
        if (price.value === "" || Number(price.value) < 0) { fail(price, `Enter a price for ${name.value.trim()}.`); return; }
        if (!Number.isInteger(Number(qty.value)) || Number(qty.value) < 1) { fail(qty, `Enter how many ${name.value.trim()} tickets there are.`); return; }
        types.push({ name: name.value.trim(), price: Number(price.value), quantity: Number(qty.value), description: $("[data-tt-desc]", row).value.trim(), vip: $("[data-tt-vip]", row).checked });
      }
      if (!LIVE) { toast("Design preview: nothing is sent from this form"); return; }
      const btn = $("button[type='submit']", form);
      btn.disabled = true;
      try {
        const r = await API.call(existing ? `promoter/events/${encodeURIComponent(existing.event.id)}` : "promoter/events", {
          method: existing ? "PUT" : "POST",
          body: JSON.stringify({
            title, subtitle: $("#ev-sub").value.trim(), startsAt: start.value, maxPerOrder,
            venue: $("#ev-venue").value.trim(), area: $("#ev-area").value.trim(), types,
            region: $("#ev-region").value,
            cats: $$("[data-ev-cat]:checked").map((c) => c.value),
            tags: $("#ev-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
            description: $("#ev-about").value,
            lineup: $("#ev-lineup").value.split(",").map((a) => a.trim()).filter(Boolean)
          })
        });
        store("bimtix-flash", r.message, "session");
        location.href = existing ? `promoter-event.html?id=${encodeURIComponent(r.slug)}` : "promoter.html";
      } catch (e2) {
        fail(null, e2.message);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Apply ---------- */
  function wireApply() {
    const form = $("[data-apply-form]");
    const err = $("[data-apply-error]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.textContent = "";
      const name = $("#ap-name");
      if (name.value.trim().length < 2) { err.textContent = "Enter your business or brand name."; name.focus(); return; }
      if (!LIVE) { toast("Design preview: nothing is sent from this form"); return; }
      const btn = $("button[type='submit']", form);
      btn.disabled = true;
      try {
        const r = await API.call("promoter/apply", {
          method: "POST",
          body: JSON.stringify({
            name: name.value.trim(),
            hasBusinessRegistration: $("[data-ap-reg]").checked,
            hasOwnerId: $("[data-ap-id]").checked,
            hasBankDetails: $("[data-ap-bank]").checked
          })
        });
        store("bimtix-flash", r.message, "session");
        location.href = "promoter.html";
      } catch (e2) {
        err.textContent = e2.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------- Sample data for the design preview ---------- */
  const SAMPLE_EVENT = {
    event: { id: "island-riddim", title: "Island Riddim", status: "on_sale", venue: "[Venue name]", area: "Bridgetown, Barbados", date: "2027-02-17", time: "9:00 PM", maxPerOrder: 6 },
    types: [
      { name: "Early bird", price: 120, quantity: 100, sold: 100 },
      { name: "General", price: 150, quantity: 420, sold: 340 },
      { name: "VIP", price: 300, quantity: 80, sold: 72, vip: true }
    ],
    days: [15, 18, 14, 21, 19, 24, 22, 27, 25, 30, 33, 31, 38, 42].map((tickets) => ({ tickets })),
    checkedIn: 0,
    payout: null,
    orders: [
      { ref: "#BTX-4821", buyer: "Kerry B.", tickets: "2 × General", amount: 300, when: "2 min ago" },
      { ref: "#BTX-4820", buyer: "Marcus T.", tickets: "4 × General", amount: 600, when: "9 min ago" },
      { ref: "#BTX-4819", buyer: "Shanice W.", tickets: "2 × VIP", amount: 600, when: "21 min ago" }
    ]
  };

  /* ---------- Start ---------- */
  try {
    if (!LIVE) {
      if ($("[data-promoter-event]")) fillEvent(SAMPLE_EVENT);
      if ($("[data-promoter-new]")) wireNewEvent();
      if ($("[data-promoter-apply]")) wireApply();
      return;
    }
    const bar = $(".preview-bar");
    if (bar) bar.textContent = D.live.mode === "laptop" ? "Promoter area · real data from the laptop test server" : "Promoter area";
    const { promoter } = await API.call("promoter/me");
    if ($("[data-promoter-apply]")) {
      if (promoter) { location.replace("promoter.html"); return; }
      wireApply();
      return;
    }
    if (!promoter) { location.replace("promoter-apply.html"); return; }
    if ($("[data-promoter-overview]")) await renderOverview();
    if ($("[data-promoter-new]")) {
      const edit = new URLSearchParams(location.search).get("edit");
      let existing = null;
      if (edit) {
        try { existing = await API.call(`promoter/events/${encodeURIComponent(edit)}`); } catch (e) { existing = null; }
        if (!existing) { location.replace("promoter.html"); return; }
        if (existing.event.status !== "pending") {
          store("bimtix-flash", "That event is approved, so it can't be changed here. Ask BimTix.", "session");
          location.replace(`promoter-event.html?id=${encodeURIComponent(edit)}`);
          return;
        }
      }
      wireNewEvent(existing);
    }
    if ($("[data-promoter-event]")) {
      const slug = new URLSearchParams(location.search).get("id");
      let d = null;
      try { d = slug ? await API.call(`promoter/events/${encodeURIComponent(slug)}`) : null; } catch (e) { d = null; }
      if (!d) { location.replace("promoter.html"); return; }
      fillEvent(d);
    }
    flash();
  } catch (err) {
    toast(err.message || "Something went wrong");
  } finally {
    document.documentElement.removeAttribute("data-gate");
  }
})();
