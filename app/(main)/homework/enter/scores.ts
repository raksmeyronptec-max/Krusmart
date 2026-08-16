/**
 * The shape the homework grid holds marks in, and the arithmetic printed on the
 * ministry sheet.
 *
 * Kept pure and separate from the client so the totals shown on screen and the
 * totals printed on paper come from one function — they were computed by the
 * same closure before, but the print block and the grid each called it, and
 * splitting the client into components would otherwise have split the rule too.
 *
 * The rules are deliberately unchanged from the previous screen:
 *   total   — the sum of every numeric mark the student has in the period.
 *   average — that sum over the *count of marks entered*, not over the number of
 *             school days, so a teacher who has marked ten days sees the average
 *             of ten. Two decimals.
 * A student with no marks at all shows blank, not `0`.
 */

import type { HomeworkDay } from './period'

/** `studentId` → `dayOfMonth` → the raw cell text, exactly as typed. */
export type HomeworkScores = Record<string, Record<number, string>>

export interface HomeworkTotals {
  /** Blank when the student has no numeric mark in this period. */
  total: number | ''
  /** Blank when there is nothing to average; otherwise fixed to two decimals. */
  average: string
  /** How many days carry a numeric mark. */
  count: number
}

export function studentTotals(marks: Record<number, string> | undefined): HomeworkTotals {
  let total = 0
  let count = 0

  for (const raw of Object.values(marks ?? {})) {
    const num = parseFloat(raw)
    if (!isNaN(num)) {
      total += num
      count += 1
    }
  }

  return {
    total: count > 0 ? total : '',
    average: count > 0 ? (total / count).toFixed(2) : '',
    count,
  }
}

/** A cell as typed, read back as a number — `''` and stray text are not marks. */
export function markValue(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

/**
 * What is wrong with a typed cell, if anything.
 *
 * `error` blocks the save; `warning` does not. The split matters because the
 * ten-point ceiling comes from the app's default grading scheme, and a school
 * marking homework out of twenty is not doing anything illegal — refusing to
 * save their marks would be worse than flagging them. A negative mark, on the
 * other hand, cannot be right under any scheme.
 */
export type MarkIssue =
  | { level: 'error'; message: string }
  | { level: 'warning'; message: string }
  | null

export function markIssue(raw: string | undefined, maxScore: number): MarkIssue {
  if (raw === undefined || raw === '') return null

  const num = Number(raw)
  if (!Number.isFinite(num)) {
    return { level: 'error', message: 'ពិន្ទុត្រូវតែជាលេខ' }
  }
  if (num < 0) {
    return { level: 'error', message: 'ពិន្ទុមិនអាចតិចជាងសូន្យបានទេ' }
  }
  if (num > maxScore) {
    return { level: 'warning', message: `ធំជាងពិន្ទុអតិបរមា ${maxScore}` }
  }
  return null
}

export interface HomeworkProgress {
  /** Students on the roster. */
  total: number
  /** Students carrying a mark for the day (or the period) in question. */
  scored: number
  missing: number
  percent: number
}

/** How much of the roster is marked for one day. */
export function dayProgress(
  studentIds: string[],
  scores: HomeworkScores,
  dayNum: number,
): HomeworkProgress {
  const scored = studentIds.filter((id) => markValue(scores[id]?.[dayNum]) !== null).length
  return {
    total: studentIds.length,
    scored,
    missing: studentIds.length - scored,
    percent: studentIds.length === 0 ? 0 : Math.round((scored / studentIds.length) * 100),
  }
}

/**
 * How much of the whole cycle is marked, counting only working days.
 *
 * Sundays are excluded from the denominator because they can never be filled —
 * including them would cap a fully-marked month at about 85%, which reads as
 * unfinished work.
 */
export function cycleProgress(
  studentIds: string[],
  scores: HomeworkScores,
  days: HomeworkDay[],
): HomeworkProgress {
  const workingDays = days.filter((d) => !d.isSunday)
  const cells = studentIds.length * workingDays.length
  let scored = 0

  for (const id of studentIds) {
    for (const day of workingDays) {
      if (markValue(scores[id]?.[day.dayNum]) !== null) scored += 1
    }
  }

  return {
    total: cells,
    scored,
    missing: cells - scored,
    percent: cells === 0 ? 0 : Math.round((scored / cells) * 100),
  }
}

/** Cell key for the unsaved-changes set — `studentId:dayOfMonth`. */
export function cellKey(studentId: string, dayNum: number): string {
  return `${studentId}:${dayNum}`
}
