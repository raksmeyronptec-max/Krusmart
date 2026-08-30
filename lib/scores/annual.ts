/**
 * What an annual result is, in one place.
 *
 * The year is the one period the product computes in TWO different ways, and
 * before this module neither of them was written down as a rule:
 *
 *   STORED   `scores` rows with `score_type = 'annual'`, carrying the two
 *            semester averages under the subject keys `sem1_avg` / `sem2_avg`.
 *            This is what `/score/total`'s ឆ្នាំ tab reads and what the three
 *            `/yearly-report` sub-reports rank on.
 *   DERIVED  `semesterAverage(exam, coursework)` per semester, from the marks
 *            themselves — the canonical semester layer `ranking_semester` and
 *            `/score/total`'s ឆមាស tab already share.
 *
 * ★ THE FINDING THAT MAKES THE FALLBACK NECESSARY. Nothing in this application
 * writes a `score_type = 'annual'` row. `sem1_avg` is read in five places and
 * written in none — the rows are Firebase-era data that the Supabase build
 * inherited but never reproduced. A class created in this app therefore has no
 * stored annual result at all, so an annual report that read only the stored
 * path would print an empty sheet for every real class, for ever.
 *
 * So a semester resolves STORED FIRST, DERIVED OTHERWISE, per semester rather
 * than per pupil: a year with an imported ឆមាសទី១ and a marked ឆមាសទី២ uses
 * both. Neither half is a new formula — `computeAnnualAverage` is lifted
 * verbatim from `/score/total`, and the derived half is `semesterAverage`,
 * untouched. What is new is only which of the two answers is preferred, and
 * `AnnualValueSource` carries that choice out to the report so the sheet can
 * say which it printed (§31/§52).
 *
 * THE PROMOTION THRESHOLD IS NOT INVENTED EITHER (§17). `/yearly-report` has
 * always split the class at an annual average of 5.00, stated on the screen as
 * `មធ្យមភាគប្រចាំឆ្នាំក្រោម ៥.០`. That is exactly `DEFAULT_SCHEME_CONFIG.passMark`
 * — primary's pass mark on its /10 scale — so `promotionThreshold` reads it
 * from the scheme rather than restating the literal. Primary is unchanged to
 * the decimal; secondary gets 25/50 instead of a nonsensical 5/50, and no
 * number was chosen by hand.
 *
 * Pure, no server imports, relative and extension-qualified: the verify scripts
 * run this under plain node, same as `semester.ts`, `honor.ts` and `calendar.ts`.
 */

import type { GradingSchemeConfig } from '../grading/scheme.ts'

/** Subject keys the annual sheet stores its two semester averages under. */
export const SEM1_KEY = 'sem1_avg'
export const SEM2_KEY = 'sem2_avg'

/**
 * Where a semester figure came from. Printed on the document, because a mark
 * a teacher entered and a mark the system worked out are different claims.
 */
export type AnnualValueSource = 'stored' | 'derived' | 'none'

/**
 * The threshold a pupil must reach to pass the year, on the scheme's scale.
 *
 * Reading `passMark` rather than restating 5.0 is what makes this the same rule
 * `/yearly-report` has always applied while letting it scale — see the header.
 */
export function promotionThreshold(scheme: GradingSchemeConfig): number {
  return scheme.passMark
}

/**
 * A finite, positive number from a raw stored cell, else null.
 *
 * `> 0` rather than `>= 0`, transcribed from `lib/reports/annual.ts`: the
 * annual sheet writes 0 for "not yet marked", which `/score/total` also treats
 * as absent. Changing it would re-grade every imported year.
 */
export function storedAnnualValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const v = Number.parseFloat(String(raw))
  return Number.isFinite(v) && v > 0 ? v : null
}

/** One semester's figure, and which of the two sources produced it. */
export interface AnnualSemesterResult {
  value: number | null
  source: AnnualValueSource
  /** Both candidates, kept so a report can show a divergence rather than hide it. */
  stored: number | null
  derived: number | null
}

