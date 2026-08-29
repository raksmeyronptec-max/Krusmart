/**
 * What a score period is, in one place.
 *
 * The academic year and its semester split were compiled in — five months in
 * the first half, applied from a constant in `semester.ts` — which a teacher
 * who collects marks on their own dates, or counts មីនា-មេសា as one period,
 * had no way to change. This module makes the calendar data: twelve default
 * periods that reproduce today's behaviour exactly, overridable per school or
 * per class through `score_calendar_periods` (migration 00029).
 *
 * Pure, no React, no server-only imports: the client hook, the report resolver
 * and the verify scripts all consume it — same rule as `template.ts` and
 * `semester.ts`, because `scripts/verify-calendar.mts` runs it under plain node.
 *
 * ★ THE INVARIANT (INV-1): `scores.score_period` = `${monthId}-${academicYear}`
 * is schema — parsed back in at least five places (`report-data.ts`,
 * `students/[id]/queries.ts`, attendance/yearly, record-book, parent-report).
 * A merged period therefore stores under an ANCHOR: an existing `MonthId`, the
 * first month of the period in academic-year order. `ScorePeriod.key` is that
 * anchor and nothing else. Merging months changes labels and membership only;
 * no key like `'mar_apr'` may ever exist.
 */

// Relative and extension-qualified on purpose: the verify scripts run this
// module under plain node, which neither rewrites the `@/` alias nor resolves
// extensionless specifiers. Same reason `lib/scores/semester.ts` does it.
import { MONTHS_BY_ACADEMIC_YEAR, MONTHS_BY_CALENDAR, MONTH_LABEL_BY_ID, isMonthId } from '../constants/months.ts'
import type { MonthId } from '../constants/months.ts'
// Type-only on purpose: `semester.ts` imports `DEFAULT_CALENDAR` back from
// this file, and a value import here would close that cycle at runtime.
import type { SemesterId } from './semester.ts'

/** One score-collection period of an academic year. */
export interface ScorePeriod {
  /**
   * ★ The left half of `scores.score_period`. Schema — see the module header.
   * For a merged period this is the first member in academic-year order.
   */
  key: MonthId
  /** Display label: the month's name, or `deriveLabel(members)` when merged. */
  labelKm: string
  /** Every month this period covers, `key` included. Never empty. */
  members: MonthId[]
  semester: SemesterId
  /** Advisory collection window (INV-4): guides defaults and locking, never part of a key. */
  startsOn: string | null
  endsOn: string | null
  /** A locked period accepts no further score writes (enforced from P6). */
  locked: boolean
  sortOrder: number
}

/**
 * A `score_calendar_periods` row (migration 00029), as PostgREST returns it.
 *
 * Defined here rather than in `lib/types.ts` because this pure module must
 * stay importable under plain node; `lib/types.ts` should re-export it rather
 * than redefine it, so the one-type-per-table convention still holds.
 */
export interface ScoreCalendarPeriodRow {
  id: string
  scope: 'school' | 'class'
  school_id: string | null
  class_id: string | null
  academic_year: string
  month_key: string
  member_months: string[]
  label_km: string | null
  semester: SemesterId
  starts_on: string | null
  ends_on: string | null
  locked_at: string | null
  locked_by: string | null
  sort_order: number
}

/** Position of each month in the academic year (nov = 0 … oct = 11). */
const ACADEMIC_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS_BY_ACADEMIC_YEAR.map((m, i) => [m.id, i]),
)

/**
 * Five months in the first semester (វិច្ឆិកា–មីនា) preserves the set
 * `/score/total` has always defaulted to. Moved here from `semester.ts`, which
 * now delegates — the split still comes from `MONTHS_BY_ACADEMIC_YEAR`, never
 * a hand-typed list: a hand-typed list is how the original bug (one list
 * applied to both semesters) happened.
 */
const FIRST_SEMESTER_LENGTH = 5

/**
 * The calendar every class starts from: twelve periods in academic-year order,
 * one month each, sem1 = the first five. Zero configuration rows resolve to
 * exactly this (INV-2), which is why it lives in code and is never seeded —
 * same principle as "a class with no selection resolves the full template".
 */
