/**
 * A tagged template that escapes everything interpolated into it, so page data
 * can never break the markup or inject script.
 *
 *   html`<h1>${product.name}</h1>`
 *
 * Arrays are joined, `null`/`undefined`/`false` render as nothing, and output
 * already produced by `html` (or wrapped in `raw`) passes through untouched.
 */

const SAFE = Symbol('safe-html');

export function raw(value) {
  return { [SAFE]: true, value: String(value) };
}

export function escape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (typeof value === 'object' && value[SAFE]) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    out += render(values[index]) + strings[index + 1];
  }
  return raw(out);
}

/** Renders an `html` result (or a plain string) to the string a response needs. */
export function toString(value) {
  return typeof value === 'object' && value?.[SAFE] ? value.value : String(value ?? '');
}

/** Embeds data for client-side scripts without letting `</script>` escape. */
export function jsonScript(data) {
  return raw(JSON.stringify(data).replace(/</g, '\\u003c'));
}

/** `classes('card', isActive && 'is-active')` -> `"card is-active"` */
export function classes(...names) {
  return names.filter(Boolean).join(' ');
}
