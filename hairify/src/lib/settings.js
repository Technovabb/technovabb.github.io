/** Key/value shop settings, with the defaults the store opens with. */

export const DEFAULT_SETTINGS = {
  store_name: 'Hairify Hair Store',
  store_tagline: 'We know hair.',
  store_phone: '(246) 285-1413',
  store_whatsapp: '12462851413',
  store_email: 'hello@hairifybb.com',
  store_address: 'Manor Lodge Complex, Warrens',
  store_parish: 'St. Michael, Barbados',
  store_maps_url: 'https://maps.google.com/?q=Manor+Lodge+Complex+Warrens+Barbados',
  instagram: 'hairify.bb',
  instagram_beauty: 'hairifybeauty.bb',
  instagram_cropover: 'kadoo.bb',
  tiktok: 'hairifybb',
  currency_code: 'BBD',
  same_day_cutoff: '15:30',
  delivery_window: '10am to 5pm',
  delivery_days: '1,2,3,4,5,6',
  delivery_special_threshold_cents: '15000',
  low_stock_default: '4',
  receipt_footer: 'Thank you for shopping with Hairify. Exchanges within 7 days with your receipt.',
};

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, String(value));
}

export function setSettings(db, values) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) setSetting(db, key, value);
  }
}

export function storeHours(db) {
  return db.prepare('SELECT * FROM store_hours ORDER BY CASE weekday WHEN 0 THEN 7 ELSE weekday END').all();
}

export function defaultLocation(db) {
  return (
    db.prepare('SELECT * FROM locations WHERE is_default = 1 AND active = 1').get() ||
    db.prepare('SELECT * FROM locations WHERE active = 1 ORDER BY id LIMIT 1').get()
  );
}