export const DEFAULT_CALENDAR: readonly ScorePeriod[] = MONTHS_BY_ACADEMIC_YEAR.map((m, i) => ({
  key: m.id,
  labelKm: m.label,
  members: [m.id],
  semester: i < FIRST_SEMESTER_LENGTH ? 'sem1' : 'sem2',
  startsOn: null,
  endsOn: null,
  locked: false,
  sortOrder: i,
}))

/**
 * `['mar','apr']` → `'មីនា-មេសា'`: the range from the first member to the last
 * in academic-year order. A single month is just its name.
 */
export function deriveLabel(members: MonthId[]): string {
  const sorted = [...members].sort((a, b) => (ACADEMIC_INDEX[a] ?? 0) - (ACADEMIC_INDEX[b] ?? 0))
  if (sorted.length === 0) return ''
  const first = MONTH_LABEL_BY_ID[sorted[0]] ?? sorted[0]
  if (sorted.length === 1) return first
  const last = MONTH_LABEL_BY_ID[sorted[sorted.length - 1]] ?? sorted[sorted.length - 1]
  return `${first}-${last}`
}

/**
 * One stored row → one period, or `null` for a row this module cannot trust.
 *
 * The write path validates with `validateCalendar` and Postgres enforces
 * `anchor_is_member`, so a rejected row cannot arrive through the app; the
 * guard is for direct SQL and for arbitrary input reaching the resolver.
 * A row is only dropped when its anchor is unusable — dropping a valid period
 * would hide its months' marks, which narrowing must never do.
 */
function rowToPeriod(row: ScoreCalendarPeriodRow): ScorePeriod | null {
  if (!isMonthId(row.month_key)) return null
  const members = row.member_months.filter(isMonthId)
  if (!members.includes(row.month_key)) members.push(row.month_key)
  members.sort((a, b) => ACADEMIC_INDEX[a] - ACADEMIC_INDEX[b])
  return {
    key: row.month_key,
    labelKm: row.label_km ?? deriveLabel(members),
    members,
    semester: row.semester,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    locked: row.locked_at !== null,
    sortOrder: row.sort_order,
  }
}

/**
 * The calendar in effect for one class: class rows → school rows →
 * `DEFAULT_CALENDAR`.
 *
 * The override is a WHOLE SET (INV-3), unlike `score_template_subjects` which
 * overrides per row — a calendar is a partition of twelve months, and merging
 * layers row-by-row could stitch two halves of different partitions into one
 * that double-counts a month. The first layer with any rows for the year wins
 * outright.
 */
export function resolveCalendar(
  rows: readonly ScoreCalendarPeriodRow[],
  ctx: { classId?: string; academicYear: string },
): ScorePeriod[] {
  const forYear = rows.filter((r) => r.academic_year === ctx.academicYear)

  const classRows = ctx.classId
    ? forYear.filter((r) => r.scope === 'class' && r.class_id === ctx.classId)
    : []
  const schoolRows = forYear.filter((r) => r.scope === 'school')
  const chosen = classRows.length > 0 ? classRows : schoolRows
  if (chosen.length === 0) return [...DEFAULT_CALENDAR]

  return chosen
    .map(rowToPeriod)
    .filter((p): p is ScorePeriod => p !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || ACADEMIC_INDEX[a.key] - ACADEMIC_INDEX[b.key])
}

/** The periods of one semester, in calendar order. */
export function periodsForSemester(cal: readonly ScorePeriod[], s: SemesterId): ScorePeriod[] {
  return cal.filter((p) => p.semester === s)
}

/**
 * The anchor keys of one semester — the replacement for `monthsForSemester`.
 *
 * ★ These are ANCHORS, not member months: a semester where មីនា-មេសា is one
 * period contributes `'mar'` once, which is exactly what makes the merged
 * period count once in `monthlyComponent`'s denominator.
 */
export function periodKeysForSemester(cal: readonly ScorePeriod[], s: SemesterId): MonthId[] {
  return periodsForSemester(cal, s).map((p) => p.key)
}

/** `Date` → local `'YYYY-MM-DD'`, comparable to `starts_on` / `ends_on`. */
function toIsoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * The period a date falls in — what the entry picker should default to
 * (INV-4: dates drive defaults, never keys).
 *
 * An explicit collection window wins; a period without one answers for its
 * member months by the calendar. `null` means the date's month is in no
 * period at all — a month the class does not collect marks in.
 */
