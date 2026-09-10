// Relative, with the extension, so node can load this module directly — the
// same shape `lib/scores/semester.ts` uses, for the same reason.
import type { EffectiveSubject } from './template.ts'

/**
 * How far through marking a class is, for one period.
 *
 * ── Why this is a module and not a screen's private loop ──────────────────
 *
 * "Which subjects are in, and which are still missing" is asked in two places
 * that must agree: `/score/collect`, the homeroom teacher's completion view,
 * and the dashboard, which has to answer "what does this teacher still need to
 * do for this class today". The counting rules are the interesting part and all
 * three of them are easy to get subtly wrong:
 *
 *   a mark is a mark      `score_value` OR `score_text` — the four `sem_eval_*`
 *                         columns are Khmer words, and counting only the
 *                         numeric column would report a fully-marked subject as
 *                         empty (see `lib/utils/score-value.ts` for the column
 *                         pair that exists precisely because of this).
 *   count pupils, not rows a subject with seven columns is not seven times as
 *                         marked. A pupil carrying **any** of its columns
 *                         counts once, which is why the index below is built by
 *                         column id and then folded up per subject.
 *   the denominator is the roster, not the marks — a subject nobody has touched
 *                         must read `0 / 42`, never `0 / 0` and certainly never
 *                         "complete".
 *
 * Pure and isomorphic: the server action and the dashboard's query layer both
 * bring their own rows and get the same answer. Keep it free of `server-only`.
 */

export type CompletionStatus = 'complete' | 'partial' | 'empty'

/**
 * A `scores` row, reduced to what completion needs.
 *
 * `subject` is a `SubjectColumn.id` — the column, not the `subject_key`. That
 * distinction is the one CLAUDE.md warns about: `scores.subject` stores the
 * column id, and folding it up to a subject is what `subjectProgress` does.
 */
export interface MarkRow {
  student_id: string
  subject: string
  teacher_id?: string | null
  score_value?: number | null
  score_text?: string | null
}

/** A mark exists when either column carries a value. */
export function isMarked(row: MarkRow): boolean {
  if (row.score_value !== null && row.score_value !== undefined) return true
  return typeof row.score_text === 'string' && row.score_text !== ''
}

export interface SubjectProgress {
  subjectKey: string
  label: string
  /** Distinct pupils carrying at least one mark in this subject. */
  entered: number
  /** Roster size — the denominator, always. */
  total: number
  status: CompletionStatus
  /** Teachers who actually entered a mark here, assigned or not. */
  contributorIds: string[]
}

/**
 * Per-subject progress for one period.
 *
 * `rows` must already be narrowed to the period and the roster; this decides
 * nothing about *which* marks count as in scope, only how the ones it is given
 * add up. Keeping the query out of here is what lets the dashboard reuse rows
 * it had already fetched for something else.
 */
export function subjectProgress(
  subjects: readonly EffectiveSubject[],
  rows: readonly MarkRow[],
  rosterSize: number,
): SubjectProgress[] {
  // Indexed by column id first, so a multi-column subject counts a pupil once.
  const byColumn = new Map<string, { pupils: Set<string>; teachers: Set<string> }>()
  for (const row of rows) {
    if (!isMarked(row)) continue
    let bucket = byColumn.get(row.subject)
    if (!bucket) {
      bucket = { pupils: new Set(), teachers: new Set() }
      byColumn.set(row.subject, bucket)
    }
    bucket.pupils.add(row.student_id)
    if (row.teacher_id) bucket.teachers.add(row.teacher_id)
  }

  return subjects.map((subject) => {
    const pupils = new Set<string>()
    const contributors = new Set<string>()
    for (const col of subject.columns) {
      const bucket = byColumn.get(col.id)
      if (!bucket) continue
      bucket.pupils.forEach((p) => pupils.add(p))
      bucket.teachers.forEach((t) => contributors.add(t))
    }

    const entered = pupils.size
    return {
      subjectKey: subject.subjectKey,
      label: subject.labelKm,
      entered,
      total: rosterSize,
      // `entered >= rosterSize` rather than `===`: a pupil who left the class
      // mid-period can still carry a mark, and a subject reading 43/42 is
      // finished, not broken.
      status: entered === 0 ? 'empty' : entered >= rosterSize ? 'complete' : 'partial',
      contributorIds: [...contributors],
    }
  })
}

/**
 * How many pupils carry a mark across a SET of subjects — the entry screen's
 * question, and the one figure this module was missing.
 *
 * ── Why it belongs here ───────────────────────────────────────────────────
 *
 * `/score/enter` had its own copy, and the copy disagreed. It counted a pupil
 * as entered when a **numeric** cell in a **non-`select`** column carried a
 * value; `isMarked` counts `score_text` as a mark, because the `sem_eval_*`
 * columns are Khmer words and a rated pupil is a marked pupil (migration
 * 00012). So a pupil marked only with a rating read as *done* on
 * `/score/collect` and the dashboard, and as *not started* on the very screen
 * the teacher was typing into.
 *
 * The module header of this file says marking progress is "counted once for two
 * screens". There were three. This is the third.
 *
 * ── Why it is not `subjectProgress` ───────────────────────────────────────
 *
 * `subjectProgress` answers "for each subject, how many pupils" — the right
 * question for `/score/collect`, which lists subjects. The entry grid shows one
 * period's columns and asks "how many of my pupils have I got through", which is
 * a UNION across the displayed subjects, not a sum: a pupil marked in two of
 * them is one pupil, and summing would count them twice.
 *
 * For a single subject the two must agree exactly, and
 * `scripts/verify-score-workspace.mts` asserts that they do.
 */
export function rosterProgress(
  subjects: readonly EffectiveSubject[],
  rows: readonly MarkRow[],
  rosterSize: number,
): { entered: number; total: number; percent: number } {
  const columns = new Set(subjects.flatMap((s) => s.columns.map((c) => c.id)))
  const pupils = new Set<string>()

  for (const row of rows) {
    if (!columns.has(row.subject)) continue
    if (!isMarked(row)) continue
    pupils.add(row.student_id)
  }

  // Clamped for the reason `completionSummary` clamps: a pupil who left the
  // class mid-period can still carry a mark, and a bar past 100% reads as a bug.
  const entered = Math.min(pupils.size, rosterSize)
  return {
    entered,
    total: rosterSize,
    percent: rosterSize === 0 ? 0 : Math.round((entered / rosterSize) * 100),
  }
}

export interface CompletionSummary {
  /** Subjects the class is expected to mark this period. */
  subjects: number
  complete: number
  partial: number
  empty: number
  /**
   * Cells entered over cells expected, 0–100.
   *
   * Cell-based rather than subject-based on purpose: "3 of 11 subjects
   * complete" hides the difference between a class that has barely started and
   * one that is a handful of pupils short across the board. With no roster and
   * no subjects there is nothing to be a fraction of, and the answer is 0 —
   * never `NaN`, which would render as a blank bar that looks like a bug.
   */
  percent: number
}

export function completionSummary(progress: readonly SubjectProgress[]): CompletionSummary {
  let complete = 0
  let partial = 0
  let empty = 0
  let entered = 0
  let expected = 0

  for (const p of progress) {
    if (p.status === 'complete') complete += 1
    else if (p.status === 'partial') partial += 1
    else empty += 1
    // Clamped: a subject over its roster must not push the bar past 100%.
    entered += Math.min(p.entered, p.total)
    expected += p.total
  }

  return {
    subjects: progress.length,
    complete,
    partial,
    empty,
    percent: expected === 0 ? 0 : Math.round((entered / expected) * 100),
  }
}
