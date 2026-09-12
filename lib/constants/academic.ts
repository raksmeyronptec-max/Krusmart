// With the extension, so node can load this module directly — the same shape
// `lib/scores/workspace.ts` and `lib/reporting/print-period.ts` use, and for
// the same reason: the offline harnesses import these pure modules through
// node's ESM resolver, which does not guess at a missing `.ts`.
import { MONTHS_BY_CALENDAR } from './months.ts'

/**
 * The Cambodian school year runs November → October, so the academic year is
 * labelled `${startYear}-${startYear + 1}`.
 */
export const ACADEMIC_YEAR_START_MONTH_INDEX = MONTHS_BY_CALENDAR.find((m) => m.id === 'nov')!.index

/**
 * @deprecated No longer used. This was the fallback when a teacher had not set
 * `settings.academic_year`, carried over from the original code where three
 * pages each inlined the same `'2023-2024'` literal. A teacher with no setting
 * silently read and wrote scores under 2023-2024 and saw empty screens with no
 * error, so every call site now falls back to {@link getCurrentAcademicYear}
 * instead. The export is kept only so nothing importing it breaks.
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
