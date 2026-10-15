# Hairify — online shop, point of sale and inventory

A working platform for **Hairify Hair Store**, Manor Lodge Complex, Warrens, St. Michael,
Barbados. Built by **Tech Nova Barbados Limited** from the website concept dated
September 2026.

It is one application with three faces, all sharing one stock database:

| Face | Address | Who uses it |
| --- | --- | --- |
| **Storefront** | `/` | Customers — browse, order, pay, track |
| **Till (POS)** | `/pos` | Staff at the counter |
| **Back office** | `/admin` | Managers and the owner |

The point of putting them together is that there is only ever **one stock figure**. A
bundle sold at the counter disappears from the website immediately, and an online order
comes off the same shelf count the till is reading.

---

## What is built

### Storefront
- Home page with hero, category tiles, deals, best sellers, the Miracle Knots feature, the
  pack guide, delivery options, store hours, Instagram and the sign-up band.
- Category, search, deals and best-seller listings.
- Product pages with texture / length / colour pickers, per-length pricing, live stock,
  "buy as a bundle or as the box", complete-the-look and customers-also-shop rails.
- Bag and checkout: delivery or pickup, parish-based delivery rates with the "special rate
  over $150" rule, WhatsApp number, pay-now-by-card or pay-on-arrival.
- Same-day countdown ("order in the next 4h 15m") driven by the real cutoff time.
- Order confirmation and an order-tracking lookup.
- Delivery, pack guide and opening hours pages.

### Till
- Sign in by email and password, or by a 4–6 digit PIN at a shared counter.
- Open a shift with a counted float; cash up at the end with over/short recorded.
- Barcode scanning (an exact scan drops straight onto the ticket) and text search.
- Ticket with quantities, per-line discounts, hold and resume.
- Cash, card or split tender, change due, printable receipt.
- Returns and refunds against a past sale, with the stock put back unless the goods are
  damaged.
- Pay-ins, pay-outs and safe drops, all on the drawer ledger.

### Inventory
- One count per variant per location, with a full movement ledger — every change says what
  it was, why, who did it and the balance afterwards.
- Reorder points and a low-stock list.
- Stock adjustments with reasons (stock take, damaged, lost, returned to supplier).
- Goods received notes that book a delivery in and update what the stock cost.
- **Kits**: a deal or the Miracle Knot Box holds no stock of its own. Its availability is
  worked out from the packs it is built from, and selling one draws those packs down. This
  is why the Soft Locs Deal can never oversell the soft locs it contains.

### Back office
- Dashboard: taken today, taken this month, orders to pack, low-stock count, stock
  valuation at retail and at cost, money still owed, tills open now.
- Orders: filter by stage, walk an order through packed → out for delivery → completed,
  take an outstanding payment, cancel and return the stock.
- Products: full editing, variants, photos, badges, pack guidance, visibility.
- Customers with order counts and lifetime spend, each one click from WhatsApp.
- Reports: sales by day split by channel, best sellers, payment mix, gross margin.
- Settings: shop details, opening hours, delivery cutoff and per-parish rates, staff
  accounts and roles, password changes.

### Roles
| Role | Till | Back office | Staff accounts |
| --- | --- | --- | --- |
| Cashier | yes | no | no |
| Manager | yes | yes | no |
| Admin | yes | yes | yes |

---

## Running it

Needs **Node.js 22.5 or newer** (it uses Node's built-in SQLite, so there is nothing to
compile and no database server to install).

```bash
cd hairify
cp .env.example .env        # then edit it — see below
npm install
npm run setup               # creates the database, loads the catalogue, makes the admin
npm start                   # http://localhost:3000
```

`npm run setup` prints the admin email, a generated password and the till PIN **once**.
Save them. If you set `ADMIN_PASSWORD` in `.env` it uses that instead.

| Command | What it does |
| --- | --- |
| `npm start` | Run the app |
| `npm run dev` | Run it and restart on file changes |
| `npm run setup` | Set up a fresh database (leaves an existing one alone) |
| `npm run reset` | Throw the database away and start again — **deletes all orders** |
| `npm test` | Run the test suite |

### Environment

Everything is in `.env`; `.env.example` lists it with comments. The ones that matter:

- `SESSION_SECRET` — **must** be set in production. The app refuses to start in production
  without it. Generate one with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- `DATABASE_PATH` — where the SQLite file lives. **Put this on a persistent disk.**
- `SITE_URL` — the public address, used in payment return URLs and receipts.
- `PAYMENT_PROVIDER` — `manual` until the merchant account is live (see below).

---

## Deploying

> **This cannot run on GitHub Pages.** GitHub Pages only serves static files. This is a
> Node application with a database, so it needs a host that runs Node: Render, Railway,
> Fly.io, a DigitalOcean droplet, or any VPS.

What a host needs to give it:

1. **Node 22.5+**, with `npm install` then `npm start`.
2. **A persistent disk** mounted wherever `DATABASE_PATH` points. On a platform with an
   ephemeral filesystem the database is wiped on every deploy — mount a volume.
