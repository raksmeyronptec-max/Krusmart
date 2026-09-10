'use client'

import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { tallyAttendance } from '@/lib/attendance/status'
import type { DayMarks } from './AttendanceLayoutClient'

/**
 * Have I finished the register?
 *
 * The brief asks every attendance surface for a completion indication, and the
 * app had one — inside `RosterCheckIn`, which is the **list** view only. A
 * teacher working from the seating plan or the 3D room, the two views a desk
 * user is most likely to pick, was never told that four pupils were still
 * unmarked; there is nothing on either of those views that distinguishes "not
 * marked" from "marked present" at a glance.
 *
 * So the strip moved up here, beside the view switcher, and all three views
 * carry it. It is computed once from the same `tallyAttendance` the sheets and
 * the parent portal use, so "៤ មិនទាន់" cannot disagree with what the printed
 * absence columns say about the same day.
 *
 * `unmarked` is the roster minus the recognised marks — a pupil carrying a
 * status this application does not know is counted as not yet marked, which is
 * the safe direction: it prompts a teacher to look rather than reporting a day
 * as done.
 */
export function RegisterTally({
  students,
  marks,
}: {
  students: readonly { id: string }[]
  marks: DayMarks
}) {
  const t = tallyAttendance(students.map((s) => ({ status: marks[s.id]?.status })))

  const cells = [
    { label: 'វត្តមាន', value: t.present, cls: 'text-success' },
    { label: 'ច្បាប់', value: t.excused, cls: 'text-warning-text' },
    { label: 'អវត្តមាន', value: t.unexcused, cls: 'text-danger' },
    { label: 'មិនទាន់', value: students.length - t.marked, cls: 'text-text-muted' },
  ]

  return (
    <div
      className="mb-4 grid grid-cols-4 gap-2 print:hidden"
      role="status"
      aria-label={`បានសម្គាល់ ${toKhmerNumber(t.marked)} ក្នុងចំណោម ${toKhmerNumber(students.length)}`}
    >
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl border border-divider bg-bg-surface px-2 py-2.5 text-center">
          <p className={`text-xl font-bold tabular-nums ${c.cls}`}>{toKhmerNumber(c.value)}</p>
          <p className="text-[11px] text-text-muted">{c.label}</p>
        </div>
      ))}
    </div>
  )
}

export default RegisterTally
