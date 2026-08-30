/**
 * How a subject's results are tallied across a class.
 *
 * Extracted from `/yearly-report/subject-results`, which was the only place in
 * the product that knew what "ជាប់មធ្យមភាគ" meant. `annual_subject_results`
 * needs the same answer, and §16 is explicit that it must not compute its own —
 * so the rule moved here and the screen now imports it. One definition, two
 * consumers, no drift.
 *
 * THE TWO FRACTIONS ARE THE SCREEN'S, NOT NEW ONES. A pupil passes a subject at
 * half its full mark and reaches the A–C band at 70% of it. They are fractions
 * rather than the literals 5.0 and 7.0 so a subject marked out of 75 is judged
 * at 37.5 and 52.5 instead of against a /10 yardstick — the reasoning the
 * original comment gives, preserved verbatim in intent.
 *
 * PROVISIONAL, like everything else here that no ministry document defines.
 * They match the scheme's own pass mark on the primary scale (5/10 = 0.5) but
 * the A–C fraction is a product decision, so a report built on this says
 * `derived` on the paper.
 *
 * The total/female pair is how every ministry tally in this product is
 * reported, which is why `Tally` is a pair rather than a number.
 *
 * Pure and node-loadable — relative, extension-qualified imports — so the
 * verify scripts exercise this code rather than a copy of it.
 */

import { gradeFor, type GradingSchemeConfig } from '../grading/scheme.ts'

/** A pupil passes a subject at half its full mark. */
export const PASS_FRACTION = 0.5

/** And reaches the A–C band at 70% of it. */
export const ABC_FRACTION = 0.7

/** Total, and how many of that total are girls. */
export interface Tally {
  t: number
  f: number
}

export function emptyTally(): Tally {
  return { t: 0, f: 0 }
}

export function bump(tally: Tally, isFemale: boolean): void {
  tally.t += 1
  if (isFemale) tally.f += 1
}

/** `៣០ (១២)` — total with the female count in brackets, the ministry shape. */
export function tallyCell(tally: Tally, toKhmer: (n: number) => string): string {
  return `${toKhmer(tally.t)} (${toKhmer(tally.f)})`
}

/** Which genders count as female, in both the Khmer and the imported forms. */
export function isFemale(gender: string | null | undefined): boolean {
  return gender === 'ស្រី' || gender === 'F'
}

/** One subject's tally across the class. */
export interface SubjectTally {
  key: string
  label: string
  /** Pupils carrying a mark in this subject. */
  tot: Tally
  /** Marked pupils per letter band. */
  grades: Record<string, Tally>
  pass: Tally
  passABC: Tally
  fail: Tally
  /** Mean of the marks, on the subject's own scale, or null when unmarked. */
  average: number | null
}

/** The scheme's letters, highest band first. */
export function schemeLetters(scheme: GradingSchemeConfig): string[] {
  return [...scheme.bands].sort((a, b) => b.min - a.min).map((b) => b.letter)
}

/**
 * Tally one subject over the class's marks.
 *
 * `values` is one entry per pupil who has a mark — an unmarked pupil is simply
 * absent, never a zero (§35/§36). A subject nobody has been marked in returns a
 * tally of zero and the caller decides whether to print it; the legacy screen
 * drops it, and `annual_subject_results` does the same so the two agree.
 */
export function tallySubject(
  key: string,
  label: string,
  values: { value: number; female: boolean }[],
  maxScore: number,
  scheme: GradingSchemeConfig,
): SubjectTally {
  const row: SubjectTally = {
    key,
    label,
    tot: emptyTally(),
    grades: Object.fromEntries(schemeLetters(scheme).map((l) => [l, emptyTally()])),
    pass: emptyTally(),
    passABC: emptyTally(),
    fail: emptyTally(),
    average: null,
  }

  let sum = 0

  for (const { value, female } of values) {
    if (!Number.isFinite(value)) continue

    bump(row.tot, female)
    sum += value

    // Graded on the SUBJECT's own scale, not the scheme's — a mark out of 75
    // must not be banded as though it were out of 10.
    const letter = gradeFor(value, scheme, maxScore)?.letter
    if (letter && row.grades[letter]) bump(row.grades[letter], female)

    if (value >= maxScore * PASS_FRACTION) bump(row.pass, female)
    else bump(row.fail, female)

    if (value >= maxScore * ABC_FRACTION) bump(row.passABC, female)
  }

  if (row.tot.t > 0) row.average = sum / row.tot.t

  return row
}
