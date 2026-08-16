'use client'

import { useRef } from 'react'
import { Ban, Check } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
// Shared with the score grid on purpose: a teacher moving between the two
// screens should not have to learn two sets of keys. See `cellNav.ts`.
import { cellAttrs, handleCellKeyDown } from '../../score/enter/cellNav'
import { cellKey, markIssue, markValue, studentTotals, type HomeworkScores } from './scores'
import type { HomeworkDay } from './period'
import type { Student } from '@/lib/types'

/**
 * One homework day, one row per pupil.
 *
 * This is the high-frequency workflow: a teacher marks the class for *today*,
 * usually straight after collecting the books, and does it thirty times in a
 * row. So the day is a single column, the field is large, and Arrow Up/Down and
 * Enter walk down it — the motion the paper register has.
 *
 * The previous screen split the roster into two side-by-side half-tables on a
 * wide monitor. That halves the scroll but doubles the number of places a name
 * can be, and the tab order jumped from the bottom of the left table back to
 * the top of the right one. One list, one order.
 *
 * A filled field is tinted and carries a tick; an empty one is plain. The
 * signal is completion, not quality — homework marks are not banded against the
 * grading ladder anywhere else in the app, and colouring them as if they were
 * would assert a pass mark this screen has no authority over.
 */

export interface HomeworkDailyRosterProps {
  students: Student[]
  day: HomeworkDay
  scores: HomeworkScores
  onChange: (studentId: string, dayNum: number, value: string) => void
  /** Cells written to the database since the last edit. */
  savedCells?: Set<string>
  /** Row number in the *unfiltered* roster, so searching does not renumber pupils. */
  rowNumbers: Map<string, number>
  maxScore: number
}

function fieldClass(raw: string | undefined, maxScore: number, extra: string) {
  const issue = markIssue(raw, maxScore)
  const tone =
    issue?.level === 'error'
      ? 'border-danger bg-danger/10 text-danger'
      : issue?.level === 'warning'
        ? 'border-warning bg-warning/10 text-warning'
        : markValue(raw) !== null
          ? 'border-success bg-success/10 text-success'
          : 'border-divider bg-bg-surface text-text-heading'

  return [
    'rounded-lg border text-center font-bold tabular-nums outline-none transition',
    'focus:ring-2 focus:ring-focus-ring/30',
    'disabled:cursor-not-allowed disabled:border-divider disabled:bg-paper disabled:text-text-muted',
    tone,
    extra,
  ].join(' ')
}

