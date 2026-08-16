/**
 * Khmer weekday names.
 *
 * Indexed by `Date.prototype.getDay()`, so index 0 is អាទិត្យ (Sunday) — the
 * day the homework cycle treats as non-working, and the day the monthly
 * attendance sheet shades.
 *
 * Written here for the same reason the month names are: the array was already
 * declared inline in `attendance/monthly`, and the homework grid needed a
 * second copy. Two copies is where a constant belongs in a shared module.
 */

/** Weekday names in `getDay()` order — `០` is Sunday. */
export const KHMER_WEEKDAY_LABELS: readonly string[] = [
  'អាទិត្យ',
  'ច័ន្ទ',
  'អង្គារ',
  'ពុធ',
  'ព្រហស្បតិ៍',
  'សុក្រ',
  'សៅរ៍',
] as const

/** `ថ្ងៃច័ន្ទ` — the weekday of a date, with the `ថ្ងៃ` prefix teachers read. */
export function khmerWeekday(date: Date): string {
  return `ថ្ងៃ${KHMER_WEEKDAY_LABELS[date.getDay()] ?? ''}`
}

/** True when the date falls on a Sunday, the school week's non-working day. */
export function isSunday(date: Date): boolean {
  return date.getDay() === 0
}
