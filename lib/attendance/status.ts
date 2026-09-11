/**
 * What a mark on the register means.
 *
 * ── The defect this closes ────────────────────────────────────────────────
 *
 * `attendance.status` is a TEXT column with no CHECK constraint and four values
 * in play. Nothing declared what they mean, so **eleven surfaces each decided
 * for themselves**, and they did not agree:
 *
 *   ច្បាប់ / `L`   the entry screen's own button says ច្បាប់ — absent WITH the
 *                 school's permission. `/students/[id]`, the monthly register
 *                 (it prints "ច"), the yearly sheet (its own ច្ប column), the
 *                 printed parent report and the reporting engine all read it
 *                 that way. **The parent portal reads it as "late" and counts
 *                 it as attending.** A pupil the teacher recorded as away with
 *                 permission is shown to their own parent as present.
 *
 *   `AP`          declared by the type, produced by no writer, and read by
 *                 five surfaces as an absence — while five others drop it
 *                 silently. So a legacy row is an absence on the yearly sheet
 *                 and the record book, and invisible on the dashboard, the
 *                 pupil page, the monthly register and the parent report.
 *
 * The rate was the sharpest form of it: `/parent-report` computes
 * `present / (present + excused + absent)` and the parent portal computes
 * `(present + late) / total`. The same pupil, the same rows, two numbers —
 * one on the sheet the teacher hands over, the other on the portal the parent
 * signs into.
 *
 * ── The rule ──────────────────────────────────────────────────────────────
 *
 * `inClass` is the only question a rate may ask, and only `P` answers yes. An
 * absence is an absence whether or not it was permitted; `excused` says which
 * kind it was, and is what the ministry registers column separately.
 *
 * `AP` is a synonym of `L` that this application never writes. It is read
 * because rows may exist from the build that preceded these screens, and it is
 * kept out of `ENTRY_MARKS` because offering a teacher two spellings of one
 * mark is how the disagreement started.
 *
 * Pure and node-loadable — `scripts/verify-attendance.mts` runs it, and both
 * the teacher app and the parent portal import it. Keep it free of
 * `server-only` and of `next/*`.
 */

/** The four marks a register can carry. */
export type AttendanceStatus = 'P' | 'L' | 'A' | 'AP'

export interface AttendanceMark {
  code: AttendanceStatus
  /** What a teacher calls it. */
  label: string
  /** The single character the ministry registers print. */
  short: string
  /**
   * Was the pupil in class? The only question an attendance RATE may ask.
   * `L` is false: permission excuses an absence, it does not undo it.
   */
  inClass: boolean
  /** Absences only — was it permitted? Meaningless when `inClass`. */
  excused: boolean
}

export const ATTENDANCE_MARKS: readonly AttendanceMark[] = [
  { code: 'P',  label: 'មក',        short: '✓', inClass: true,  excused: false },
  { code: 'L',  label: 'ច្បាប់',    short: 'ច', inClass: false, excused: true  },
  { code: 'A',  label: 'អវត្តមាន',  short: 'អ', inClass: false, excused: false },
  /*
   * Legacy synonym of `L`. Read, never written — see the note above.
   *
   * It carries `L`'s label, not a second one. It used to read `សុំច្បាប់`,
   * which meant the product had TWO Khmer words for one declared fact and
   * showed whichever the stored spelling happened to select — so the same
   * permitted absence printed as ច្បាប់ or as សុំច្បាប់ depending on which
   * build had written the row. Every other field here is already identical to
   * `L`'s; the label is now too. No stored row changes meaning: `inClass` and
   * `excused` are untouched, and nothing has ever written `AP`.
   */
  { code: 'AP', label: 'ច្បាប់',    short: 'ច', inClass: false, excused: true  },
] as const

/**
 * The marks a teacher may enter.
 *
 * Three, not four: `AP` means exactly what `L` means, and a register offering
 * both would let two teachers record the same fact two ways.
 */
export const ENTRY_MARKS: readonly AttendanceMark[] = ATTENDANCE_MARKS.filter(
  (m) => m.code !== 'AP',
)

const BY_CODE = new Map<string, AttendanceMark>(ATTENDANCE_MARKS.map((m) => [m.code, m]))

/**
 * May a teacher's client store this value?
 *
 * ── The hole this closes (Phase 17 D3) ────────────────────────────────────
 *
 * `attendance.status` is free `TEXT` with no `CHECK` constraint, and
 * `saveAttendance` passed its `status: string` parameter straight into the
 * upsert. The three buttons on the register were the only thing standing
 * between the column and any string at all. Demonstrated against the live
 * stack: an authenticated teacher `PATCH`ed a row to `status: "late123"`, the
 * database accepted it, and `/students/[id]` then printed **late123** verbatim
 * as that pupil's mark for the day, beside a real one.
 *
 * The readers degrade safely — `markFor` returns `null`, so the row counts as
 * `unknown` and stays out of every rate — but "safely ignored" is not the same
 * as "rejected", and a register is the wrong place to keep a value nothing can
 * interpret.
 *
 * `ENTRY_MARKS`, not `ATTENDANCE_MARKS`: `AP` is readable legacy, never
 * writable. A client that offers it is offering a second spelling of ច្បាប់,
 * which is the disagreement this module exists to prevent.
 */
export function isEnterableStatus(status: unknown): status is AttendanceStatus {
  return typeof status === 'string' && ENTRY_MARKS.some((m) => m.code === status)
}

/**
 * The meaning of a stored status, or `null` when it is not one of ours.
 *
 * Tolerant on purpose: the column is free TEXT, so a value written by a build
 * that is no longer here must resolve to "unknown" rather than being counted as
 * something it is not.
 */
export function markFor(status: string | null | undefined): AttendanceMark | null {
  if (!status) return null
  return BY_CODE.get(status) ?? null
}

/** Is this row an absence — permitted or otherwise? */
export function isAbsence(status: string | null | undefined): boolean {
  const m = markFor(status)
  return m !== null && !m.inClass
}

export interface AttendanceTally {
  /** Days in class. */
  present: number
  /** Absent with permission — `L` and its legacy synonym. */
  excused: number
  /** Absent without. */
  unexcused: number
  /** `excused + unexcused`. */
  absent: number
  /** Rows carrying a status this module recognises. The rate's denominator. */
  marked: number
  /** Rows whose status is not one of the four. Never silently folded in. */
  unknown: number
  /** Percentage in class, to one decimal, or `null` when nothing is recorded. */
  rate: number | null
}

/**
 * Count a set of attendance rows, once, the same way everywhere.
 *
 * The denominator is the days actually RECORDED, not the days in the month: a
 * register that has been kept for nine days of a twenty-day month describes
 * nine days, and dividing by twenty would report a truancy nobody observed.
 */
export function tallyAttendance(
  rows: readonly { status?: string | null }[],
): AttendanceTally {
  let present = 0, excused = 0, unexcused = 0, unknown = 0

  for (const row of rows) {
    const m = markFor(row.status)
    if (m === null) { unknown++; continue }
    if (m.inClass) present++
    else if (m.excused) excused++
    else unexcused++
  }

  const absent = excused + unexcused
  const marked = present + absent
  return {
    present, excused, unexcused, absent, marked, unknown,
    rate: marked ? Math.round((present / marked) * 1000) / 10 : null,
  }
}
