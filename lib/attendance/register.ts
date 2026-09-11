/**
 * The register, as the screens reason about it — a day, and a month.
 *
 * `/attendance/layout` is a daily tool: open it, everyone is present, correct
 * the two who are not, done. The three derivations that flow needs — which
 * rows a filter shows, which rows a search matches, and how far through the
 * register the teacher is — used to be written inline in the list view, which
 * is how a search came to match on one field set and the seat picker on
 * another. They live here, pure and node-loadable, so
 * `scripts/verify-attendance.mts` can run them and the list view, the summary
 * strip and the completion panel cannot disagree about what "done" means.
 *
 * Nothing here decides what a mark MEANS — that is `./status.ts`. This file
 * only groups and counts through it. Keep it free of `server-only` and `next/*`.
 */

import { ENTRY_MARKS, markFor, tallyAttendance, type AttendanceStatus } from './status.ts'

/** `studentId` → the mark on screen for the day. */
export type DayMarks = Record<string, { status: string; note: string }>

/**
 * What the roster can be narrowed to.
 *
 * The three entry marks plus the two a teacher actually reaches for after
 * pressing "everyone is here": the whole class, and the pupils still to do.
 */
export type RosterFilter = 'all' | 'unmarked' | AttendanceStatus

export interface RosterFilterOption {
  id: RosterFilter
  label: string
}

/**
 * The filter chips, in the order they are offered. Built from `ENTRY_MARKS`
 * so a mark renamed there is renamed here — the list view must not carry its
 * own spelling of the vocabulary.
 */
export const ROSTER_FILTERS: readonly RosterFilterOption[] = [
  { id: 'all', label: 'ទាំងអស់' },
  ...ENTRY_MARKS.map((m) => ({ id: m.code, label: m.label })),
  { id: 'unmarked', label: 'មិនទាន់' },
]

/** The smallest shape the helpers need; `Student` satisfies it. */
export interface RosterEntry {
  id: string
  name_kh?: string | null
  name_en?: string | null
  student_id?: string | null
}

/**
 * Does this pupil pass the filter?
 *
 * `AP` — the legacy spelling of ច្បាប់ — answers to the `L` chip, because a
 * teacher filtering for "away with permission" means the fact, not the code
 * an older build stored it under. A status the module does not know counts
 * as unmarked: the safe direction, since it prompts a look rather than
 * hiding the row.
 */
export function matchesFilter(status: string | undefined, filter: RosterFilter): boolean {
  if (filter === 'all') return true
  const mark = markFor(status)
  if (filter === 'unmarked') return mark === null
  if (mark === null) return false
  if (mark.code === filter) return true
  // The two spellings of one mark answer to one chip.
  const wanted = markFor(filter)
  return wanted !== null && wanted.inClass === mark.inClass && wanted.excused === mark.excused
}

/** Case- and whitespace-insensitive: a phone keyboard adds both freely. */
function normalise(text: string | null | undefined): string {
  return String(text ?? '').toLowerCase().replace(/\s+/g, '')
}

/**
 * Pupils whose Khmer name, Latin name or student code contains the query.
 *
 * Whitespace is stripped from both sides — Khmer names are typed without
 * spaces, and a code copied from a printed list often arrives with one.
 */
export function searchRoster<T extends RosterEntry>(students: readonly T[], query: string): T[] {
  const q = normalise(query)
  if (!q) return [...students]
  return students.filter((s) =>
    [s.name_kh, s.name_en, s.student_id].some((field) => normalise(field).includes(q)),
  )
}

/** Search first, then filter — the order does not matter, the name does. */
export function visibleRoster<T extends RosterEntry>(
  students: readonly T[],
  marks: DayMarks,
  filter: RosterFilter,
  query = '',
): T[] {
  return searchRoster(students, query).filter((s) => matchesFilter(marks[s.id]?.status, filter))
}

/** How many pupils each chip would show. */
export function filterCounts(
  students: readonly RosterEntry[],
  marks: DayMarks,
): Record<RosterFilter, number> {
  const counts = { all: 0, unmarked: 0, P: 0, L: 0, A: 0, AP: 0 } as Record<RosterFilter, number>
  for (const s of students) {
    const status = marks[s.id]?.status
    for (const f of ROSTER_FILTERS) {
      if (matchesFilter(status, f.id)) counts[f.id] += 1
    }
  }
  return counts
}

export interface RegisterSummary {
  /** Pupils on the roster. */
  total: number
  present: number
  excused: number
  unexcused: number
  /** Pupils with no recognised mark yet. */
  unmarked: number
  /** In-class rate over the pupils MARKED, from `tallyAttendance`. */
  rate: number | null
  /** Every pupil carries a recognised mark. False for an empty roster. */
  complete: boolean
}

