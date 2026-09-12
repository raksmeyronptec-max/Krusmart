/**
 * The period the Print Center is currently about, resolved once.
 *
 * ── Why this module exists ────────────────────────────────────────────────
 *
 * The centre used to ask for the period inside every report's dialog and
 * nowhere else, which made the index period-blind: twenty-seven rows, eleven of
 * which mean something different in ខែកញ្ញា than in ខែធ្នូ, and not one of them
 * said which. A teacher could only discover the month by opening a document,
 * and could only change it one document at a time.
 *
 * The period is page context now — one control above the list — so a row can
 * say `ខែកញ្ញា ២០២៦` before it is opened and the dialog opens on what the page
 * was already showing. That only works while three surfaces agree on the words:
 * the row's meta line, the quick-print card, and the dialog's own header. This
 * module is the one place that turns a selection into a value and a phrase, so
 * they cannot drift.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * It invents no vocabulary. The three rungs and their Khmer labels come from
 * `lib/scores/workspace.ts` — the same ladder `/score/enter`, `/score/total`
 * and `/ranking` render — and the semester's name from `lib/scores/semester.ts`.
 * A fourth word for `annual` is exactly what that module was written to stop.
 *
 * It is also not authority: the `value` it produces is the same string the
 * dialog has always sent, and the server re-resolves the class and the roster
 * regardless.
 *
 * Pure, relative imports with extensions, no `server-only` and no `next/*` —
 * the browser renders it and the node harness imports it.
 */

import { resolveCalendarYear } from '../constants/academic.ts'
import {
  MONTHS_BY_CALENDAR,
  MONTH_LABEL_BY_ID,
  isMonthId,
  type MonthId,
} from '../constants/months.ts'
import { semesterLabel, type SemesterId } from '../scores/semester.ts'
import { type ScoreScope } from '../scores/workspace.ts'
import { toKhmerNumber } from '../utils/khmer-num.ts'
import type { PeriodKind } from './report-types.ts'

/** What the period bar holds. One selection, whichever rung is showing. */
export interface PeriodSelection {
  scope: ScoreScope
  month: MonthId
  semester: SemesterId
}

/**
 * The rung a report reads, or `null` for one that reads none.
 *
 * `PeriodKind` is the catalogue's word for the same three rungs plus `none`;
 * `ScoreScope` is the score workspace's. Mapping rather than re-declaring keeps
 * `annual`/`year` from becoming a fourth and fifth name for the year.
 */
export function scopeForPeriodKind(kind: PeriodKind): ScoreScope | null {
  if (kind === 'month') return 'monthly'
  if (kind === 'semester') return 'semester'
  if (kind === 'year') return 'annual'
  return null
}

/** The academic year, as a teacher reads it: `ឆ្នាំសិក្សា ២០២៥-២០២៦`. */
export function academicYearLabel(academicYear: string): string {
  return `ឆ្នាំសិក្សា ${toKhmerNumber(academicYear)}`
}

/**
 * `ខែកញ្ញា ២០២៦` — the month, and the calendar year it actually falls in.
 *
 * The year matters and is easy to drop: the school year runs វិច្ឆិកា → តុលា, so
 * ខែកញ្ញា of `2025-2026` is September **2026** while ខែធ្នូ of the same year is
 * December 2025. A month printed without its year is ambiguous exactly once a
 * year, in the two months where it matters most.
 */
export function monthLabel(month: MonthId, academicYear: string): string {
  const spec = MONTHS_BY_CALENDAR.find((m) => m.id === month)
  const year = resolveCalendarYear(academicYear, spec?.isNextYear ?? true)
  return `ខែ${MONTH_LABEL_BY_ID[month] ?? ''} ${toKhmerNumber(year)}`
}

export interface ResolvedPeriod {
  /** The string the resolver expects — a month id, a semester id, or the year. */
  value: string
  /** What the teacher is told the document covers. */
  label: string
}

/**
 * What a given report would cover, under the page's current selection.
 *
 * A report reads ONE rung — declared by its own `period` — so the selection's
 * other two values are ignored rather than guessed at. A `none` report covers
 * the year it is filed under, and says so as `គ្រប់ពេល`: it is not a claim about
 * a month, and printing one would be an invented scope.
 */
export function resolvePeriod(
  kind: PeriodKind,
  selection: PeriodSelection,
  academicYear: string,
): ResolvedPeriod {
  if (kind === 'month') {
    return { value: selection.month, label: monthLabel(selection.month, academicYear) }
  }
  if (kind === 'semester') {
    return { value: selection.semester, label: semesterLabel(selection.semester) }
  }
  if (kind === 'year') {
    return { value: academicYear, label: academicYearLabel(academicYear) }
  }
  return { value: academicYear, label: 'គ្រប់ពេល' }
}

/**
 * The month to open on: the one the teacher is living in.
 *
 * Resolved from a date rather than pinned to `nov`, which is what the flow used
 * to default to — the first month of the academic year, and the wrong answer
 * for eleven months out of twelve. Every calendar month is a valid academic
 * month, so the fallback is unreachable in practice and kept only so the
 * function is total.
 *
 * Called on the SERVER and passed down, never computed during a client render:
 * a `new Date()` in a component renders one month on the server and possibly
 * another on the client, which React reports as a hydration mismatch.
 */
export function currentMonthId(date: Date = new Date()): MonthId {
  const spec = MONTHS_BY_CALENDAR.find((m) => m.index === date.getMonth())
  return spec?.id ?? 'nov'
}

/** Guard for a month arriving from a request, re-exported so callers need one import. */
export function asMonthId(value: string | null | undefined): MonthId | null {
  return value && isMonthId(value) ? value : null
}