export function periodForDate(cal: readonly ScorePeriod[], d: Date): ScorePeriod | null {
  const iso = toIsoDate(d)
  const dated = cal.find(
    (p) => p.startsOn !== null && p.endsOn !== null && p.startsOn <= iso && iso <= p.endsOn,
  )
  if (dated) return dated

  const monthId = MONTHS_BY_CALENDAR[d.getMonth()].id
  return cal.find((p) => p.members.includes(monthId)) ?? null
}

export type CalendarProblemCode =
  | 'invalid_month'
  | 'anchor_not_member'
  | 'overlap'
  | 'semester_not_contiguous'

export interface CalendarProblem {
  code: CalendarProblemCode
  /** User-facing, so Khmer — the form shows these verbatim. */
  messageKm: string
  periodKey?: string
  monthId?: string
}

const labelOf = (id: string) => MONTH_LABEL_BY_ID[id] ?? id

/**
 * Check a calendar the way Postgres cannot: across rows.
 *
 * Called on the client (before the save button enables) AND in the server
 * action (before the write) — the second call is the real boundary. Catches:
 * a month in more than one period (its marks would count twice in an average),
 * an anchor outside its own members, a semester that is not a contiguous block
 * of the academic year, and month ids that are not months.
 *
 * A month in NO period is deliberately not a problem: it means the class does
 * not collect marks that month (an exam month, say). It simply has no entry
 * cell and joins no average.
 */
export function validateCalendar(periods: ScorePeriod[]): CalendarProblem[] {
  const problems: CalendarProblem[] = []

  for (const p of periods) {
    // Runtime guards, not just types — a calendar posted to an action arrives
    // as strings the compiler never saw.
    if (!isMonthId(p.key)) {
      problems.push({
        code: 'invalid_month',
        monthId: p.key,
        messageKm: `'${p.key}' មិនមែនជាខែត្រឹមត្រូវទេ`,
      })
    }
    for (const m of p.members) {
      if (!isMonthId(m)) {
        problems.push({
          code: 'invalid_month',
          monthId: m,
          periodKey: p.key,
          messageKm: `'${m}' មិនមែនជាខែត្រឹមត្រូវទេ`,
        })
      }
    }
    if (!p.members.includes(p.key)) {
      problems.push({
        code: 'anchor_not_member',
        periodKey: p.key,
        messageKm: `ខែគោល ${labelOf(p.key)} មិនស្ថិតក្នុងសមាជិកនៃវគ្គរបស់វាទេ`,
      })
    }
  }

  // A month may belong to at most one period — the partition rule. Overlap
  // means a mark counts twice, which is the corruption this function exists
  // to refuse.
  const seen = new Map<string, MonthId>()
  for (const p of periods) {
    for (const m of p.members) {
      if (seen.has(m)) {
        problems.push({
          code: 'overlap',
          monthId: m,
          periodKey: p.key,
          messageKm: `${labelOf(m)} ស្ថិតក្នុងវគ្គច្រើនជាងមួយ — ពិន្ទុនឹងត្រូវរាប់ពីរដង`,
        })
      } else {
        seen.set(m, p.key)
      }
    }
  }

  // Each semester must be one contiguous block of the academic year: sorted by
  // earliest member, no sem1 period may follow a sem2 period.
  const position = (p: ScorePeriod) =>
    Math.min(...p.members.map((m) => ACADEMIC_INDEX[m] ?? 0), ACADEMIC_INDEX[p.key] ?? 0)
  const ordered = [...periods].sort((a, b) => position(a) - position(b))
  let seenSem2 = false
  for (const p of ordered) {
    if (p.semester === 'sem2') {
      seenSem2 = true
    } else if (seenSem2) {
      problems.push({
        code: 'semester_not_contiguous',
        periodKey: p.key,
        messageKm: `ឆមាសមិនជាប់គ្នាទេ៖ វគ្គ ${p.labelKm || labelOf(p.key)} (ឆមាសទី១) ស្ថិតក្រោយវគ្គឆមាសទី២`,
      })
    }
  }

  return problems
}
