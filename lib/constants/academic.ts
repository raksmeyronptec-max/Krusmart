import { MONTHS_BY_CALENDAR } from './months'

/**
 * The Cambodian school year runs November → October, so the academic year is
 * labelled `${startYear}-${startYear + 1}`.
 */
export const ACADEMIC_YEAR_START_MONTH_INDEX = MONTHS_BY_CALENDAR.find((m) => m.id === 'nov')!.index

/**
 * Fallback used when a teacher has not set `settings.academic_year` yet.
 *
 * NOTE: this is a hardcoded value carried over from the original code, where
 * three pages each inlined the same `'2023-2024'` literal. It is preserved
 * as-is so this refactor stays behaviour-neutral, but it is stale — consider
 * switching the call sites to {@link getCurrentAcademicYear}.
 */
export const FALLBACK_ACADEMIC_YEAR = '2023-2024'

/** The academic year containing `date`, e.g. `'2025-2026'`. */
export function getCurrentAcademicYear(date: Date = new Date()): string {
  const startYear =
    date.getMonth() >= ACADEMIC_YEAR_START_MONTH_INDEX ? date.getFullYear() : date.getFullYear() - 1
  return `${startYear}-${startYear + 1}`
}

/**
 * The calendar year a given academic-year month falls in.
 *
 * `resolveCalendarYear('2025-2026', true)` → `2026` (Jan–Oct),
 * `resolveCalendarYear('2025-2026', false)` → `2025` (Nov–Dec).
 */
export function resolveCalendarYear(academicYear: string, isNextYear: boolean): number {
  const startYear = parseInt(academicYear.split('-')[0], 10)
  return isNextYear ? startYear + 1 : startYear
}
