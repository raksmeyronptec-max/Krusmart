/**
 * Attendance is one job on three screens, and they are declared here once.
 *
 * ── The problem this solves (Phase 16 F16-1) ──────────────────────────────
 *
 * Taking a register, reviewing the month and reviewing the year are three
 * views of the same record. The product had them wired as a two-node loop with
 * the daily action outside it:
 *
 *   /attendance/monthly  ──▶  /attendance/yearly
 *   /attendance/monthly  ◀──  /attendance/yearly
 *   /attendance/layout        ──▶ (nothing)
 *
 * The register — the thing a teacher opens every morning — named neither
 * review screen, and neither review screen named it. A teacher who finished
 * today's marks and wanted the month had to go back to the sidebar; a teacher
 * reading the month had no way back to the register at all. §19 of the brief
 * calls that being trapped inside a report.
 *
 * So the set is declared once and each screen renders the other two. There is
 * deliberately no per-screen array of "where I link to": that is precisely how
 * the loop came to exclude the register, and a fourth attendance screen would
 * have to be added in three places to be reachable from all of them.
 *
 * ── What this is NOT ──────────────────────────────────────────────────────
 *
 * Not navigation, and not a tab strip. `lib/navigation.ts` remains the
 * information architecture and still declares all three routes — the two
 * sheets `hidden`, because they are reached from `/print-center`. This is the
 * lateral join *between* the three, rendered as a quiet secondary row. §18 is
 * explicit that the register must not grow a toolbar.
 *
 * Pure and node-loadable so `scripts/verify-attendance.mts` can run it. Keep it
 * free of `server-only` and of `next/*`.
 */

/** Which of the three screens is showing. */
export type AttendanceViewId = 'register' | 'monthly' | 'yearly'

export interface AttendanceView {
  id: AttendanceViewId
  /** What a teacher calls it. Short — this renders as a chip, not a sentence. */
  label: string
  href: string
  /** The question this screen answers, for the link's accessible name. */
  purpose: string
}

/**
 * The three, in the order the work happens: mark today, then read the month,
 * then read the year.
 *
 * `register` is first and is the only one that WRITES. The two sheets read and
 * print; that asymmetry is why the module's front door in `lib/navigation.ts`
 * is the register and not the monthly sheet.
 */
export const ATTENDANCE_VIEWS: readonly AttendanceView[] = [
  { id: 'register', label: 'ចុះវត្តមាន', href: '/attendance/layout', purpose: 'ចុះវត្តមានប្រចាំថ្ងៃ' },
  { id: 'monthly', label: 'មើលប្រចាំខែ', href: '/attendance/monthly', purpose: 'សម្រង់អវត្តមានប្រចាំខែ' },
  { id: 'yearly', label: 'មើលប្រចាំឆ្នាំ', href: '/attendance/yearly', purpose: 'សម្រង់អវត្តមានប្រចាំឆ្នាំ' },
] as const

/**
 * The views a given screen should offer — everything except itself.
 *
 * A screen linking to itself is a control that looks live and does nothing,
 * which on the register would be indistinguishable from a lost tap.
 */
export function otherAttendanceViews(current: AttendanceViewId): AttendanceView[] {
  return ATTENDANCE_VIEWS.filter((v) => v.id !== current)
}
