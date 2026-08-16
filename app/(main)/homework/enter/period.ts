/**
 * The homework month — the 26th of one month to the 25th of the next.
 *
 * This is a MoEYS reporting rule, not a calendar month, and it is the single
 * thing about this screen that a reader is most likely to "fix" by accident.
 * Everything that depends on it lives here, pure and free of React, so the
 * client can be read without re-deriving the arithmetic.
 *
 * Three storage conventions are fixed by the database and must not drift — see
 * CLAUDE.md and `students/[id]/queries.ts`, which parses the same keys back:
 *
 *   score_type   `homework`
 *   score_period `${academicYear}_${monthId}`  — underscore, and the *academic*
 *                year on the left (`2025-2026_nov`), unlike the hyphen the
 *                monthly/semester/annual periods use.
 *   subject      `hw_<dayOfMonth>`
 *
 * `dayOfMonth` is unique within a cycle: the leading run is 26–28/29/30/31 and
 * the trailing run is 1–25, so the two can never collide.
 */

import { MONTHS_BY_CALENDAR, type MonthId } from '@/lib/constants/months'
import { isSunday } from '@/lib/constants/weekdays'

/** Calendar index (`Date#getMonth()`) for a month id. */
const MONTH_INDEX_BY_ID: Record<string, number> = Object.fromEntries(
  MONTHS_BY_CALENDAR.map((m) => [m.id, m.index]),
)

/** Month ids in calendar order, for indexing by `Date#getMonth()`. */
const MONTH_IDS_BY_INDEX: readonly MonthId[] = MONTHS_BY_CALENDAR.map((m) => m.id)

/** One editable (or blocked) day of a homework cycle. */
export interface HomeworkDay {
  /** Day of month. This is the `hw_<n>` key, and it is unique in a cycle. */
  dayNum: number
  date: Date
  /** Sundays are shown but never editable. */
  isSunday: boolean
  /** True for the 26th-onward run, which belongs to the *previous* calendar month. */
  isLeadingMonth: boolean
}

/** `score_period` for a homework month. */
export function homeworkPeriodKey(academicYear: string, monthId: string): string {
  return `${academicYear}_${monthId}`
}

/** `scores.subject` for one day's cell. */
export function homeworkCellSubject(dayNum: number): string {
  return `hw_${dayNum}`
}

/** Day of month out of `hw_<n>`, or `null` when the key is malformed. */
export function parseHomeworkCellDay(subject: string): number | null {
  const day = Number(subject.replace('hw_', ''))
  return Number.isFinite(day) ? day : null
}

/**
 * Every day in the cycle, in order: 26 → end of the previous month, then 1 → 25
 * of the selected one.
 *
 * The calendar year is read off the academic year the same way the rest of the
 * app does it — November and December sit in the first half (`2025-2026` → 2025)
 * and everything from January onward in the second.
 */
export function homeworkCycleDays(academicYear: string, monthId: string): HomeworkDay[] {
  const monthIndex = MONTH_INDEX_BY_ID[monthId]
  if (monthIndex === undefined || !academicYear.includes('-')) return []

  const [startYear, endYear] = academicYear.split('-')
  const year = monthId === 'nov' || monthId === 'dec'
    ? parseInt(startYear, 10)
    : parseInt(endYear, 10)
  if (!Number.isFinite(year)) return []

  let prevMonth = monthIndex - 1
  let prevYear = year
  if (prevMonth < 0) {
    prevMonth = 11
    prevYear -= 1
  }

  // Day 0 of the following month is the last day of this one.
  const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate()
  const days: HomeworkDay[] = []

  for (let d = 26; d <= daysInPrevMonth; d++) {
    const date = new Date(prevYear, prevMonth, d)
    days.push({ dayNum: d, date, isSunday: isSunday(date), isLeadingMonth: true })
  }

  for (let d = 1; d <= 25; d++) {
    const date = new Date(year, monthIndex, d)
    days.push({ dayNum: d, date, isSunday: isSunday(date), isLeadingMonth: false })
  }

  return days
}

/** The academic year, month and day the screen should open on. */
export interface HomeworkSelection {
  academicYear: string
  monthId: MonthId
  dayNum: number
}

/**
 * Where today sits in the homework calendar.
 *
 * From the 26th onward the teacher is already marking the *next* homework
 * month, so the selection rolls forward — that is the whole point of the cycle.
 * Impure by nature (it reads the clock), which is why it is a function the
 * client calls from an effect rather than a module constant.
 */
export function defaultHomeworkSelection(now: Date = new Date()): HomeworkSelection {
  const dayNum = now.getDate()
  let monthIndex = now.getMonth()
  let year = now.getFullYear()

  if (dayNum >= 26) {
    monthIndex += 1
    if (monthIndex > 11) {
      monthIndex = 0
      year += 1
    }
  }

  // Nov/Dec open a new academic year; every earlier month belongs to the one
  // that started the previous November.
  const academicStartYear = monthIndex === 10 || monthIndex === 11 ? year : year - 1

  return {
    academicYear: `${academicStartYear}-${academicStartYear + 1}`,
    monthId: MONTH_IDS_BY_INDEX[monthIndex],
    dayNum,
  }
}

/** Same calendar day, ignoring the time of day. */
export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