3. **HTTPS**, with the proxy forwarding `X-Forwarded-Proto` (the app sets
   `trust proxy` in production so cookies are marked secure).
4. `NODE_ENV=production` and a real `SESSION_SECRET`.

`/healthz` returns JSON for uptime checks.

### Pointing hairifybb.com at it
Once it is running, point the domain's `A`/`CNAME` record at the host and set
`SITE_URL=https://hairifybb.com`.

### Backups
The whole shop is one SQLite file. Back it up with a scheduled copy:

```bash
sqlite3 /path/to/hairify.db ".backup '/backups/hairify-$(date +%F).db'"
```

Keep at least 30 days. **Test a restore before go-live** — an untested backup is not a
backup.

---

## Card payments

Out of the box `PAYMENT_PROVIDER=manual`. Everything works: customers can pay on delivery
or at the counter, and choosing "pay now by card" goes to a **clearly labelled test page
inside the app that takes no card details and moves no money**. That exists so the whole
checkout can be walked through before a merchant account exists.

To go live, see `src/lib/payments.js`. It holds a small provider interface — a provider
takes an order and returns a URL to send the shopper to. Two stubs are there:

- **`firstatlantic`** — First Atlantic Commerce, the gateway most Barbadian merchant
  accounts sit behind. The integration point is marked; it needs the credentials from the
  acquirer.
- **`stripe`** — working Stripe Checkout, needs `PAYMENT_SECRET_KEY`.

Either way the gateway returns the shopper to `/payment-return?reference=…&status=paid`,
which marks the order paid. **Before taking real money**, add webhook verification so a
payment is only trusted when the gateway says so server-side, not because of a URL.

---

## Figures the client still has to confirm

These were not in the concept, so sensible opening values were used. They are all editable
in the back office, and they are marked `PLACEHOLDER` in `src/db/seed-data.js`:

1. **Delivery rates per parish** — the concept shows `[rate]`. Opening values are $12
   St. Michael, $15 the nearer parishes, $20 the farther ones, with a special rate of $8–12
   over $150. → Admin → Settings → Delivery.
2. **Opening stock counts** — seeded so the shop is usable on day one. The first stock take
   replaces them. → Admin → Inventory.
3. **Cost prices** — seeded at 55% of retail so the margin report has something to show.
   Real costs come in as stock is received. → Admin → Inventory → Receive stock.
4. **Prices for a few lines** not priced in the concept (soft locs, afro twist, edge gel,
   edge brush, bonnet, lashes, earrings, body mists). Everything shown in the concept uses
   the concept's own price.
5. **The Miracle Knot Box prices** by length ($420/$470/$500/$570) — the concept gives only
   "from $420".

Prices, textures, lengths and the store's hours, address and phone number all come straight
from the concept and the shop's own listings.

### Photography
The product and store photos in `public/img/` were taken from the concept deck, which drew
them from `@hairify.bb`. They are the shop's own images. A handful of lines (edge gel, edge
brush, bonnet, lashes) have no photo yet and show a branded placeholder tile until one is
added in Admin → Products → Photos.

---

## How it is put together

```
hairify/
├── src/
│   ├── config.js           Environment and settings
│   ├── server.js           Express app, static files, error handling
│   ├── db/
│   │   ├── schema.sql      The whole database
│   │   ├── seed-data.js    The opening catalogue, transcribed from the concept
│   │   ├── seed.js         Turns that into rows
│   │   └── setup.js        First-run setup
│   ├── lib/
│   │   ├── inventory.js    Stock, the ledger and kit expansion
│   │   ├── orders.js       Bags, order placement, payments, refunds
│   │   ├── pos.js          Shifts, the cash drawer, held sales
│   │   ├── catalog.js      Catalogue reads
│   │   ├── reports.js      Dashboard and report figures
│   │   ├── payments.js     Card gateway adapters
│   │   ├── store.js        Barbados time, opening hours, the countdown
│   │   ├── money.js        Cents in, formatted money out
│   │   ├── auth.js         Staff accounts and sessions
│   │   └── html.js         Escaping template helper
│   ├── middleware/         Cookies, sign-in, CSRF
│   ├── routes/             shop.js, pos.js, admin.js
│   └── views/              Server-rendered pages
├── public/                 CSS, client JavaScript, images
└── test/                   node:test suites
```

Decisions worth knowing:

- **Money is always whole cents** in `INTEGER` columns, so the shop, the till and the
  reports can never disagree by a rounding error.
- **Stock has one write path.** Everything goes through `applyMovement`, which writes the
  ledger row and the new balance together. A count can always be explained.
- **Orders are written in a transaction** with their stock check inside it, so two tills
  cannot sell the same last pack.
- **The till never sets its own prices.** `/pos/api/sale` re-reads prices from the database
  and rejects the sale if the browser's total disagrees.
