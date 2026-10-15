/**
 * Store-hours and same-day-delivery logic.
 *
 * Barbados does not observe daylight saving and sits on a fixed UTC-4 offset,
 * so local time is derived arithmetically rather than through a timezone
 * database. That keeps the countdown correct wherever the app is hosted.
 */

export const BARBADOS_UTC_OFFSET_MINUTES = -4 * 60;

export const PARISHES = [
  'Christ Church',
  'St. Andrew',
  'St. George',
  'St. James',
  'St. John',
  'St. Joseph',
  'St. Lucy',
  'St. Michael',
  'St. Peter',
  'St. Philip',
  'St. Thomas',
];

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The wall-clock time in Bridgetown for a given instant. */
export function localParts(now = new Date()) {
  const shifted = new Date(now.getTime() + BARBADOS_UTC_OFFSET_MINUTES * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    minutesOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    date: shifted.toISOString().slice(0, 10),
  };
}

export function weekdayName(weekday) {
  return WEEKDAY_NAMES[weekday];
}

/** `"08:30"` -> `510` minutes past midnight. */
export function parseTimeToMinutes(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/** `510` -> `"8:30am"`, `1140` -> `"7pm"` */
export function formatMinutes(minutes) {
  if (minutes == null) return '';
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return mins === 0 ? `${hours12}${suffix}` : `${hours12}:${String(mins).padStart(2, '0')}${suffix}`;
}

export function formatTime(value) {
  return formatMinutes(parseTimeToMinutes(value));
}

/**
 * Whether the store is open right now, and when it next opens or closes.
 * `hours` is the rows of the store_hours table.
 */
export function openingStatus(hours, now = new Date()) {
  const { weekday, minutesOfDay } = localParts(now);
  const today = hours.find((row) => row.weekday === weekday);

  if (today && !today.closed) {
    const opens = parseTimeToMinutes(today.opens);
    const closes = parseTimeToMinutes(today.closes);
    if (minutesOfDay >= opens && minutesOfDay < closes) {
      return { open: true, label: `Open now · closes ${formatMinutes(closes)}` };
    }
    if (minutesOfDay < opens) {
      return { open: false, label: `Closed · opens ${formatMinutes(opens)}` };
    }
  }

  // Walk forward to the next day that has opening hours.
  for (let step = 1; step <= 7; step += 1) {
    const row = hours.find((entry) => entry.weekday === (weekday + step) % 7);
    if (row && !row.closed) {
      const when = step === 1 ? 'tomorrow' : weekdayName(row.weekday);
      return { open: false, label: `Closed · opens ${when} ${formatTime(row.opens)}` };
    }
  }

  return { open: false, label: 'Closed' };
}

/**
 * How long is left to order for same-day delivery. Returns `null` outside the
 * same-day window (after the cutoff, or on a day with no delivery run).
 */
export function sameDayCountdown(settings, now = new Date()) {
  const cutoff = parseTimeToMinutes(settings.same_day_cutoff || '15:30');
  const deliveryDays = (settings.delivery_days || '1,2,3,4,5,6')
    .split(',')
    .map((value) => Number(value.trim()));
  const { weekday, minutesOfDay } = localParts(now);

  if (!deliveryDays.includes(weekday) || minutesOfDay >= cutoff) return null;

  const remaining = cutoff - minutesOfDay;
  const hours = Math.floor(remaining / 60);
  const minutes = remaining % 60;
  return {
    minutesLeft: remaining,
    label: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
    cutoffLabel: formatMinutes(cutoff),
  };
}

/** The delivery charge for a basket, honouring the "special rate" threshold. */
export function deliveryCostCents(rate, subtotalCents, specialThresholdCents) {
  if (!rate) return null;
  return subtotalCents >= specialThresholdCents ? rate.special_cents : rate.rate_cents;
}
