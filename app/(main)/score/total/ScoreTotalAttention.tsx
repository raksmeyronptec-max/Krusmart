'use client'

import { AlertTriangle, ChevronRight } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash, styleFor } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import type { AttentionStudent } from '@/lib/scores/totals'
import type { TotalledStudent } from './scoreTotalConfig'

/**
 * សិស្សត្រូវការជំនួយ — the pupils below the pass mark (§14).
 *
 * The threshold is the grading scheme's, never a constant: primary passes at
 * 5/10 and secondary at 25/50, so any number written here would be wrong for
 * one of them. `attentionList` applies it; this only renders.
 *
 * Capped at eight rows with a count of the rest. The section exists to be acted
 * on during a staff meeting, and a list of thirty is a list nobody starts. The
 * "show only failing" filter on the summary card is the way to see all of them
 * in the table proper.
 *
 * Each row names the subject dragging the pupil down where one is derivable —
 * "who is failing" is much less useful than "who is failing at what".
 */
export function ScoreTotalAttention({
  students,
  scheme = DEFAULT_SCHEME_CONFIG,
  onSelect,
  limit = 8,
}: {
  students: AttentionStudent[]
  scheme?: GradingSchemeConfig
  onSelect?: (student: TotalledStudent) => void
  limit?: number
}) {
  if (students.length === 0) return null

  const shown = students.slice(0, limit)
  const rest = students.length - shown.length

  return (
    <section
      aria-labelledby="attention-heading"
      className="rounded-xl border border-danger/40 bg-bg-surface p-4 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="attention-heading"
          className="flex items-center gap-2 text-sm font-bold text-text-heading"
        >
          <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" />
          សិស្សត្រូវការជំនួយ
        </h2>
        <p className="text-xs text-text-muted">
          មធ្យមភាគក្រោម {toKhmerNumber(scheme.passMark)} · {toKhmerNumber(students.length)} នាក់
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {shown.map(({ student, average, weakestSubject }) => {
          const style = styleFor(average, scheme)

          const body = (
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-text-heading">
                  {student.name_kh || student.name_en || '—'}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                  {weakestSubject
                    ? `ខ្សោយបំផុត៖ ${weakestSubject.name} ${formatMark(weakestSubject.average)}`
                    : 'មិនទាន់កំណត់មុខវិជ្ជាខ្សោយ'}
                </span>
              </span>

              <span className={`shrink-0 text-right text-sm font-bold tabular-nums ${style.text}`}>
                {formatMark(average)}
                <span className="ml-1 text-[11px] opacity-80">
                  {letterOrDash(average, scheme)}
                </span>
              </span>

              {onSelect && (
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              )}
            </div>
          )

          return (
            <li key={student.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(student)}
                  className="w-full rounded-lg border border-transparent p-2.5 text-left transition hover:border-divider hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  {body}
                </button>
              ) : (
                <div className="rounded-lg p-2.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>

      {rest > 0 && (
        <p className="mt-2 text-[11px] text-text-muted">
          និង {toKhmerNumber(rest)} នាក់ទៀត — ចុចកាត «សិស្សធ្លាក់» ដើម្បីមើលទាំងអស់
        </p>
      )}
    </section>
  )
}

export default ScoreTotalAttention
