'use client'

import { Check, Circle, X, CircleDashed } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { registerSummary, type DayMarks } from '@/lib/attendance/register'

/**
 * Have I finished the register?
 *
 * One compact strip, not four dashboard cards: `៣៥ សិស្ស · ✓ ៣២ · ○ ២ · × ១ ·
 * ៩១.៤%`. The list of pupils is the work; the summary is a glance. It sits
 * above the view switcher so the seating plan and the 3D room — neither of
 * which distinguishes "not marked" from "marked present" at a glance — answer
 * "have I finished?" as well as the list does.
 *
 * The arithmetic is `registerSummary`, which is `tallyAttendance` — the same
 * call the printed sheets and the parent portal make — so "៤ មិនទាន់" here
 * cannot disagree with the absence columns the monthly register prints for
 * the same day. Every figure carries a glyph and a label, never a colour
 * alone.
 */
export function RegisterTally({
  students,
  marks,
}: {
  students: readonly { id: string }[]
  marks: DayMarks
}) {
  const s = registerSummary(students, marks)
  const done = s.total - s.unmarked

  const cells = [
    { label: 'មក', value: s.present, icon: Check, cls: 'text-success' },
    { label: 'ច្បាប់', value: s.excused, icon: Circle, cls: 'text-warning-text' },
    { label: 'អវត្តមាន', value: s.unexcused, icon: X, cls: 'text-danger-text' },
  ]

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] print:hidden"
      role="status"
      aria-label={`បានសម្គាល់ ${toKhmerNumber(done)} ក្នុងចំណោម ${toKhmerNumber(s.total)} នាក់`}
    >
      <span className="font-bold text-text-heading tabular-nums">
        {toKhmerNumber(s.total)} សិស្ស
      </span>

      {cells.map((c) => {
        const Icon = c.icon
        return (
          <span key={c.label} className={`inline-flex items-center gap-1 tabular-nums ${c.cls}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />
            <span className="font-bold">{toKhmerNumber(c.value)}</span>
            <span className="text-text-muted">{c.label}</span>
          </span>
        )
      })}

      {s.unmarked > 0 && (
        <span className="inline-flex items-center gap-1 text-text-muted tabular-nums">
          <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-bold">{toKhmerNumber(s.unmarked)}</span> មិនទាន់
        </span>
      )}

      {/* Rate over the pupils marked — never over the roster, which would
          report a truancy nobody has recorded yet. */}
      <span className="ml-auto text-text-muted tabular-nums">
        {s.total === 0
          ? '—'
          : s.unmarked > 0
            ? `${toKhmerNumber(done)}/${toKhmerNumber(s.total)}`
            : `${toKhmerNumber(s.rate ?? 0)}%`}
      </span>
    </div>
  )
}

export default RegisterTally
