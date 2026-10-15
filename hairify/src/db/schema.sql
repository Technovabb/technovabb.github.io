-- Hairify Hair Store — platform schema.
-- Money is always stored as whole cents (Barbados dollars) in INTEGER columns,
-- so there is never a rounding surprise between the shop, the POS and reports.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Staff, sessions and settings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
  pin           TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  tagline    TEXT,
  image      TEXT,
  parent_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  in_nav     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  subtitle    TEXT,
  brand       TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  -- 'product' is an ordinary catalogue item, 'deal' is a promotional kit that
  -- shows in the deals rail rather than the normal grid.
  kind        TEXT NOT NULL DEFAULT 'product' CHECK (kind IN ('product', 'deal')),
  eyebrow     TEXT,
  description TEXT,
  how_to      TEXT,
  care_notes  TEXT,
  badge       TEXT CHECK (badge IN ('best-seller', 'new', 'deal') OR badge IS NULL),
  unit_label  TEXT NOT NULL DEFAULT 'each',
  -- Drives the "how many packs do I need?" guide.
  packs_min   INTEGER,
  packs_max   INTEGER,
  featured    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_kind ON products(kind, active);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- One row per thing that can actually be sold and counted. Texture, length and
-- colour are the three axes the shop uses; any of them may be null.
CREATE TABLE IF NOT EXISTS variants (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL UNIQUE,
  barcode          TEXT UNIQUE,
  texture          TEXT,
  length           TEXT,
  colour           TEXT,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  compare_at_cents INTEGER CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
  cost_cents       INTEGER,
  weight_grams     INTEGER,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_barcode ON variants(barcode);

-- A kit (the Miracle Knot Box, the Soft Locs Deal) is a variant made of other
-- variants. Selling one decrements its components, so stock stays honest
-- without anyone counting boxes separately.
CREATE TABLE IF NOT EXISTS variant_components (
  parent_variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  child_variant_id  INTEGER NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (parent_variant_id, child_variant_id)
);

-- ---------------------------------------------------------------------------
-- Locations and inventory
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS locations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  address    TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inventory (
  variant_id    INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  location_id   INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  on_hand       INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (variant_id, location_id)
);

-- Every movement in or out is written here, so the ledger explains the count.
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id     INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  location_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  delta          INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  reference_type TEXT,
  reference_id   INTEGER,
  note           TEXT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_movements_variant ON stock_movements(variant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_movements_reference ON stock_movements(reference_type, reference_id);

-- Receiving a delivery from a supplier.
CREATE TABLE IF NOT EXISTS stock_receipts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reference   TEXT NOT NULL UNIQUE,
  supplier    TEXT,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  note        TEXT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  cost_cents INTEGER
);

-- ---------------------------------------------------------------------------
-- Customers, carts and orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  email      TEXT COLLATE NOCASE,
  phone      TEXT,
  parish     TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS carts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id    INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cart_id, variant_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reference       TEXT NOT NULL UNIQUE,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('online', 'pos')),
  status          TEXT NOT NULL CHECK (status IN (
                    'pending-payment', 'placed', 'packed', 'out-for-delivery',
                    'ready-for-pickup', 'completed', 'cancelled'
                  )),
  fulfilment      TEXT NOT NULL CHECK (fulfilment IN ('delivery', 'pickup', 'in-store')),
  parish          TEXT,
  address         TEXT,
  delivery_notes  TEXT,
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  discount_cents  INTEGER NOT NULL DEFAULT 0,
  delivery_cents  INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  paid_cents      INTEGER NOT NULL DEFAULT 0,
  refunded_cents  INTEGER NOT NULL DEFAULT 0,
  payment_method  TEXT,
  payment_status  TEXT NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid', 'paid', 'part-paid', 'refunded', 'voided')),
  promised_window TEXT,
  same_day        INTEGER NOT NULL DEFAULT 0,
  location_id     INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  shift_id        INTEGER REFERENCES pos_shifts(id) ON DELETE SET NULL,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  placed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel, placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id       INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  -- Snapshots so a historic receipt still reads correctly after a rename.
  name_snapshot    TEXT NOT NULL,
  variant_snapshot TEXT,
  sku_snapshot     TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  discount_cents   INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL,
  refunded_qty     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('cash', 'card', 'online-card', 'on-delivery', 'transfer')),
  amount_cents  INTEGER NOT NULL,
  tendered_cents INTEGER,
  change_cents  INTEGER,
  status        TEXT NOT NULL DEFAULT 'captured'
                  CHECK (status IN ('pending', 'captured', 'failed', 'refunded')),
  provider_ref  TEXT,
  shift_id      INTEGER REFERENCES pos_shifts(id) ON DELETE SET NULL,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS refunds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method       TEXT NOT NULL,
  reason       TEXT,
  restocked    INTEGER NOT NULL DEFAULT 1,
  shift_id     INTEGER REFERENCES pos_shifts(id) ON DELETE SET NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refund_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id     INTEGER NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  amount_cents  INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Point of sale
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pos_registers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_shifts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id         INTEGER NOT NULL REFERENCES pos_registers(id) ON DELETE RESTRICT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opening_float_cents INTEGER NOT NULL DEFAULT 0,
  counted_cents       INTEGER,
  expected_cents      INTEGER,
  variance_cents      INTEGER,
  note                TEXT,
  opened_at           TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_shifts_status ON pos_shifts(status, register_id);

CREATE TABLE IF NOT EXISTS cash_movements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id     INTEGER NOT NULL REFERENCES pos_shifts(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('float', 'sale', 'refund', 'pay-in', 'pay-out', 'drop')),
  amount_cents INTEGER NOT NULL,
  reason       TEXT,
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

-- A sale parked mid-serve so the next customer can be rung up.
CREATE TABLE IF NOT EXISTS held_sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  register_id INTEGER NOT NULL REFERENCES pos_registers(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Storefront support tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delivery_rates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parish          TEXT NOT NULL UNIQUE,
  rate_cents      INTEGER NOT NULL,
  -- Rate charged instead of the above once the basket passes the threshold in
  -- settings ("special rates over $150").
  special_cents   INTEGER NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS store_hours (
  weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  opens   TEXT,
  closes  TEXT,
  closed  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  contact    TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('whatsapp', 'email')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Products shown under "complete the look" / "customers also shop".
CREATE TABLE IF NOT EXISTS product_links (
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  related_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('complete-the-look', 'also-shop')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, related_id, relationship)
);