export function HomeworkDailyRoster({
  students,
  day,
  scores,
  onChange,
  savedCells,
  rowNumbers,
  maxScore,
}: HomeworkDailyRosterProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const blocked = day.isSunday
  const dayLabel = `ថ្ងៃទី ${toKhmerNumber(day.dayNum)}`

  /**
   * Everything the field needs, shared by the table and the card list.
   *
   * `view` namespaces the error-message id: both renderings are in the DOM at
   * once — one is hidden by a media query, not unmounted — so a single id per
   * pupil would be duplicated, and `aria-describedby` would resolve to whichever
   * copy the browser found first.
   */
  const fieldProps = (stu: Student, rowIndex: number, view: 'table' | 'card') => {
    const raw = scores[stu.id]?.[day.dayNum] ?? ''
    const issue = markIssue(raw, maxScore)
    const describedBy = issue ? `hw-issue-${view}-${stu.id}` : undefined

    return {
      raw,
      issue,
      describedBy,
      input: {
        type: 'number' as const,
        inputMode: 'decimal' as const,
        min: 0,
        max: maxScore,
        step: '0.5',
        placeholder: '—',
        disabled: blocked,
        value: raw,
        'aria-label': `ពិន្ទុកិច្ចការផ្ទះ ${dayLabel} សម្រាប់ ${stu.name_kh || stu.name_en}`,
        'aria-invalid': issue?.level === 'error' || undefined,
        'aria-describedby': describedBy,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(stu.id, day.dayNum, e.target.value),
        onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
        ...cellAttrs(rowIndex, 0),
      },
    }
  }

  return (
    <>
      {/* ------------------------------------------------------------ table */}
      <div
        ref={tableRef}
        className="hidden max-h-[62vh] overflow-y-auto rounded-xl border border-divider bg-bg-surface shadow-sm md:block"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            ពិន្ទុកិច្ចការផ្ទះ {dayLabel} សម្រាប់សិស្ស {toKhmerNumber(students.length)} នាក់
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 z-10 w-12 border-b border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold text-text-body"
              >
                ល.រ
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 border-b border-divider bg-paper px-3 py-2.5 text-left text-xs font-bold text-text-body"
              >
                ឈ្មោះសិស្ស
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 hidden w-16 border-b border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold text-text-body lg:table-cell"
              >
                ភេទ
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 w-40 border-b border-l border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold text-text-body"
              >
                ពិន្ទុ{dayLabel}
              </th>
              <th
                scope="col"
                className="sticky top-0 z-10 w-28 border-b border-l border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold text-text-body"
              >
                សរុបប្រចាំខែ
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((stu, rowIndex) => {
              const { raw, issue, describedBy, input } = fieldProps(stu, rowIndex, 'table')
              const { total, count } = studentTotals(scores[stu.id])
              const saved = savedCells?.has(cellKey(stu.id, day.dayNum))

              return (
                <tr key={stu.id} className="group border-b border-divider last:border-b-0">
                  <td className="px-2 py-1.5 text-center text-xs text-text-muted tabular-nums">
                    {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}
                  </td>
                  <th
                    scope="row"
                    className="max-w-[280px] truncate px-3 py-1.5 text-left font-bold text-text-heading group-hover:bg-paper"
                  >
                    {stu.name_kh || stu.name_en}
                    {stu.student_id && (
                      <span className="ml-2 text-[11px] font-normal text-text-muted">
                        អ.ល {stu.student_id}
                      </span>
                    )}
                  </th>
                  <td className="hidden px-2 py-1.5 text-center text-xs text-text-muted lg:table-cell">
                    {stu.gender || '—'}
                  </td>
                  <td className="border-l border-divider px-2 py-1.5 text-center">
                    <span className="relative inline-block">
                      {blocked ? (
                        <span className="inline-flex h-11 w-24 items-center justify-center gap-1 rounded-lg border border-divider bg-paper text-xs font-bold text-text-muted">
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" /> ឈប់
                        </span>
                      ) : (
                        <input
                          {...input}
                          onKeyDown={(e) => handleCellKeyDown(e, tableRef.current, students.length)}
                          className={fieldClass(raw, maxScore, 'h-11 w-24 px-2 text-lg')}
                        />
                      )}
                      {saved && !issue && (
                        <Check
                          className="pointer-events-none absolute -top-1 -right-1 h-4 w-4 rounded-full bg-success p-0.5 text-white"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {issue && (
                      <p
                        id={describedBy}
                        className={`mt-1 text-[11px] font-bold ${issue.level === 'error' ? 'text-danger' : 'text-warning'}`}
                      >
                        {issue.message}
                      </p>
                    )}
                  </td>
                  <td className="border-l border-divider px-2 py-1.5 text-center">
                    <span className="text-sm font-bold text-text-heading tabular-nums">
                      {total === '' ? '—' : total}
                    </span>
                    <span className="ml-1 text-[11px] text-text-muted">
                      ({toKhmerNumber(count)} ថ្ងៃ)
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------- cards */}
      <ul ref={listRef} className="flex flex-col gap-2.5 md:hidden">
        {students.map((stu, rowIndex) => {
          const { raw, issue, describedBy, input } = fieldProps(stu, rowIndex, 'card')
          const { total, count } = studentTotals(scores[stu.id])
          const saved = savedCells?.has(cellKey(stu.id, day.dayNum))

          return (
            <li
              key={stu.id}
              className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-sm font-bold text-brand">
                  {stu.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- remote avatar; next/image needs an allow-listed host and adds nothing here
                    <img
                      src={getDriveImageUrl(stu.photo_url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (stu.name_kh || stu.name_en || '?').trim().charAt(0)
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5 font-bold text-text-heading">
                    <span className="text-xs text-text-muted tabular-nums">
                      {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}.
                    </span>
                    <span className="min-w-0 truncate">{stu.name_kh || stu.name_en}</span>
                  </p>
                  <p className="truncate text-[11px] text-text-muted">
                    សរុបប្រចាំខែ {total === '' ? '—' : total} · {toKhmerNumber(count)} ថ្ងៃ
                    {stu.gender ? ` · ${stu.gender}` : ''}
                  </p>
                </div>

                <div className="relative shrink-0">
                  {blocked ? (
                    <span className="flex h-12 w-20 items-center justify-center gap-1 rounded-lg border border-divider bg-paper text-xs font-bold text-text-muted">
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" /> ឈប់
                    </span>
                  ) : (
                    <input
                      {...input}
                      onKeyDown={(e) => handleCellKeyDown(e, listRef.current, students.length)}
                      // 16px minimum: anything smaller makes iOS Safari zoom the
                      // page on focus, which throws the roster off screen.
                      className={fieldClass(raw, maxScore, 'h-12 w-20 px-2 text-lg')}
                    />
                  )}
                  {saved && !issue && (
                    <Check
                      className="pointer-events-none absolute -top-1 -right-1 h-4 w-4 rounded-full bg-success p-0.5 text-white"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>

              {issue && (
                <p
                  id={describedBy}
                  className={`mt-2 text-xs font-bold ${issue.level === 'error' ? 'text-danger' : 'text-warning'}`}
                >
                  {issue.message}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export default HomeworkDailyRoster
