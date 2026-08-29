'use client'

import { ChevronRight } from 'lucide-react'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash, styleFor, styleForMark } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { markOf } from '@/lib/scores/totals'
import type { ColumnGroup, TotalledStudent } from './scoreTotalConfig'

/**
 * លទ្ធផលសិស្ស — the results table (§10).
 *
 * The default desktop view, and the point of the redesign. What was here before
 * is still here, one toggle away: a twenty-nine column matrix with an editable
 * input in every cell. That grid answers "let me fix a mark"; it answers "how
 * did the class do" badly, because the six columns a teacher actually reads —
 * name, average, rank, status — are separated by twenty-five they do not.
 *
 * So this table leads with those, and summarises the subjects as one mark per
 * subject rather than one per component. `ភាសាខ្មែរ 8.4` is a number a teacher
 * can act on; seven separate Khmer competency columns are a number they have to
 * compute themselves.
 *
 * The per-subject figure is the mean of that subject's recorded components —
 * the same arithmetic `subjectPerformance` runs for the class, applied to one
 * pupil, so the row and the section beneath it cannot disagree.
 *
 * Read-only by design: editing lives in the matrix view and in `/score/enter`.
 */
export function ScoreTotalResultsTable({
  rows,
  groups,
  scheme = DEFAULT_SCHEME_CONFIG,
  maxByColumn = {},
  rowNumbers,
  onSelect,
}: {
  rows: TotalledStudent[]
  /** Already narrowed to the class's template by the caller. */
  groups: ColumnGroup[]
  scheme?: GradingSchemeConfig
  maxByColumn?: Record<string, number>
  rowNumbers: Map<string, number>
  onSelect: (student: TotalledStudent) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-divider bg-bg-surface shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">
          លទ្ធផលសិស្ស — មធ្យមភាគ ចំណាត់ថ្នាក់ និងមធ្យមភាគតាមមុខវិជ្ជា
        </caption>

        <thead>
          <tr className="bg-brand text-brand-contrast">
            <th scope="col" className="w-12 px-2 py-2.5 text-center text-xs font-bold">#</th>
            <th scope="col" className="px-3 py-2.5 text-left text-xs font-bold">សិស្ស</th>
            {groups.map((group) => (
              <th
                key={group.name}
                scope="col"
                className="hidden px-2 py-2.5 text-center text-xs font-bold lg:table-cell"
              >
                {group.name}
              </th>
            ))}
            <th scope="col" className="px-2 py-2.5 text-center text-xs font-bold">មធ្យមភាគ</th>
            <th scope="col" className="w-16 px-2 py-2.5 text-center text-xs font-bold">ចំណាត់</th>
            <th scope="col" className="w-10 px-2 py-2.5">
              <span className="sr-only">សកម្មភាព</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((student) => {
            const average = student.finalAverageForRank || null
            const style = styleFor(average, scheme)

            return (
              <tr
                key={student.id}
                onClick={() => onSelect(student)}
                className={`cursor-pointer border-b border-divider transition last:border-b-0 hover:bg-paper ${style.rail}`}
              >
                <td className="px-2 py-2 text-center text-xs text-text-muted tabular-nums">
                  {toKhmerNumber(rowNumbers.get(student.id) ?? 0)}
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-xs font-bold text-brand">
                      {student.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getDriveImageUrl(student.photo_url)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (student.name_kh || student.name_en || '?').trim().charAt(0)
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold text-text-heading">
                        {student.name_kh || student.name_en || '—'}
                      </span>
                      {/* Below lg the subject columns are dropped, so the
                          per-subject marks collapse into this line instead of
                          vanishing entirely. */}
                      <span className="block truncate text-[11px] text-text-muted lg:hidden">
                        {groups
                          .map((g) => {
                            const value = subjectAverage(student, g)
                            return value === null ? null : `${g.name} ${formatMark(value)}`
                          })
                          .filter(Boolean)
                          .join(' · ') || 'មិនទាន់មានពិន្ទុ'}
                      </span>
                    </span>
                  </div>
                </td>

                {groups.map((group) => {
                  const value = subjectAverage(student, group)
                  const max = groupMax(group, maxByColumn, scheme.maxScore)
                  return (
                    <td key={group.name} className="hidden px-2 py-2 text-center lg:table-cell">
                      {value === null ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : (
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${styleForMark(value, max, scheme).pill}`}
                        >
                          {formatMark(value)}
                        </span>
                      )}
                    </td>
                  )
                })}

                <td className="px-2 py-2 text-center">
                  <span className={`text-sm font-bold tabular-nums ${style.text}`}>
                    {formatMark(average)}
                  </span>
                  <span className={`ml-1 text-[11px] ${style.text} opacity-80`}>
                    {letterOrDash(average, scheme)}
                  </span>
                </td>

                <td className="px-2 py-2 text-center text-sm font-bold text-text-heading tabular-nums">
                  {student.rank ? toKhmerNumber(student.rank) : '—'}
                </td>

                <td className="px-2 py-2 text-center">
                  <ChevronRight className="mx-auto h-4 w-4 text-text-muted" aria-hidden="true" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * One pupil's mean across a subject's recorded components.
 *
 * `null` — not 0 — when nothing is recorded: a pupil with no Khmer marks has no
 * Khmer average, and printing 0 would band them as failing a subject they have
 * simply not been assessed in yet. Behavioural columns hold words and are
 * excluded, matching every average on this screen.
 */
function subjectAverage(student: TotalledStudent, group: ColumnGroup): number | null {
  const marks: number[] = []
  for (const column of group.columns) {
    if (column.isText) continue
    const value = markOf(student.scores[column.key])
    if (value !== null) marks.push(value)
  }
  if (marks.length === 0) return null
  return Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100
}

/** The largest full mark among a subject's columns, for banding its pill. */
function groupMax(
  group: ColumnGroup,
  maxByColumn: Record<string, number>,
  fallback: number,
): number {
  let max = 0
  for (const column of group.columns) {
    if (column.isText) continue
    max = Math.max(max, maxByColumn[column.key] ?? fallback)
  }
  return max || fallback
}

export default ScoreTotalResultsTable
