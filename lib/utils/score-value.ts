import type { Score } from '@/lib/types'

/**
 * Reading and writing a `scores` cell, which may hold a number or a word.
 *
 * `scores.score_value` is NUMERIC, but four semester columns —
 * `sem_eval_knowledge`, `sem_eval_skill`, `sem_eval_moral`,
 * `sem_eval_participate` — are rated with Khmer words picked from a dropdown.
 * Coercing those with `parseFloat` produced NaN, which `JSON.stringify` renders
 * as `null`, so the rating was written to the database as NULL and the teacher
 * was shown a success toast. Migration 00012 added `score_text` for them.
 *
 * Everything that touches a cell goes through this module so the two columns
 * cannot drift apart again.
 */

/**
 * Split a raw cell into the two columns.
 *
 * The decision is made from the value itself rather than from a per-subject
 * list: anything that parses as a finite number is numeric, anything else that
 * is non-empty is text. That way a subject added later — a custom subject with
 * a dropdown, say — is stored correctly without touching this file.
 */
export function splitScoreCell(raw: string | number | null | undefined): {
  score_value: number | null
  score_text: string | null
} {
  if (raw === null || raw === undefined) return { score_value: null, score_text: null }

  if (typeof raw === 'number') {
    return Number.isFinite(raw)
      ? { score_value: raw, score_text: null }
      : { score_value: null, score_text: null }
  }

  const trimmed = raw.trim()
  if (trimmed === '') return { score_value: null, score_text: null }

  // `Number` rather than `parseFloat`: parseFloat('7ល្អ') is 7, which would
  // silently truncate a value the teacher typed rather than storing it whole.
  const num = Number(trimmed)
  return Number.isFinite(num)
    ? { score_value: num, score_text: null }
    : { score_value: null, score_text: trimmed }
}

/** The value to display in a cell, whichever column it landed in. */
export function scoreCellValue(row: Pick<Score, 'score_value' | 'score_text'>): number | string | null {
  if (row.score_value !== null && row.score_value !== undefined) return row.score_value
  return row.score_text ?? null
}

/**
 * The numeric value of a cell for averaging, or `null` when it has none.
 *
 * Behavioural ratings are deliberately excluded from arithmetic — they are
 * descriptions, not marks, and the semester grid already flags those columns
 * `isText` so they sit outside the average.
 */
export function scoreNumericValue(row: Pick<Score, 'score_value' | 'score_text'>): number | null {
  return row.score_value !== null && row.score_value !== undefined ? Number(row.score_value) : null
}
