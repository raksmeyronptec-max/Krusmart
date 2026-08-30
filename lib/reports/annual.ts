/**
 * Annual results for the legacy `/yearly-report` screens.
 *
 * THE RULES NO LONGER LIVE HERE. They moved to `lib/scores/annual.ts` — pure,
 * node-loadable, and shared with the report engine — so the printed annual
 * documents and these screens cannot hold two different ideas of what a year
 * is. What survives in this module is the shape those screens consume: rows
 * built from the *stored* annual sheet, ranked, with a promotion flag.
 *
 * The stored-only reading is deliberate here and NOT a limitation of the domain
 * layer. These screens render `score_type = 'annual'` rows a teacher can see in
 * `/score/total`'s ឆ្នាំ tab; showing a derived figure the tab does not show
 * would make the screen disagree with the grid beside it. The engine's annual
 * reports go through `resolveAnnualClass`, which falls back to the canonical
 * semester layer and says on the sheet that it did — see
 * `lib/scores/annual.ts`.
 */

import type { Score, Student } from '@/lib/types'
import { gradeFor, DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { assignRanks } from '@/lib/scores/aggregate'
import {
  SEM1_KEY, SEM2_KEY, computeAnnualAverage, promotionThreshold, storedAnnualValue,
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
export function buildAnnualRows(students: Student[], annualScores: Score[]): AnnualRow[] {
  const sem1 = new Map<string, number | null>()
  const sem2 = new Map<string, number | null>()

  for (const s of annualScores) {
    if (s.subject === SEM1_KEY) sem1.set(s.student_id, storedAnnualValue(s.score_value))
    else if (s.subject === SEM2_KEY) sem2.set(s.student_id, storedAnnualValue(s.score_value))
  }

  const rows: AnnualRow[] = students.map((student) => {
    const a = sem1.get(student.id) ?? null
    const b = sem2.get(student.id) ?? null
    const average = computeAnnualAverage(a, b)
    return {
      student,
      sem1: a,
      sem2: b,
      average,
      rank: null,
      promoted: average !== null && average >= PROMOTION_THRESHOLD,
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
