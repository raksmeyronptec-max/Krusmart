/**
 * Annual results for the legacy `/yearly-report` screens.
 *
 * THE RULES DO NOT LIVE HERE. They are `lib/scores/annual.ts`'s — pure,
 * node-loadable, and shared with the report engine — so the printed annual
 * documents and these screens cannot hold two different ideas of what a year
 * is. What survives in this module is the shape those screens consume: one row
 * per pupil, ranked, with a promotion flag.
 *
 * ── The stored-only reading was a real defect, not a policy ───────────────
 *
 * This module used to read the stored annual sheet and nothing else, justified
 * by "showing a derived figure the ឆ្នាំ tab does not show would make the screen
 * disagree with the grid beside it". That justification expired the moment
 * `/score/total`'s ឆ្នាំ tab began falling back to the derived year — and since
 * **nothing in this application ever writes an annual row**, the stored sheet
 * is empty for every class created here, so every pupil's `average` was null.
 *
 * `PromotionListClient` drops null averages from both lists on purpose — a
 * pupil with no annual result belongs on neither — so the visible symptom was
 * not a wrong list but **two permanently empty ones**: `/yearly-report/promoted`
 * and `/yearly-report/repeated` named nobody, in any class, ever, while the
 * engine's `annual_promoted_students` sheet printed the real decision from the
 * same data. Two surfaces, one question, and one of them silently answering
 * "no pupils" rather than "I cannot tell".
 *
 * `buildAnnualRows` now takes the derived halves and resolves through
 * `buildAnnualResult` — stored first, derived otherwise — which is what
 * `/score/total`, that report and the three league-table screens all do.
 */

import type { Score, Student } from '@/lib/types'
import { gradeFor, DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { assignRanks } from '@/lib/scores/aggregate'
import {
  SEM1_KEY, SEM2_KEY, buildAnnualResult, computeAnnualAverage, promotionThreshold,
  storedAnnualValue, type AnnualValueSource, type DerivedSemesters,
} from '@/lib/scores/annual'

export { SEM1_KEY, SEM2_KEY, computeAnnualAverage }

/**
 * A pupil passes the year at 5.00 and above.
 *
 * Now derived rather than typed: primary's pass mark on its /10 scale is 5, so
 * this is the same 5.0 the screens have always shown, sourced from the scheme
 * instead of restated (§17). Kept as an export because both promotion screens
 * print it in their subtitle.
 */
export const PROMOTION_THRESHOLD = promotionThreshold(DEFAULT_SCHEME_CONFIG)

export interface AnnualRow {
  student: Student
  sem1: number | null
  sem2: number | null
  /** Mean of whichever semesters carry a mark, or null when neither does. */
  average: number | null
  /** 1-based, best first. Pupils with no marks are unranked (`null`). */
  rank: number | null
  promoted: boolean
  /**
   * Where the year came from — printed on the sheet, as it is on the engine's.
   *
   * A figure a teacher recorded and one the system worked out from the marks
   * are different claims, and a promotion list is the last place to blur them.
   */
  source: AnnualValueSource
}

/**
 * One row per pupil, ranked by annual average.
 *
 * `annualScores` is the raw `scores` rows for `score_type = 'annual'`; only the
 * two semester-average subjects are read.
 *
 * Ranking goes through `assignRanks` — the canonical walk every other ranking
 * surface uses (§37) — rather than the hand-written tie loop this once carried.
 * Both produce competition ranking (1,2,2,4) over the marked pupils only, so
 * the change is a de-duplication, not a re-grade.
 */
export function buildAnnualRows(
  students: Student[],
  annualScores: Score[],
  /**
   * Each pupil's two semester figures, derived from their marks — from
   * `deriveSemesterAverages`, resolved by the caller which has the rows.
   *
   * Optional so a caller with nothing derived behaves exactly as this function
   * did before: stored sheet only. Passing it is what makes the promotion lists
   * agree with `/score/total` and with the printed annual sheets.
   */
  derived: DerivedSemesters = {},
  /**
   * The class's own pass mark. Defaults to primary's 5.00 — the figure these
   * screens have always split on — so an existing caller is unchanged, while a
   * secondary class can pass its own /50 threshold in rather than being judged
   * by the primary rule.
   */
  threshold: number = PROMOTION_THRESHOLD,
): AnnualRow[] {
  const sem1 = new Map<string, number | null>()
  const sem2 = new Map<string, number | null>()

  for (const s of annualScores) {
    if (s.subject === SEM1_KEY) sem1.set(s.student_id, storedAnnualValue(s.score_value))
    else if (s.subject === SEM2_KEY) sem2.set(s.student_id, storedAnnualValue(s.score_value))
  }

  const rows: AnnualRow[] = students.map((student) => {
    // STORED FIRST, DERIVED OTHERWISE — `lib/scores/annual.ts`'s one rule, not
    // a second reading of it. `computeAnnualAverage` is still what averages the
    // two halves; `buildAnnualResult` is what chooses them.
    const annual = buildAnnualResult({
      sem1Stored: sem1.get(student.id) ?? null,
      sem2Stored: sem2.get(student.id) ?? null,
      sem1Derived: derived[student.id]?.sem1 ?? null,
      sem2Derived: derived[student.id]?.sem2 ?? null,
    }, threshold)

    return {
      student,
      sem1: annual.sem1.value,
      sem2: annual.sem2.value,
      average: annual.average,
      rank: null,
      promoted: annual.status === 'promoted',
      source: annual.source,
    }
  })

  // Ranked over the pupils who actually have an average, so an unmarked pupil
  // does not occupy a place and push everyone below them down one.
  const ranked = rows.filter((r) => r.average !== null)
  assignRanks(ranked, (r) => r.average as number, (r, rank) => { r.rank = rank })

  return rows
}

/** Letter grade for an annual average, via the shared grading engine. */
export function annualGrade(average: number | null, config?: GradingSchemeConfig): string {
  return gradeFor(average, config)?.letter ?? '-'
}
