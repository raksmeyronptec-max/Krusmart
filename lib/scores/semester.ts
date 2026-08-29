/**
 * What a semester average is, in one place.
 *
 * The formula lived inside `computeRows` in `ScoreTotalClient`, and the month
 * set it depends on lived in a `useState` default beside it. That was fine
 * while one screen computed it; it stopped being fine the moment a printed
 * report had to produce the same number, because a document cannot read a
 * component's UI state.
 *
 * Two things moved here, and the second one is a fix rather than a move:
 *
 *   `semesterAverage`     the arithmetic, unchanged from `/score/total`
 *   `monthsForSemester`   which months belong to a semester — previously the
 *                         literal ['nov','dec','jan','feb','mar'], applied to
 *                         BOTH semesters. Semester 2 therefore averaged its own
 *                         exam marks against semester 1's monthly marks. That
 *                         is corrected here and `/score/total` adopts the fix,
 *                         so the screen and the report agree by construction.
 *
 * Pure, no server imports: the totals client, the report resolver and the
 * verification scripts all consume it.
 */

// Relative and extension-qualified on purpose: the verify scripts run this
// module under plain node, which neither rewrites the `@/` alias nor resolves
// extensionless specifiers. Same reason `lib/scores/template.ts` does it.
import type { MonthId } from '../constants/months.ts'
import { DEFAULT_CALENDAR, periodKeysForSemester } from './calendar.ts'

export type SemesterId = 'sem1' | 'sem2'

/**
 * Which months belong to a semester, on the DEFAULT calendar.
 *
 * The split itself now lives in `lib/scores/calendar.ts` (`DEFAULT_CALENDAR`:
 * twelve periods, sem1 = the first five, derived from
 * `MONTHS_BY_ACADEMIC_YEAR`) so a class can override it with its own periods.
 * This delegate keeps the historic signature and, by construction, the exact
 * historic result — callers that should follow a class's own calendar migrate
 * to `periodKeysForSemester(resolveCalendar(...), s)` instead.
 */
export function monthsForSemester(semester: SemesterId): MonthId[] {
  return periodKeysForSemester(DEFAULT_CALENDAR, semester)
}

/** Khmer label for a semester. */
export function semesterLabel(semester: SemesterId): string {
  return semester === 'sem1' ? 'ឆមាសទី១' : 'ឆមាសទី២'
}

/** Guard for a value arriving from a request. */
export function isSemesterId(value: unknown): value is SemesterId {
  return value === 'sem1' || value === 'sem2'
}

/**
 * The monthly half of a semester average: the mean of a pupil's monthly
 * averages across the semester's months.
 *
 * Months the pupil has no marks in are absent from `monthlyAverages` and are
 * skipped — not counted as zero. A pupil marked in three of five months is
 * averaged over those three, which is the same "missing stays missing" rule
 * `studentAverage` follows for subjects.
 *
 * `null` when the pupil has no monthly marks anywhere in the semester.
 */
export function monthlyComponent(
  monthlyAverages: Record<string, number> | undefined,
  months: readonly MonthId[],
): number | null {
  if (!monthlyAverages) return null
  const values = months
    .map((m) => monthlyAverages[m])
    .filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * A pupil's semester average: the mean of their exam average and their monthly
 * component.
 *
 * Transcribed from `/score/total`, including the part that looks harsh and is
 * deliberate: a missing half counts as **zero**, not as absent. A pupil with an
 * exam average of 8 and no monthly marks scores 4.0, because the semester is
 * defined as half exam and half coursework and they have only done half of it.
 * Changing that would silently re-grade every semester already recorded, so it
 * is preserved exactly — `studentAverage`'s "skip what is missing" rule applies
 * *within* each half, never across the two.
 *
 * `null` only when BOTH halves are absent, which is a pupil with nothing
 * recorded at all. `/score/total` renders that as `0.00`; the ranking report
 * prints no rank for them. Both follow from the same null.
 */
export function semesterAverage(
  examAverage: number | null,
  monthly: number | null,
): number | null {
  if (examAverage === null && monthly === null) return null
  return ((examAverage ?? 0) + (monthly ?? 0)) / 2
}
