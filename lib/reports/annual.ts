/**
 * Annual results, shared by every report that ranks a whole year.
 *
 * `/score/total` computed the annual average inline, and the three yearly
 * sub-reports each need the same figure. A second copy of the rule would be a
 * copy that drifts — and this one has a quirk worth stating once rather than
 * three times: a year with only one semester entered averages to *that*
 * semester, not to half of it. Dividing by a fixed two would show every pupil
 * as failing until the second semester is marked, and put the whole class on
 * the repeaters list in the meantime.
 */

import type { Score, Student } from '@/lib/types'
import { gradeFor, type GradingSchemeConfig } from '@/lib/grading/scheme'

/** Subject keys the annual sheet stores its two semester averages under. */
export const SEM1_KEY = 'sem1_avg'
export const SEM2_KEY = 'sem2_avg'

/** A pupil passes the year at 5.00 and above. */
export const PROMOTION_THRESHOLD = 5.0

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

/** A finite, positive number from a raw score cell, else null. */
function numeric(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const v = Number.parseFloat(String(raw))
  // `> 0` rather than `>= 0`: the annual sheet writes 0 for "not yet marked",
  // which is what `/score/total` also treats as absent.
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Mean of the semesters that carry a mark.
 *
 * Mirrors `ScoreTotalClient` exactly: one semester averages to itself, two
 * average normally, none is null.
 */
export function computeAnnualAverage(sem1: number | null, sem2: number | null): number | null {
  const present = [sem1, sem2].filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

/**
 * One row per pupil, ranked by annual average.
 *
 * `annualScores` is the raw `scores` rows for `score_type = 'annual'`; only the
 * two semester-average subjects are read.
 */
export function buildAnnualRows(students: Student[], annualScores: Score[]): AnnualRow[] {
  const sem1 = new Map<string, number | null>()
  const sem2 = new Map<string, number | null>()

  for (const s of annualScores) {
    if (s.subject === SEM1_KEY) sem1.set(s.student_id, numeric(s.score_value))
    else if (s.subject === SEM2_KEY) sem2.set(s.student_id, numeric(s.score_value))
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
  const ranked = rows
    .filter((r) => r.average !== null)
    .sort((x, y) => (y.average as number) - (x.average as number))

  ranked.forEach((row, i) => {
    // Equal averages share a place, and the next place skips accordingly —
    // standard competition ranking, matching the ranking sheet.
    const prev = ranked[i - 1]
    row.rank = prev && prev.average === row.average ? prev.rank : i + 1
  })

  return rows
}

/** Letter grade for an annual average, via the shared grading engine. */
export function annualGrade(average: number | null, config?: GradingSchemeConfig): string {
  return gradeFor(average, config)?.letter ?? '-'
}
