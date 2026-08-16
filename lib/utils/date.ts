import { KHMER_MONTH_LABELS } from '@/lib/constants/months'
import { toKhmerNumber } from './khmer-num'

/**
 * Whole years elapsed between `dob` and `on`, or `null` when the date is
 * missing or unparseable.
 *
 * Four copies of this existed. Three were calendar-aware and identical; the
 * fourth (`parent-report`) measured the epoch difference and read the year off
 * a `Date`, which can land a day out around leap years. The calendar-aware
 * version is the one kept.
 */
export function calculateAge(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob || dob === '-') return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null

  let age = on.getFullYear() - birth.getFullYear()
  const monthDelta = on.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < birth.getDate())) age--
  return age
}

/**
 * A `Date` as `YYYY-MM-DD` in **local** time.
 *
 * `toISOString().split('T')[0]` is the obvious alternative and is wrong either
 * side of midnight: it converts to UTC first, so a date built at local midnight
 * in UTC+7 comes back as the previous day. Everything in this app that stores a
 * bare calendar date — `due_date`, the homework cycle, attendance — needs the
 * local one.
 */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Format an ISO `YYYY-MM-DD` string as a Khmer date, e.g. `១៥ មករា ២០២៦`.
 * Returns `'-'` for missing input, and falls back to Khmer-numeralising the
 * raw string if it is not in `YYYY-MM-DD` form.
 */
export function formatKhmerDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === '-') return '-'

  const parts = dateStr.split('-')
  if (parts.length !== 3) return toKhmerNumber(dateStr)

  const [year, month, day] = parts
  const label = KHMER_MONTH_LABELS[parseInt(month, 10) - 1]
  if (!label) return toKhmerNumber(dateStr)

  return `${toKhmerNumber(parseInt(day, 10))} ${label} ${toKhmerNumber(year)}`
}