- **Pages escape by default.** The `html` template escapes everything interpolated into it;
  `raw()` is the deliberate, searchable exception.
- **Forms are CSRF-protected** by a signed double-submit token, and the storefront works
  with JavaScript switched off.
- **No build step.** No bundler, no framework, two runtime dependencies (Express and
  bcryptjs). It will still install and run in five years.

### Tests

```bash
npm test
```

76 tests over the parts where a mistake costs money: stock and the ledger, kit expansion
and oversell guards, bag pricing, delivery thresholds, order placement, refunds against
discounted lines, the cash drawer and cashing up, Barbados opening hours and the same-day
countdown, HTML escaping and sign-in.

---

## Day-to-day

**Opening up.** Go to `/pos`, sign in, count the drawer, enter the float. The till is ready.

**A sale.** Scan or search, tap to add, Take payment, pick cash/card/split, enter what the
customer handed over, Complete sale. The receipt prints and the stock is gone.

**Someone is waiting.** Hold sale, serve the next customer, then Held → Resume.

**A return.** Sales → find it → enter how many of each line → Refund. Leave "put the stock
back" ticked unless the goods are damaged.

**Cashing up.** Shift → count the drawer → enter the total → Close the till. Over or short
is recorded against the shift and the staff member.

**An online order.** Admin → Orders shows it under "To pack". Pack it, mark it packed, then
out for delivery, then completed. WhatsApp the customer from the order page.

**A delivery arrives.** Admin → Inventory → Receive stock. Enter quantities and unit costs;
it books the stock in and updates the cost prices.

**Running low.** The dashboard counts low-stock lines; Inventory → Low stock only lists
them. Set reorder points so this is useful.

---

## The Odoo route

The client also has an Odoo trial at `hairify.odoo.com`. If the shop is to live
there instead of on this app, `tools/` loads the whole catalogue into it over
Odoo's external API — no re-typing 84 variants by hand.

```bash
node tools/odoo-sync.mjs --dry-run      # print the plan, write nothing
node tools/odoo-sync.mjs                # build it
node tools/odoo-sync.mjs --stage=stock  # one stage: company, attributes,
                                        # categories, products, stock, kits,
                                        # delivery, pos
```

It needs these in the environment — **never in a chat or a committed file**:

| Variable | Value |
| --- | --- |
| `ODOO_URL` | `https://hairify.odoo.com` |
| `ODOO_DB` | `hairify` |
| `ODOO_USERNAME` | the email you sign into Odoo with |
| `ODOO_API_KEY` | Odoo → avatar → My Profile → Account Security → New API Key |

An API key is preferred over `ODOO_PASSWORD`: it is scoped, and revoking it does
not mean changing the password. The run is re-runnable — every record is looked
up before it is created, so running twice updates rather than duplicates.

### How the two models line up

Odoo does not price a variant directly. It prices a template and adds a
`price_extra` to each option, so Miracle Knots loads as **$220 base, with 16"
+$25, 18" +$40 and 20" +$75** rather than as twenty separate prices.
`tools/odoo-map.mjs` works that out and *proves* it — it rebuilds every variant
price from the base and the extras, and reports anything it cannot express
instead of loading a wrong price. All 22 products currently map cleanly.

| Hairify | Odoo |
| --- | --- |
| Texture / length / colour | `product.attribute` and its values |
| Product | `product.template`, variants generated from the options |
| Per-length pricing | `product.template.attribute.value.price_extra` |
| Opening stock | `stock.quant`, applied as an inventory adjustment |
| Deal / Miracle Knot Box | `mrp.bom` of type `phantom` — **needs the Manufacturing app** |
| Rate per parish, reduced over $150 | `delivery.carrier` on `base_on_rule`, two price rules |
| Till | `pos.config` |

### Two things the run will tell you about

- **Currency.** Every price in the catalogue is Barbados dollars. If the Odoo
  database is set to anything else the run **reports it and does not change it** —
  loading BBD prices into a USD database would silently mis-price the shop.
  Fix it under Settings → Companies → Currency first.
- **Apps.** eCommerce, Point of Sale, Inventory and Delivery Methods each have to
  be installed in Odoo before the matching stage can do its job; kits also need
  Manufacturing. The run lists whatever is missing. Note that more than one app
  puts an odoo.com database on a **paid plan** — the free tier covers one app.

### Which route to choose

| | This app | Odoo |
| --- | --- | --- |
| Monthly cost | a Node host, roughly $5–15 | Odoo licence, per user, several apps |
| Already built | yes, tested end to end | catalogue loads in minutes, then configuration |
| Fits the concept design | exactly — it was built from it | Odoo's own themes, needs work to get close |
| Maintenance | yours | Odoo's |
| Accounting, purchasing, payroll | not built | included |

The honest summary: Odoo is the better choice if Hairify wants the whole back
office and will pay monthly for it. This app is the better choice if the concept
design matters and the shop wants to own it outright.

---

Built by Tech Nova Barbados Limited · admin@technovabb.com · (246) 230-8303
