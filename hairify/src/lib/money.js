/** Money helpers. Everything inside the app is whole cents of Barbados dollars. */

export function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

/** `12345` -> `"123.45"` */
export function formatAmount(cents) {
  const value = Math.abs(Math.round(cents)) / 100;
  const sign = cents < 0 ? '-' : '';
  return (
    sign +
    value.toLocaleString('en-BB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** `12345` -> `"$123.45"` */
export function formatMoney(cents) {
  return `$${formatAmount(cents)}`;
}

/**
 * `22000` -> `"$220"`. The shop writes round prices without the trailing
 * `.00`, the way the price tags in the store do.
 */
export function formatPrice(cents) {
  const rounded = Math.round(cents);
  return rounded % 100 === 0 ? `$${Math.abs(rounded) / 100}` : formatMoney(rounded);
}

/** Barbados has no cent coins below 5c, so cash totals round to the nearest 5. */
export function roundCashToNickel(cents) {
  return Math.round(cents / 5) * 5;
}
