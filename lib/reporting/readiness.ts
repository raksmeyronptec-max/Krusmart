/**
 * Is the document about to be generated actually going to say anything?
 *
 * ── The question this answers, and the one it refuses to ──────────────────
 *
 * A teacher pressing បង្កើត is asking "will this sheet be useful?", and the
 * three counts beside the button answer it only by implication: `៣៥ សិស្ស ·
 * ៨ មុខវិជ្ជា` is compatible with a completely blank grid, which is exactly the
 * document a teacher then hands to a class.
 *
 * So this DESCRIBES the resolved payload — how many of the rows that will be
 * written actually carry a value — and says so in words. It is deliberately not
 * a rule about whether a document *may* be produced: an empty register is a
 * legitimate thing to print and fill in by hand, a part-marked month is a
 * legitimate mid-month snapshot, and the product has always allowed both. This
 * never blocks generation; `GenerateReportDialog` keeps its button enabled in
 * every state below.
 *
 * It invents no business rule. `filledRows` is counted from the payload the
 * resolver already built, by the one definition a document can be held to:
 * a row is filled if the document would print something in it. Nothing here
 * re-reads the database, re-derives an average, or decides what a mark means —
 * all of that has happened by the time this is called.
 *
 * Pure, relative imports with extensions, no `server-only` and no `next/*`: the
 * server computes it from the payload, the browser renders it, and the node
 * harness runs it.
 */

import type { ReportCategory, RowBasis } from './report-types.ts'

export type ReadinessLevel =
  | 'ready'
  | 'partial'
  | 'empty'
  | 'no_students'
  /** A qualifying-subset report that nobody qualified for. Not a data problem. */
  | 'none_qualified'

export interface ReadinessInput {
  /** Pupils in the scope the document covers, as the resolver counted them. */
  studentCount: number
  /** Rows the payload holds at all. */
  rowCount: number
  /** Rows of the resolved payload that carry at least one value. */
  filledRows: number
  /** Columns the variable region will expand to, where the report has one. */
  subjectCount: number
  category: ReportCategory
  /**
   * What the rows ARE, declared by the catalogue.
   *
   * Load-bearing, and the reason this is an input rather than an assumption:
   * `filledRows < studentCount` means "part of the class is unmarked" for a
   * register and means nothing at all for an honour roll, whose rows are the
   * pupils who qualified. Reading the second as the first told a fully marked
   * class of thirty that it had no marks.
   */
  basis: RowBasis
}

export interface Readiness {
  level: ReadinessLevel
  /** One short line, in Khmer. */
  title: string
  /** What will happen if they generate anyway. Never a threat, never a block. */
  detail: string
  /**
   * Which screen fixes it, as a route with no class parameter.
   *
   * The CALLER adds the class through `withClassParam`, because this module is
   * pure and must not learn what a class id is. `null` where there is nothing
   * to fix — a class with no pupils is fixed on a different screen from a class
   * with no marks, and neither is fixed from here.
   */
  fixHref: string | null
  fixLabel: string | null
}

/**
 * What the document's subject is called, so the sentence reads like the screen
 * the teacher would go to. Attendance is the one category whose missing data is
 * not marks; everything else in this product that has a variable region is
 * marks of some kind.
 */
function subjectOfData(category: ReportCategory): {
  noun: string
  fixHref: string | null
  fixLabel: string | null
} {
  if (category === 'attendance') {
    return { noun: 'ទិន្នន័យវត្តមាន', fixHref: '/attendance/layout', fixLabel: 'ទៅចុះវត្តមាន' }
  }
  return { noun: 'ពិន្ទុ', fixHref: '/score/enter', fixLabel: 'ទៅបញ្ចូលពិន្ទុ' }
}

const READY: Readiness = {
  level: 'ready',
  title: 'ទិន្នន័យរួចរាល់',
  detail: '',
  fixHref: null,
  fixLabel: null,
}

export function documentReadiness(input: ReadinessInput): Readiness {
  const { noun, fixHref, fixLabel } = subjectOfData(input.category)

  /*
   * A report whose rows do not come from the payload at all — the TPP master
   * carries its data in `meta` — cannot be judged here. Silence is the only
   * honest output; a warning derived from an empty `rows` array would fire on
   * every generation of a document that is perfectly complete.
   */
  if (input.basis === 'other') return READY

  /*
   * A qualifying-subset report is not incomplete when it is empty: nobody met
   * the rule, which is a result and often the expected one. It gets its own
   * level, no comparison against the roster, and NO fix link — the screen that
   * "fixes" an empty honour roll is not a screen.
   */
  if (input.basis === 'selection') {
    if (input.rowCount > 0) return READY
    return {
      level: 'none_qualified',
      title: 'មិនមានសិស្សចូលលក្ខណៈ',
      detail: 'ឯកសារនឹងចេញដោយគ្មានឈ្មោះសិស្ស។',
      fixHref: null,
      fixLabel: null,
    }
  }

  if (input.studentCount === 0) {
    return {
      level: 'no_students',
      title: 'មិនទាន់មានសិស្សក្នុងថ្នាក់',
      detail: 'ឯកសារនឹងចេញជាទម្រង់ទទេសម្រាប់បំពេញដោយដៃ។',
      fixHref: '/enrollment',
      fixLabel: 'ទៅបញ្ចូលសិស្ស',
    }
  }

  if (input.filledRows === 0) {
    return {
      level: 'empty',
      title: `មិនទាន់មាន${noun}`,
      detail: 'ឯកសារនឹងចេញជាទម្រង់ទទេ។',
      fixHref,
      fixLabel,
    }
  }

  if (input.filledRows < input.studentCount) {
    return {
      level: 'partial',
      title: `មាន${noun}មិនទាន់ពេញលេញ`,
      // The product's existing semantics, stated rather than changed: a
      // part-marked period prints what exists and leaves the rest blank.
      detail: 'ឯកសារនឹងបង្ហាញតែទិន្នន័យដែលមាន។',
      fixHref,
      fixLabel,
    }
  }

  return READY
}

/**
 * A separate, quieter problem: the class teaches nothing this document can
 * print columns for.
 *
 * Kept out of `documentReadiness` because it is orthogonal — a class can have a
 * full month of marks and an unconfigured template, or an empty month and a
 * complete one — and folding them into one ladder would hide whichever came
 * second.
 *
 * `hasRegion` is the caller's, from the catalogue. A report with no variable
 * subject region has `subjectCount === 0` permanently and correctly — the
 * certificate is a page of prose, the promotion lists are fixed tables — and
 * reading that as "configure your subjects" sent teachers to `/score/subjects`
 * to fix a document that has never had a subject column.
 */
export function subjectsMissing(input: {
  subjectCount: number
  hasRegion: boolean
}): boolean {
  return input.hasRegion && input.subjectCount === 0
}