/**
 * How far through the register the teacher is.
 *
 * The arithmetic is `tallyAttendance` — the same call the printed sheets and
 * the parent portal make — so the strip on this screen cannot report a rate
 * the monthly register would print differently for the same day.
 */
export function registerSummary(students: readonly RosterEntry[], marks: DayMarks): RegisterSummary {
  const t = tallyAttendance(students.map((s) => ({ status: marks[s.id]?.status })))
  const unmarked = students.length - t.marked
  return {
    total: students.length,
    present: t.present,
    excused: t.excused,
    unexcused: t.unexcused,
    unmarked,
    rate: t.rate,
    complete: students.length > 0 && unmarked === 0,
  }
}

/**
 * The next mark when a seat on the plan is tapped.
 *
 * The plan has one target per pupil, so it cycles: unmarked → present →
 * ច្បាប់ → absent → present. An unmarked seat goes to present first because
 * that is what a first tap on a pupil who is in front of you means.
 */
export function nextMarkInCycle(status: string | undefined): AttendanceStatus {
  const current = markFor(status)
  if (current === null) return ENTRY_MARKS[0].code
  const index = ENTRY_MARKS.findIndex(
    (m) => m.inClass === current.inClass && m.excused === current.excused,
  )
  return ENTRY_MARKS[(index + 1) % ENTRY_MARKS.length].code
}

// ---------------------------------------------------------------------------
// A period, not a day
// ---------------------------------------------------------------------------

/** `date` → `studentId` → the mark stored for that pupil on that day. */
export type MarksByDate = Record<string, Record<string, { status?: string | null }>>

export interface PeriodSummary {
  /** Pupils on the roster the period is being read for. */
  students: number
  /** Days on which at least one roster pupil was marked. The rate's context. */
  daysRecorded: number
  present: number
  excused: number
  unexcused: number
  /** `excused + unexcused` — what the ministry sheets column separately. */
  absences: number
  /** In-class rate over the marks RECORDED, or `null` when nothing is. */
  rate: number | null
}

/**
 * What a month — or any span of days — came to.
 *
 * ── Why this exists (Phase 16 F16-3) ──────────────────────────────────────
 *
 * `/attendance/monthly` renders a 297mm ministry sheet and nothing else. The
 * only aggregates on it are the per-pupil `អ`/`ច្ប` columns at the right-hand
 * edge, which on a phone sit off-screen inside a horizontal scroller. A teacher
 * asking "how was this month?" read twenty-eight numbers and added them up.
 *
 * The arithmetic is `tallyAttendance` — the same call the printed sheets, the
 * daily strip and the parent portal make — so the figure above the preview
 * cannot disagree with the absence columns printed below it. Writing a private
 * loop here would have been the twelfth reading of a status that
 * `lib/attendance/status.ts` exists to prevent.
 *
 * ── Two deliberate bounds ─────────────────────────────────────────────────
 *
 * Only ROSTER pupils are counted. Both attendance reads are scoped by
 * `teacher_id` and not by class, so the rows handed to this function can
 * include pupils from the teacher's other classes; the sheet already renders
 * only the roster, and a summary over a wider set than the sheet would be a
 * different month from the one on screen.
 *
 * `daysRecorded` counts days actually marked, never days in the month — a
 * register kept for nine days of twenty describes nine days, which is the same
 * rule `tallyAttendance` applies to its own denominator.
 */
export function periodSummary(
  students: readonly RosterEntry[],
  marksByDate: MarksByDate,
): PeriodSummary {
  const roster = new Set(students.map((s) => s.id))
  const rows: { status?: string | null }[] = []
  let daysRecorded = 0

  for (const day of Object.values(marksByDate)) {
    let anyThisDay = false
    for (const [studentId, mark] of Object.entries(day)) {
      if (!roster.has(studentId)) continue
      // A row this application does not recognise is still a row somebody
      // wrote; `tallyAttendance` counts it as unknown and keeps it out of the
      // rate rather than folding it into something it is not.
      if (markFor(mark?.status) === null) continue
      rows.push({ status: mark?.status })
      anyThisDay = true
    }
    if (anyThisDay) daysRecorded += 1
  }

  const t = tallyAttendance(rows)
  return {
    students: students.length,
    daysRecorded,
    present: t.present,
    excused: t.excused,
    unexcused: t.unexcused,
    absences: t.absent,
    rate: t.rate,
  }
}
