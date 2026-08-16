/**
 * The colour language of a mark.
 *
 * Both score screens now paint a cell by how good the mark is — red below the
 * pass mark, amber for a bare pass, green for a solid one, brand for
 * excellence. Written once here because the entry grid and the totals table
 * must agree: a 6.5 that reads amber on `/score/enter` cannot read green on
 * `/score/total`.
 *
 * The thresholds are derived from the grading scheme rather than hard-coded, so
 * a school that moves its pass mark moves the colours with it. `gradeFor` stays
 * the authority on the *letter*; this module only decides the paint, and the
 * letter is always rendered alongside — colour is never the only signal
 * (WCAG 1.4.1), which is also why a colour-blind teacher still sees `A`/`F`.
 *
 * Pure and dependency-light: safe from server components and client alike.
 */

import { DEFAULT_SCHEME_CONFIG, gradeFor, type GradingSchemeConfig } from '@/lib/grading/scheme'

export type ScoreBand = 'excellent' | 'good' | 'pass' | 'fail' | 'none'

export interface ScoreBandStyle {
  /** Cell / pill fill plus text, for a read-only badge. */
  pill: string
  /** Input background + border, for an editable cell holding this mark. */
  field: string
  /** Bare text colour, for the large numbers in a summary. */
  text: string
  /** Left rail on a table row. */
  rail: string
}

const STYLES: Record<ScoreBand, ScoreBandStyle> = {
  excellent: {
    pill: 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300',
    field: 'border-brand bg-brand-100/70 text-brand-800 dark:bg-brand-900/30 dark:text-brand-300',
    text: 'text-brand',
    rail: 'border-l-4 border-l-brand',
  },
  good: {
    pill: 'bg-success/10 text-success',
    field: 'border-success bg-success/10 text-success',
    text: 'text-success',
    rail: 'border-l-4 border-l-success',
  },
  pass: {
    pill: 'bg-warning/10 text-warning',
    field: 'border-warning bg-warning/10 text-warning',
    text: 'text-warning',
    rail: 'border-l-4 border-l-warning',
  },
  fail: {
    pill: 'bg-danger/10 text-danger',
    field: 'border-danger bg-danger/10 text-danger',
    text: 'text-danger',
    rail: 'border-l-4 border-l-danger',
  },
  none: {
    pill: 'bg-paper text-text-muted',
    field: 'border-divider bg-bg-surface text-text-heading',
    text: 'text-text-muted',
    rail: 'border-l-4 border-l-transparent',
  },
}

/**
 * Which band a mark falls in.
 *
 * `pass` and `good` split the passing range at 70% of the scale — the point the
 * default ladder calls a C — so the middle of the class is visually distinct
 * from the top of it. A missing mark is `none`, never `fail`: a student who has
 * not been assessed has not failed.
 */
export function bandFor(
  value: number | null | undefined,
  config: GradingSchemeConfig = DEFAULT_SCHEME_CONFIG,
): ScoreBand {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'none'
  if (value >= config.maxScore * 0.9) return 'excellent'
  if (value >= config.maxScore * 0.7) return 'good'
  if (value >= config.passMark) return 'pass'
  return 'fail'
}

/** Tailwind classes for a band. */
export function bandStyle(band: ScoreBand): ScoreBandStyle {
  return STYLES[band]
}

/** Shorthand: classes straight from a value. */
export function styleFor(
  value: number | null | undefined,
  config?: GradingSchemeConfig,
): ScoreBandStyle {
  return STYLES[bandFor(value, config)]
}

/**
 * A cell as typed by the teacher, read back as a number.
 *
 * Grid state holds raw strings — `''` while a field is being cleared, a Khmer
 * word for the behavioural columns. Anything that is not a finite number is not
 * a mark, and returns null rather than 0.
 */
export function numericCell(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isFinite(n) ? n : null
}

/** The letter for a mark, or `—` when there is no mark to grade. */
export function letterOrDash(value: number | null | undefined): string {
  return gradeFor(value)?.letter ?? '—'
}

/** `7.25` → `7.25`, `7` → `7`, null → `—`. Two decimals at most, no trailing zeros. */
export function formatMark(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return String(Math.round(value * 100) / 100)
}