/** Stored first, derived otherwise — the rule the header explains. */
export function resolveSemesterValue(
  stored: number | null,
  derived: number | null,
): AnnualSemesterResult {
  if (stored !== null) return { value: stored, source: 'stored', stored, derived }
  if (derived !== null) return { value: derived, source: 'derived', stored, derived }
  return { value: null, source: 'none', stored, derived }
}

/**
 * Mean of the semesters that carry a mark.
 *
 * Lifted verbatim from `/score/total`, quirk included: a year with only one
 * semester entered averages to *that* semester, not to half of it. Dividing by
 * a fixed two would show every pupil failing until ឆមាសទី២ is marked, and put
 * the whole class on the repeaters list in the meantime.
 */
export function computeAnnualAverage(
  sem1: number | null,
  sem2: number | null,
): number | null {
  const present = [sem1, sem2].filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

/**
 * Whether a pupil passes the year.
 *
 * Three states, not two (§36). A pupil with no annual result is `incomplete`
 * and belongs on NEITHER list — treating a missing average as a fail would put
 * an unmarked class on the repeaters sheet, which is the defect
 * `PromotionListClient` already guards against by filtering nulls out of both
 * halves. That guard becomes a value here so the two reports cannot disagree
 * about who is missing.
 */
export type AnnualStatus = 'promoted' | 'repeated' | 'incomplete'

export function annualStatus(average: number | null, threshold: number): AnnualStatus {
  if (average === null) return 'incomplete'
  return average >= threshold ? 'promoted' : 'repeated'
}

/** Khmer label for a status, for the document and the preview. */
export function annualStatusLabel(status: AnnualStatus): string {
  if (status === 'promoted') return 'ឡើងថ្នាក់'
  if (status === 'repeated') return 'ត្រួតថ្នាក់'
  return 'មិនទាន់គ្រប់'
}

/**
 * The two inputs one pupil's year is built from.
 *
 * Deliberately domain-level only (§19): no student row, no UI state, no
 * formatting. The resolver joins this to a pupil; the reports consume the join.
 */
export interface AnnualInput {
  sem1Stored: number | null
  sem1Derived: number | null
  sem2Stored: number | null
  sem2Derived: number | null
}

/** One pupil's year, resolved. */
export interface AnnualResult {
  sem1: AnnualSemesterResult
  sem2: AnnualSemesterResult
  average: number | null
  /**
   * The weaker of the two halves' provenance: `stored` only when every semester
   * that counted was stored, so a sheet can never claim a figure is a teacher's
   * own when half of it was worked out.
   */
  source: AnnualValueSource
  status: AnnualStatus
}

export function buildAnnualResult(input: AnnualInput, threshold: number): AnnualResult {
  const sem1 = resolveSemesterValue(input.sem1Stored, input.sem1Derived)
  const sem2 = resolveSemesterValue(input.sem2Stored, input.sem2Derived)
  const average = computeAnnualAverage(sem1.value, sem2.value)

  const counted = [sem1, sem2].filter((s) => s.value !== null)
  const source: AnnualValueSource =
    counted.length === 0 ? 'none'
    : counted.every((s) => s.source === 'stored') ? 'stored'
    : 'derived'

  return { sem1, sem2, average, source, status: annualStatus(average, threshold) }
}

/**
 * Khmer provenance sentence for the sheet.
 *
 * Printed rather than buried, on the same principle as the honour roll's
 * criteria line: a figure the system worked out from monthly and exam marks is
 * not the same claim as a figure a teacher recorded, and the reader of a
 * printed report cannot tell the two apart otherwise.
 */
export function annualSourceNote(source: AnnualValueSource): string {
  if (source === 'stored') return 'មធ្យមភាគឆមាសយកពីទិន្នន័យដែលបានរក្សាទុក'
  if (source === 'derived') return 'មធ្យមភាគឆមាសគណនាចេញពីពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែ'
  return 'មិនទាន់មានលទ្ធផលឆមាស'
}
