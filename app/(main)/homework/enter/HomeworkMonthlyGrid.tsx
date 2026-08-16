'use client'

import { useRef } from 'react'
import { Ban, MoveHorizontal } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { khmerWeekday } from '@/lib/constants/weekdays'
import { cellAttrs, handleCellKeyDown } from '../../score/enter/cellNav'
import { cellKey, markIssue, markValue, studentTotals, type HomeworkScores } from './scores'
import type { HomeworkDay } from './period'
import type { Student } from '@/lib/types'

/**
 * The whole cycle at once — the scanning and correction view.
 *
 * This is not where marks are first entered; it is where a teacher finds the
 * three cells they missed. So it stays a spreadsheet on a laptop, with the name
 * column pinned so a mark can never be typed against the wrong pupil, and it
 * degrades to a per-pupil summary on a phone rather than to a thirty-column
 * table squeezed into 375px.
 *
 * Sundays are drawn as blocked cells with the `Ban` glyph and the word ឈប់, not
 * merely tinted red: colour alone would leave a colour-blind teacher guessing
 * why a column refuses to accept a mark (WCAG 1.4.1).
 */

export interface HomeworkMonthlyGridProps {
  students: Student[]
  days: HomeworkDay[]
  scores: HomeworkScores
  onChange: (studentId: string, dayNum: number, value: string) => void
  savedCells?: Set<string>
  rowNumbers: Map<string, number>
  maxScore: number
  /** Jump into daily mode for a given day — the phone summary's edit path. */
  onPickDay?: (dayNum: number) => void
}

function cellTone(raw: string | undefined, maxScore: number) {
  const issue = markIssue(raw, maxScore)
  if (issue?.level === 'error') return 'border-danger bg-danger/10 text-danger'
  if (issue?.level === 'warning') return 'border-warning bg-warning/10 text-warning'
  if (markValue(raw) !== null) return 'border-success bg-success/10 text-success'
  return 'border-divider bg-bg-surface text-text-heading'
}

