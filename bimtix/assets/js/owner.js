/* BimTix owner dashboard.
   On the real server (laptop or bimtix.com) everything comes from the
   database and every decision is a real, recorded action.
   On the design preview it uses the sample data in data.js (BIMTIX.owner)
   and decisions are saved in this browser only.
   Rates are estimates until the payment provider is chosen. */
(async function () {
  "use strict";

  const D = window.BIMTIX;
  let O = D && D.owner;
  const X = window.BTX;
  if (!O || !X) return;
  const { money, dateParts, toast, esc, icon, load, store, plural } = X;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // Wait for app.js to check the server and who is signed in.
  const ctx = X.ready ? await X.ready : { live: false };
  const LIVE = Boolean(ctx.live);
  const API = window.BTAPI;
  if (LIVE) {
    O = await API.call("owner/dashboard");
    const bar = $(".preview-bar");
    if (bar) bar.textContent = D.live.mode === "laptop" ? "Owner dashboard · real data from the laptop test server" : "Owner dashboard";
    $$("[data-owner-reset]").forEach((b) => { b.hidden = true; });
  }

  /* ---------- Decisions ---------- */
  const KEY = "bimtix-owner";
  const blank = () => ({ events: {}, promoters: {}, payouts: {}, refunds: {}, flags: {} });
  let S = Object.assign(blank(), load(KEY, {}));
  const save = () => store(KEY, S);

  const promoter = (id) => O.promoters.find((p) => p.id === id) || { name: id };
  const eventById = (id) => O.events.find((e) => e.id === id);
  const publicEvent = (id) => D.events.some((e) => e.id === id);
  const byDate = (a, b) => a.date.localeCompare(b.date);
  function addDays(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d + n);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }

  /* ---------- Money for one event ----------
     Real server: actual service fees and points discounts (BimTix pays for
     points, not the promoter). Card processing is still an estimate. */
  function figures(ev) {
    const fees = ev.fees != null ? ev.fees : ev.sales * D.feeRate;
    const discounts = ev.discounts || 0;
    const processing = (ev.sales + fees - discounts) * O.processingRate;
    const payout = ev.payoutAmount != null ? ev.payoutAmount : ev.sales - ev.refunds;
    return { fees, discounts, netFees: fees - discounts, processing, payout, keep: fees - discounts - processing };
  }

  /* ---------- Statuses after decisions ---------- */
  function eventStatus(ev) {
    if (ev.status !== "pending") return ev.status;
    if (S.events[ev.id] === "approved") return "live";
    if (S.events[ev.id] === "rejected") return "rejected";
    return "pending";
  }
  const isHeldByFlag = (id) => O.flags.some((f) => f.event === id && S.flags[f.id] === "held");
  function payoutStatus(ev) {
    const st = eventStatus(ev);
    if (st === "pending" || st === "rejected") return { key: "none", label: "No sales yet" };
    if (isHeldByFlag(ev.id) || S.payouts[ev.id] === "held" || ev.payout === "hold") return { key: "hold", label: "On hold" };
    if (ev.payout === "paid") return { key: "paid", label: `Paid ${dateParts(ev.paidOn).short}` };
    if (ev.payout === "approved") return { key: "approved", label: "Approved · ready to send" };
    if (ev.payout === "review") {
      if (ev.myApproval) return { key: "approved", label: "You approved · needs the other owner" };
      return S.payouts[ev.id] === "approved" ? { key: "approved", label: "Approved · sending" } : { key: "review", label: "Needs approval" };
    }
    return { key: "scheduled", label: `After event · ${dateParts(addDays(ev.date, O.payoutDelayDays)).short}` };
  }
  const EVENT_LABEL = { live: "Live", pending: "Pending approval", ended: "Ended", rejected: "Rejected" };
  const pill = (key, label) => `<span class="pill pill-${key}">${esc(label)}</span>`;

  /* ---------- What needs the owner ---------- */
  function queue() {
    const items = [];
    O.events.filter((e) => e.payout === "review" && !e.myApproval && !S.payouts[e.id] && !isHeldByFlag(e.id)).forEach((e) => items.push({
      type: "Payout", title: `${money(figures(e).payout)} to ${promoter(e.promoter).name}`,
      sub: `${e.title} · ended ${dateParts(e.date).short}`, href: "owner-approvals.html#payouts"
    }));
    O.events.filter((e) => e.status === "pending" && !S.events[e.id]).forEach((e) => items.push({
      type: "New event", title: e.title, sub: `${promoter(e.promoter).name} · ${dateParts(e.date).short}`, href: "owner-approvals.html#events"
    }));
    O.promoters.filter((p) => p.status === "pending" && !S.promoters[p.id]).forEach((p) => items.push({
      type: "New promoter", title: p.name, sub: `Applied ${dateParts(p.submitted).short}`, href: "owner-approvals.html#promoters"
    }));
    O.refunds.filter((r) => !S.refunds[r.id]).forEach((r) => items.push({
      type: "Refund", title: `${money(r.amount)} · ${r.buyer}`, sub: `${eventById(r.event).title} · ${r.tickets}`, href: "owner-approvals.html#refunds"
    }));
    O.flags.filter((f) => !S.flags[f.id]).forEach((f) => items.push({
      type: "Flagged", title: `${f.level} risk · ${eventById(f.event).title}`, sub: f.text, href: "owner-approvals.html#flags"
    }));
    return items;
  }

  function paintBadges() {
    const n = queue().length;
    $$("[data-owner-count]").forEach((b) => { b.textContent = n; b.hidden = n === 0; });
  }

  /* ---------- Overview ---------- */
  function renderOverview() {
    if (!$("[data-owner-overview]")) return;
    const active = O.events.filter((e) => ["live", "ended"].includes(eventStatus(e)));
    const sales = active.reduce((s, e) => s + e.sales, 0);
    const sold = active.reduce((s, e) => s + e.sold, 0);
    const keep = active.reduce((s, e) => s + figures(e).keep, 0);
    const owed = active.filter((e) => e.payout !== "paid").reduce((s, e) => s + figures(e).payout, 0);
    const q = queue();
    $("[data-k-sales]").textContent = money(sales);
    $("[data-k-sold]").textContent = `${sold.toLocaleString("en-US")} tickets sold`;
    $("[data-k-keep]").textContent = money(Math.round(keep));
    $("[data-k-owed]").textContent = money(owed);
    $("[data-k-queue]").textContent = q.length;
    $("[data-k-queue-label]").textContent = q.length === 1 ? "item needs you" : "items need you";

    $("[data-attention]").innerHTML = q.length
      ? q.map((it) => `<a class="attention-item" href="${it.href}">${pill("review", it.type)}<span class="grow"><strong>${esc(it.title)}</strong><span class="muted small">${esc(it.sub)}</span></span>${icon("arrow-right", "i-sm")}</a>`).join("")
      : `<p class="empty-state">All caught up — nothing needs your approval.</p>`;

    const upcoming = O.events.filter((e) => ["review", "approved", "scheduled", "hold"].includes(payoutStatus(e).key)).sort(byDate).slice(0, 5);
    $("[data-upcoming-payouts]").innerHTML = upcoming.map((e) => {
      const ps = payoutStatus(e);
      return `<div class="payout-item">
        <div class="row"><strong>${esc(e.title)}</strong><strong>${money(figures(e).payout)}</strong></div>
        <div class="row"><span class="muted small">${esc(promoter(e.promoter).name)}</span>${pill(ps.key, ps.label)}</div>
      </div>`;
    }).join("");

    $("[data-live-events]").innerHTML = O.events.filter((e) => eventStatus(e) === "live").sort(byDate).map((e) => {
      const pct = e.capacity ? Math.round((e.sold / e.capacity) * 100) : 0;
      return `<div class="stack" style="gap: 6px"><div class="row"><strong>${esc(e.title)}</strong><span class="muted small">${e.sold} / ${e.capacity} · ${pct}%</span></div><div class="meter"><span style="width: ${pct}%"></span></div></div>`;
    }).join("");
  }

  /* ---------- Approvals ---------- */
  const DECIDE = {
    payouts: { yes: "approved", no: "held", yesLabel: "Approve payout", noLabel: "Hold", yesDone: "Approved", noDone: "On hold" },
    events: { yes: "approved", no: "rejected", yesLabel: "Approve and publish", noLabel: "Reject", yesDone: "Published", noDone: "Rejected" },
    promoters: { yes: "approved", no: "rejected", yesLabel: "Verify promoter", noLabel: "Reject", yesDone: "Verified", noDone: "Rejected" },
    refunds: { yes: "approved", no: "declined", yesLabel: "Approve refund", noLabel: "Decline", yesDone: "Refunded", noDone: "Declined" },
    flags: { yes: "cleared", no: "held", yesLabel: "Looks fine", noLabel: "Hold payouts", yesDone: "Cleared", noDone: "Payouts held" }
  };
  function decision(kind, id, item) {
    const c = DECIDE[kind];
    if (item && item.myApproval) return `<div class="decision">${pill("approved", "You approved · waiting for the other owner")}</div>`;
    const d = S[kind][id];
    if (d) {
      const ok = d === c.yes;
      return `<div class="decision">${pill(ok ? "approved" : "hold", ok ? c.yesDone : c.noDone)}<button type="button" class="btn btn-ghost btn-sm" data-undo="${kind}:${id}">Undo</button></div>`;
    }
    return `<div class="decision"><button type="button" class="btn btn-ghost btn-sm" data-decide="${kind}:${id}:${c.no}">${c.noLabel}</button><button type="button" class="btn btn-gold btn-sm" data-decide="${kind}:${id}:${c.yes}">${c.yesLabel}</button></div>`;
  }
  const card = (tag, title, lines, side, kind, id, item) => `<article class="approval">
      <div class="grow">${tag}<h3>${title}</h3>${lines.map((l) => `<p class="muted small">${l}</p>`).join("")}</div>
      <div class="approval-side">${side || ""}${decision(kind, id, item)}</div>
    </article>`;
  const none = (text) => `<p class="empty-state">${text}</p>`;

  function renderApprovals() {
    if (!$("[data-owner-approvals]")) return;

    $("[data-ap-payouts]").innerHTML = O.events.filter((e) => e.payout === "review").map((e) => {
      const f = figures(e);
      return card(pill("review", "Payout"), `${esc(e.title)} → ${esc(promoter(e.promoter).name)}`, [
        `Ended ${dateParts(e.date).short} · ${e.sold} tickets`,
        `Ticket sales ${money(e.sales)} − refunds ${money(e.refunds)}`,
        ...(LIVE ? [`Needs two owners · ${plural(e.approvals || 0, "approval")} so far`] : [])
      ], `<div class="amount">${money(f.payout)}</div>`, "payouts", e.id, e);
    }).join("") || none("No payouts waiting.");

    $("[data-ap-events]").innerHTML = O.events.filter((e) => e.status === "pending").map((e) => {
      const p = promoter(e.promoter);
      const newPromoter = p.status === "pending" && S.promoters[p.id] !== "approved";
      return card(pill("review", "New event"), esc(e.title), [
        `${esc(p.name)} · ${dateParts(e.date).long} · ${esc(e.venue)}`,
        `${e.capacity} capacity · ${esc(e.tiers)}`,
        `Submitted ${dateParts(e.submitted).short}${newPromoter ? ' · <strong class="gold">Promoter not verified yet</strong>' : ""}`,
        ...(LIVE && e.description ? [`About: “${esc(e.description.length > 280 ? `${e.description.slice(0, 280)}…` : e.description)}”`] : []),
        ...(LIVE && e.lineup && e.lineup.length ? [`Line-up: ${esc(e.lineup.join(" · "))}`] : []),
        ...(LIVE ? [e.flyer ? "Check the flyer before publishing:" : "No flyer yet (the event page will show a placeholder)."] : [])
      ], e.flyer ? `<a href="${esc(e.flyer)}" target="_blank" rel="noopener"><img class="approval-flyer" src="${esc(e.flyer)}" alt="${esc(e.title)} flyer (opens full size)"></a>` : "", "events", e.id);
    }).join("") || none("No new events waiting.");

    // Real server: tick each document once you've seen it (recorded). Preview: just shown.
    const checkLine = (p) => (LIVE
      ? `<span class="check-list">${p.checks.map((c) => `<label class="check-row"><input type="checkbox" data-pcheck="${p.id}:${c.key}"${c.done ? " checked" : ""}>${esc(c.label)}</label>`).join("")}</span>`
      : p.checks.map((c) => `${c.done ? "✓" : "✗"} ${esc(c.label)}`).join(" · "));
    $("[data-ap-promoters]").innerHTML = O.promoters.filter((p) => p.status === "pending").map((p) => card(
      pill("review", "New promoter"), esc(p.name),
      [`Applied ${dateParts(p.submitted).short}${LIVE ? " · tick each document once you’ve seen it" : ""}`, checkLine(p)].concat(
        p.checks.some((c) => !c.done) ? ['<strong class="gold">Payouts stay on hold until bank details are added.</strong>'] : []),
      "", "promoters", p.id
    )).join("") || none("No promoters waiting.");

    $("[data-ap-refunds]").innerHTML = O.refunds.map((r) => card(
      pill("review", "Refund"), `${esc(r.buyer)} · ${esc(eventById(r.event).title)}`,
      [`Order ${esc(r.order)} · ${esc(r.tickets)} · requested ${dateParts(r.requested).short}`, `Reason: “${esc(r.reason)}”`],
      `<div class="amount">${money(r.amount)}</div>`, "refunds", r.id
    )).join("") || none("No refund requests.");

    $("[data-ap-flags]").innerHTML = O.flags.map((f) => card(
      pill("hold", `${f.level} risk`), `Unusual buying · ${esc(eventById(f.event).title)}`,
      [esc(f.text), "Holding payouts stops this event’s payout until you clear it."],
      "", "flags", f.id
    )).join("") || none("Nothing flagged.");
  }

  /* ---------- Payouts ---------- */
  let payoutFilter = "all";
  function renderPayouts() {
    if (!$("[data-owner-payouts]")) return;
    const all = O.events.filter((e) => ["live", "ended"].includes(eventStatus(e))).sort(byDate);
    const groups = {
      all: () => true,
      review: (e) => payoutStatus(e).key === "review",
      upcoming: (e) => ["scheduled", "approved", "hold"].includes(payoutStatus(e).key),
      paid: (e) => payoutStatus(e).key === "paid"
    };
    const rows = all.filter(groups[payoutFilter]);
    const cash = (n) => (Math.round(n) < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
    const RAW = ["sold", "sales", "refunds"];
    const sum = (list, k) => list.reduce((s, e) => s + (RAW.includes(k) ? e[k] : figures(e)[k]), 0);

    const unpaid = all.filter((e) => payoutStatus(e).key !== "paid");
    $("[data-p-owed]").textContent = money(sum(unpaid, "payout"));
    $("[data-p-review]").textContent = money(sum(all.filter(groups.review), "payout"));
    $("[data-p-paid]").textContent = money(sum(all.filter(groups.paid), "payout"));
    $("[data-p-keep]").textContent = money(Math.round(sum(all, "keep")));

    $("[data-payout-rows]").innerHTML = rows.length ? rows.map((e) => {
      const f = figures(e);
      const ps = payoutStatus(e);
      let action = "";
      if (LIVE) {
        if (ps.key === "review") action = `<button type="button" class="btn btn-gold btn-sm" data-decide="payouts:${e.id}:approved">Approve</button>`;
        else if (e.payout === "approved") action = `<button type="button" class="btn btn-gold btn-sm" data-sent="${e.id}">Mark sent</button>`;
        else if (e.payout === "hold") action = `<button type="button" class="btn btn-ghost btn-sm" data-decide="payouts:${e.id}:release">Release hold</button>`;
      } else if (ps.key === "review") {
        action = `<button type="button" class="btn btn-gold btn-sm" data-decide="payouts:${e.id}:approved">Approve</button>`;
      } else if (ps.key === "approved" || S.payouts[e.id] === "held") {
        action = `<button type="button" class="btn btn-ghost btn-sm" data-undo="payouts:${e.id}">Undo</button>`;
      }
      return `<tr>
        <td><strong>${esc(e.title)}</strong><br><span class="muted small">${esc(promoter(e.promoter).name)}</span></td>
        <td>${dateParts(e.date).short}</td>
        <td class="num">${e.sold}</td>
        <td class="num">${cash(e.sales)}</td>
        <td class="num">${e.refunds ? "−" + cash(e.refunds) : "—"}</td>
        <td class="num"><strong>${cash(f.payout)}</strong></td>
        <td class="num">${cash(f.netFees)}</td>
        <td class="num">−${cash(f.processing)}</td>
        <td class="num">${cash(f.keep)}</td>
        <td>${pill(ps.key, ps.label)}</td>
        <td class="num">${action}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="11" class="muted" style="text-align: center; padding: 24px">Nothing in this view.</td></tr>`;

    $("[data-payout-foot]").innerHTML = rows.length ? `<tr>
      <th scope="row" colspan="2">Total · ${plural(rows.length, "event")}</th>
      <td class="num">${sum(rows, "sold").toLocaleString("en-US")}</td>
      <td class="num">${cash(sum(rows, "sales"))}</td>
      <td class="num">−${cash(sum(rows, "refunds"))}</td>
      <td class="num"><strong>${cash(sum(rows, "payout"))}</strong></td>
      <td class="num">${cash(sum(rows, "netFees"))}</td>
      <td class="num">−${cash(sum(rows, "processing"))}</td>
      <td class="num">${cash(sum(rows, "keep"))}</td>
      <td colspan="2"></td>
    </tr>` : "";
  }

  /* ---------- Events ---------- */
  let eventFilter = "all";
  function renderEvents() {
    if (!$("[data-owner-events]")) return;
    const list = O.events.slice().sort(byDate).filter((e) => eventFilter === "all" || eventStatus(e) === eventFilter);
    $$("[data-ev-filter]").forEach((b) => {
      const k = b.getAttribute("data-ev-filter");
      const n = k === "all" ? O.events.length : O.events.filter((e) => eventStatus(e) === k).length;
      b.querySelector("[data-n]").textContent = n;
    });
    $("[data-event-rows]").innerHTML = list.length ? list.map((e) => {
      const st = eventStatus(e);
      const pct = e.capacity ? Math.round((e.sold / e.capacity) * 100) : 0;
      let action = "";
      if (st === "pending") action = `<a class="btn btn-gold btn-sm" href="owner-approvals.html#events">Review</a>`;
      else if (st === "live" && publicEvent(e.id)) action = `<a class="btn btn-ghost btn-sm" href="event.html?id=${e.id}">View page</a>`;
      else if (st === "live") action = `<span class="muted small">Published</span>`;
      else if (st === "ended") action = `<a class="btn btn-ghost btn-sm" href="owner-payouts.html">Payout</a>`;
      const statusKey = st === "pending" ? "review" : st === "live" ? "live" : st === "rejected" ? "hold" : "paid";
      return `<tr>
        <td><strong>${esc(e.title)}</strong><br><span class="muted small">${esc(promoter(e.promoter).name)}</span></td>
        <td>${dateParts(e.date).short}</td>
        <td>${pill(statusKey, EVENT_LABEL[st])}</td>
        <td style="min-width: 150px"><div class="row small"><span>${e.sold} / ${e.capacity}</span><span class="muted">${pct}%</span></div><div class="meter"><span style="width: ${pct}%"></span></div></td>
        <td class="num">${e.sales ? money(e.sales) : "—"}</td>
        <td class="num">${action}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="6" class="muted" style="text-align: center; padding: 24px">No events in this view.</td></tr>`;
  }

  /* ---------- Wiring ---------- */
  function renderAll() {
    paintBadges();
    renderOverview();
    renderApprovals();
    renderPayouts();
    renderEvents();
  }

  /* Real server: send the decision, then reload everything from the database. */
  let busy = false;
  async function act(kind, id, value, extra) {
    if (busy) return;
    busy = true;
    try {
      const r = await API.call("owner/decide", { method: "POST", body: JSON.stringify({ kind, id, value, ...(extra || {}) }) });
      toast(r.message);
    } catch (err) {
      toast(err.message);
    }
    try { O = await API.call("owner/dashboard"); } catch (err) { toast(err.message); }
    busy = false;
    renderAll();
  }

  document.addEventListener("change", async (e) => {
    const box = e.target.closest("[data-pcheck]");
    if (!box || !LIVE || busy) return;
    const [id, check] = box.getAttribute("data-pcheck").split(":");
    busy = true;
    try {
      toast((await API.call("owner/promoter-check", { method: "POST", body: JSON.stringify({ id, check, done: box.checked }) })).message);
      O = await API.call("owner/dashboard");
    } catch (err) {
      box.checked = !box.checked;
      toast(err.message);
    }
    busy = false;
    renderAll();
  });

  const DONE_MSG = { approved: "Approved", held: "Put on hold", rejected: "Rejected", declined: "Declined", cleared: "Cleared" };
  document.addEventListener("click", (e) => {
    const sent = e.target.closest("[data-sent]");
    if (sent && LIVE) {
      const ev = O.events.find((x) => x.id === sent.getAttribute("data-sent"));
      const ref = window.prompt(`Bank transfer reference for the ${money(figures(ev).payout)} payout to ${promoter(ev.promoter).name}:`);
      if (ref && ref.trim()) act("payouts", ev.id, "sent", { bankRef: ref.trim() });
      return;
    }
    const d = e.target.closest("[data-decide]");
    if (d) {
      const [kind, id, value] = d.getAttribute("data-decide").split(":");
      if (LIVE) { act(kind, id, value); return; }
      S[kind][id] = value;
      save();
      toast(`${DONE_MSG[value] || "Done"} (sample — nothing is sent)`);
      renderAll();
      return;
    }
    const u = e.target.closest("[data-undo]");
    if (u) {
      const [kind, id] = u.getAttribute("data-undo").split(":");
      delete S[kind][id];
      save();
      toast("Undone");
      renderAll();
      return;
    }
    if (e.target.closest("[data-owner-reset]")) {
      S = blank();
      save();
      toast("Sample data reset");
      renderAll();
      return;
    }
    const pf = e.target.closest("[data-payout-filter]");
    if (pf) {
      payoutFilter = pf.getAttribute("data-payout-filter");
      $$("[data-payout-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === pf)));
      renderPayouts();
      return;
    }
    const ef = e.target.closest("[data-ev-filter]");
    if (ef) {
      eventFilter = ef.getAttribute("data-ev-filter");
      $$("[data-ev-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === ef)));
      renderEvents();
    }
  });

  const hello = $("[data-owner-hello]");
  if (hello) {
    const h = new Date().getHours();
    hello.textContent = `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${O.name}`;
  }
  renderAll();
})();
