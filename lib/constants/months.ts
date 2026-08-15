/**
 * The single source of truth for Khmer month names and month ordering.
 *
 * Fourteen clients used to each declare their own month array in one of five
 * incompatible shapes (`{id,label}`, `{id,label,isNextYear}`, `{val,label}`,
 * `{value,label}`, and a bare label array). They all live here now.
 *
 * Two orderings matter in this app:
 * - **Calendar order** (Jan → Dec) for anything keyed on a real date.
 * - **Academic-year order** (Nov → Oct) — the Cambodian school year starts in
 *   November, so score and report pickers list months in that order.
 */

/** Three-letter month id. Used as a `score_period` prefix and as a select value. */
export type MonthId =
  | 'jan' | 'feb' | 'mar' | 'apr' | 'may' | 'jun'
  | 'jul' | 'aug' | 'sep' | 'oct' | 'nov' | 'dec'

export interface KhmerMonth {
  id: MonthId
  /** Khmer month name, e.g. `មករា`. */
  label: string
  /** Zero-padded calendar number, `'01'`–`'12'`. */
  num: string
  /** Zero-based calendar index, matching `Date.prototype.getMonth()`. */
  index: number
  /**
   * True when the month falls in the *second* calendar year of an academic
   * year. The school year runs Nov → Oct, so Nov and Dec sit in the first
   * calendar year and everything from Jan onward sits in the next one.
   */
  isNextYear: boolean
}

/** Every month in calendar order (Jan → Dec). */
export const MONTHS_BY_CALENDAR: readonly KhmerMonth[] = [
  { id: 'jan', label: 'មករា', num: '01', index: 0, isNextYear: true },
  { id: 'feb', label: 'កុម្ភៈ', num: '02', index: 1, isNextYear: true },
  { id: 'mar', label: 'មីនា', num: '03', index: 2, isNextYear: true },
  { id: 'apr', label: 'មេសា', num: '04', index: 3, isNextYear: true },
  { id: 'may', label: 'ឧសភា', num: '05', index: 4, isNextYear: true },
  { id: 'jun', label: 'មិថុនា', num: '06', index: 5, isNextYear: true },
  { id: 'jul', label: 'កក្កដា', num: '07', index: 6, isNextYear: true },
  { id: 'aug', label: 'សីហា', num: '08', index: 7, isNextYear: true },
  { id: 'sep', label: 'កញ្ញា', num: '09', index: 8, isNextYear: true },
  { id: 'oct', label: 'តុលា', num: '10', index: 9, isNextYear: true },
  { id: 'nov', label: 'វិច្ឆិកា', num: '11', index: 10, isNextYear: false },
  { id: 'dec', label: 'ធ្នូ', num: '12', index: 11, isNextYear: false },
] as const

/** Every month in academic-year order (Nov → Oct). */
export const MONTHS_BY_ACADEMIC_YEAR: readonly KhmerMonth[] = [
  ...MONTHS_BY_CALENDAR.slice(10),
  ...MONTHS_BY_CALENDAR.slice(0, 10),
]

/** Month ids in academic-year order. */
export const ACADEMIC_MONTH_IDS: readonly MonthId[] = MONTHS_BY_ACADEMIC_YEAR.map((m) => m.id)

/**
 * Khmer month labels indexed by `Date.prototype.getMonth()` — index 0 is មករា.
 * For formatting a real date, prefer `formatKhmerDate` in `lib/utils/date`.
 */
export const KHMER_MONTH_LABELS: readonly string[] = MONTHS_BY_CALENDAR.map((m) => m.label)

/**
 * `'jan'` → `'មករា'`.
 *
 * Keyed by plain `string` rather than {@link MonthId} because callers index it
 * with the raw value of a `<Select>`, which is a string at runtime. Use
 * {@link isMonthId} when you need to narrow one.
 */
export const MONTH_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  MONTHS_BY_CALENDAR.map((m) => [m.id, m.label]),
)

/** `'jan'` → `'01'`. */
export const MONTH_NUM_BY_ID: Record<string, string> = Object.fromEntries(
  MONTHS_BY_CALENDAR.map((m) => [m.id, m.num]),
)

/** `'01'` → `'jan'`. */
export const MONTH_ID_BY_NUM: Record<string, MonthId> = Object.fromEntries(
  MONTHS_BY_CALENDAR.map((m) => [m.num, m.id]),
)

/** Narrow an arbitrary string to a {@link MonthId}. */
export function isMonthId(value: string): value is MonthId {
  return value in MONTH_LABEL_BY_ID
}

/** Options for `Select` / `SearchableSelect`, keyed by month id. */
export const MONTH_OPTIONS_BY_ID = MONTHS_BY_CALENDAR.map((m) => ({ value: m.id, label: m.label }))

/** Options for `Select` / `SearchableSelect`, keyed by `'01'`–`'12'`. */
export const MONTH_OPTIONS_BY_NUM = MONTHS_BY_CALENDAR.map((m) => ({ value: m.num, label: m.label }))

/** Academic-year-ordered options keyed by `'01'`–`'12'`. */
export const ACADEMIC_MONTH_OPTIONS_BY_NUM = MONTHS_BY_ACADEMIC_YEAR.map((m) => ({
  value: m.num,
  label: m.label,
}))

/**
 * Academic-year-ordered options keyed by month id (`nov`, `dec`, ...).
 *
 * This is the ordering the score grids need — they key periods by month id and
 * present Nov → Oct — and several clients were building it inline with
 * `MONTHS_BY_ACADEMIC_YEAR.map(...)`.
 */
export const ACADEMIC_MONTH_OPTIONS_BY_ID = MONTHS_BY_ACADEMIC_YEAR.map((m) => ({
  value: m.id,
  label: m.label,
}))