export function HomeworkMonthlyGrid({
  students,
  days,
  scores,
  onChange,
  savedCells,
  rowNumbers,
  maxScore,
  onPickDay,
}: HomeworkMonthlyGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const workingDays = days.filter((d) => !d.isSunday)

  return (
    <>
      {/* ------------------------------------------------------------- grid */}
      <div className="hidden lg:block">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
          <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          អូសតារាងទៅឆ្វេង-ស្តាំដើម្បីមើលថ្ងៃទាំង {toKhmerNumber(days.length)} ថ្ងៃ · ឈ្មោះសិស្សនៅជាប់នឹងកន្លែងដើម
        </p>

        <div
          ref={scrollRef}
          // Focusable so a keyboard-only user can scroll the region; without
          // tabindex a scroll container with no focusable child is unreachable.
          tabIndex={0}
          role="region"
          aria-label="តារាងពិន្ទុកិច្ចការផ្ទះប្រចាំខែ"
          className="max-h-[64vh] overflow-auto rounded-xl border border-divider bg-bg-surface shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">
              ពិន្ទុកិច្ចការផ្ទះប្រចាំខែ — ជួរដេកមួយក្នុងមួយសិស្ស ជួរឈរមួយក្នុងមួយថ្ងៃ
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-30 min-w-[200px] border-b border-r border-divider bg-paper px-3 py-2.5 text-left font-bold text-text-body shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                >
                  សិស្ស ({toKhmerNumber(students.length)})
                </th>

                {days.map((day) => (
                  <th
                    key={day.dayNum}
                    scope="col"
                    title={`${khmerWeekday(day.date)} ទី${day.dayNum}`}
                    className={`sticky top-0 z-20 min-w-[42px] border-b border-l border-divider px-1 py-1.5 text-center text-[11px] font-bold ${
                      day.isSunday ? 'bg-danger/10 text-danger' : 'bg-paper text-text-body'
                    }`}
                  >
                    <span className="block tabular-nums">{day.dayNum}</span>
                    <span className="block text-[9px] font-normal opacity-70">
                      {day.isSunday ? 'ឈប់' : khmerWeekday(day.date).replace('ថ្ងៃ', '')}
                    </span>
                  </th>
                ))}

                {/*
                  The two summary columns pin to the right edge so a total is
                  never scrolled off while its row is being read. Their widths
                  are fixed and the offsets are derived from them — `right-[76px]`
                  is exactly the width of the column to its right — which is what
                  stops the pair overlapping as the grid scrolls.
                */}
                <th
                  scope="col"
                  className="sticky top-0 right-[76px] z-30 w-[72px] min-w-[72px] border-b border-l border-divider bg-paper px-2 py-2.5 text-center font-bold text-text-body shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                >
                  សរុប
                </th>
                <th
                  scope="col"
                  className="sticky top-0 right-0 z-30 w-[76px] min-w-[76px] border-b border-l border-divider bg-paper px-2 py-2.5 text-center font-bold text-text-body"
                >
                  មធ្យមភាគ
                </th>
              </tr>
            </thead>

            <tbody>
              {students.map((stu, rowIndex) => {
                const { total, average } = studentTotals(scores[stu.id])

                return (
                  <tr key={stu.id} className="group border-b border-divider last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-[240px] truncate border-r border-divider bg-bg-surface px-3 py-1.5 text-left font-bold text-text-heading shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] group-hover:bg-paper"
                    >
                      <span className="mr-1.5 text-[11px] font-normal text-text-muted tabular-nums">
                        {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}.
                      </span>
                      {stu.name_kh || stu.name_en}
                    </th>

                    {days.map((day, colIndex) => {
                      const raw = scores[stu.id]?.[day.dayNum] ?? ''
                      const saved = savedCells?.has(cellKey(stu.id, day.dayNum))

                      if (day.isSunday) {
                        return (
                          <td
                            key={day.dayNum}
                            className="border-l border-divider bg-danger/5 p-1 text-center"
                          >
                            <Ban className="mx-auto h-3.5 w-3.5 text-danger/60" aria-hidden="true" />
                            <span className="sr-only">
                              {khmerWeekday(day.date)} — មិនអនុញ្ញាតឱ្យបញ្ចូលពិន្ទុ
                            </span>
                          </td>
                        )
                      }

                      return (
                        <td key={day.dayNum} className="relative border-l border-divider p-0.5 text-center">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={maxScore}
                            step="0.5"
                            placeholder="—"
                            value={raw}
                            aria-label={`ពិន្ទុថ្ងៃទី ${day.dayNum} សម្រាប់ ${stu.name_kh || stu.name_en}`}
                            aria-invalid={markIssue(raw, maxScore)?.level === 'error' || undefined}
                            onChange={(e) => onChange(stu.id, day.dayNum, e.target.value)}
                            onKeyDown={(e) => handleCellKeyDown(e, scrollRef.current, students.length)}
                            onFocus={(e) => e.currentTarget.select()}
                            {...cellAttrs(rowIndex, colIndex)}
                            className={`h-9 w-full min-w-[38px] rounded-md border px-0.5 text-center text-[13px] font-bold tabular-nums outline-none transition focus:ring-2 focus:ring-focus-ring/30 ${cellTone(raw, maxScore)}`}
                          />
                          {saved && (
                            <span
                              className="pointer-events-none absolute top-0 right-0 h-1.5 w-1.5 rounded-full bg-success"
                              aria-hidden="true"
                            />
                          )}
                        </td>
                      )
                    })}

                    <td className="sticky right-[76px] z-10 w-[72px] min-w-[72px] border-l border-divider bg-bg-surface px-2 py-1.5 text-center font-bold text-text-heading tabular-nums shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.08)] group-hover:bg-paper">
                      {total === '' ? '—' : total}
                    </td>
                    <td className="sticky right-0 z-10 w-[76px] min-w-[76px] border-l border-divider bg-bg-surface px-2 py-1.5 text-center font-bold text-brand tabular-nums group-hover:bg-paper">
                      {average === '' ? '—' : average}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------- phone / tablet */}
      <div className="lg:hidden">
        <p className="mb-3 rounded-lg bg-paper px-3 py-2.5 text-xs leading-relaxed text-text-muted">
          អេក្រង់តូចបង្ហាញសង្ខេបប្រចាំសិស្ស។ ដើម្បីកែពិន្ទុ សូមប្តូរទៅ
          <span className="font-bold text-text-heading"> បញ្ចូលប្រចាំថ្ងៃ </span>
          រួចជ្រើសរើសថ្ងៃ។
        </p>

        <ul className="flex flex-col gap-2.5">
          {students.map((stu, rowIndex) => {
            const { total, average, count } = studentTotals(scores[stu.id])
            const percent =
              workingDays.length === 0 ? 0 : Math.round((count / workingDays.length) * 100)

            return (
              <li
                key={stu.id}
                className="rounded-xl border border-divider bg-bg-surface p-3 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-baseline gap-1.5 font-bold text-text-heading">
                    <span className="text-xs text-text-muted tabular-nums">
                      {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}.
                    </span>
                    <span className="min-w-0 truncate">{stu.name_kh || stu.name_en}</span>
                  </p>
                  <p className="shrink-0 text-sm font-bold text-brand tabular-nums">
                    {average === '' ? '—' : average}
                    <span className="ml-1 text-[10px] font-normal text-text-muted">មធ្យមភាគ</span>
                  </p>
                </div>

                <p className="mt-1 text-[11px] text-text-muted">
                  សរុប {total === '' ? '—' : total} · បានបញ្ចូល {toKhmerNumber(count)}/
                  {toKhmerNumber(workingDays.length)} ថ្ងៃ
                </p>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-divider">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Missing days, as buttons that open the day in daily mode. */}
                {onPickDay && count < workingDays.length && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="text-[11px] font-bold text-text-muted">ខ្វះថ្ងៃ៖</span>
                    {workingDays
                      .filter((d) => markValue(scores[stu.id]?.[d.dayNum]) === null)
                      .slice(0, 12)
                      .map((d) => (
                        <button
                          key={d.dayNum}
                          type="button"
                          onClick={() => onPickDay(d.dayNum)}
                          aria-label={`បញ្ចូលពិន្ទុថ្ងៃទី ${d.dayNum} សម្រាប់ ${stu.name_kh || stu.name_en}`}
                          className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-[11px] font-bold text-warning transition hover:bg-warning/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          {toKhmerNumber(d.dayNum)}
                        </button>
                      ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export default HomeworkMonthlyGrid
