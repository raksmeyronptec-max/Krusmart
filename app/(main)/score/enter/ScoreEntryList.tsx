'use client'

import { useRef } from 'react'
import { Check } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { simpleAverage } from '@/lib/grading/scheme'
import { formatMark, letterOrDash, numericCell, styleFor } from '@/lib/utils/score-band'
import { cellAttrs, handleCellKeyDown } from './cellNav'
import type { SubjectColumn } from './subjectConfigs'
import type { Student } from '@/lib/types'

/**
 * Entering marks one pupil at a time.
 *
 * The card list is the primary view on a phone and an equal option on a laptop:
 * a teacher who is calling pupils up one by one wants a row per pupil with the
 * name large, while a teacher copying a column off a paper register wants the
 * grid. Both write into the same `values` map through the same `onChange`, so a
 * mark typed in either is indistinguishable by the time it reaches `saveScores`.
 *
 * The field is coloured by the mark and the grade letter is drawn next to it —
 * the letter, not the colour, is what carries the meaning for a colour-blind
 * teacher or a monochrome printout.
 */

export interface ScoreEntryListProps {
  students: Student[]
  columns: SubjectColumn[]
  values: Record<string, Record<string, string | number | null>>
  onChange: (studentId: string, columnId: string, value: string) => void
  /** Cell keys (`studentId:columnId`) written to the database since the last edit. */
  savedCells?: Set<string>
  /** Row number in the *unfiltered* roster, so filtering does not renumber pupils. */
  rowNumbers: Map<string, number>
  maxScore?: number
}

export function ScoreEntryList({
  students,
  columns,
  values,
  onChange,
  savedCells,
  rowNumbers,
  maxScore = 10,
}: ScoreEntryListProps) {
  const containerRef = useRef<HTMLUListElement>(null)
  const single = columns.length === 1

  return (
    <ul ref={containerRef} className="flex flex-col gap-2.5">
      {students.map((stu, rowIndex) => {
        const marks = columns
          .filter((c) => c.type !== 'select')
          .map((c) => numericCell(values[stu.id]?.[c.id]))
        const average = simpleAverage(marks)

        return (
          <li
            key={stu.id}
            className={`rounded-xl border border-divider bg-bg-surface p-3 shadow-sm transition hover:border-brand-400 sm:p-4 ${styleFor(average).rail}`}
          >
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              {/* --------------------------------------------------- identity */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-sm font-bold text-brand">
                  {stu.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getDriveImageUrl(stu.photo_url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (stu.name_kh || stu.name_en || '?').trim().charAt(0)
                  )}
                </span>
                <div className="min-w-0">
                  <p className="flex items-baseline gap-1.5 font-bold text-text-heading">
                    <span className="text-xs text-text-muted tabular-nums">
                      {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}.
                    </span>
                    <span className="min-w-0 truncate">{stu.name_kh || stu.name_en}</span>
                  </p>
                  <p className="truncate text-[11px] text-text-muted">
                    {stu.student_id ? `អ.ល ${stu.student_id}` : 'គ្មានអត្តលេខ'}
                    {stu.gender ? ` · ${stu.gender}` : ''}
                  </p>
                </div>
              </div>

              {/* ------------------------------------------------------ fields */}
              <div
                className={
                  single
                    ? 'flex shrink-0 items-center gap-3'
                    : 'flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end'
                }
              >
                {columns.map((col, colIndex) => {
                  const raw = values[stu.id]?.[col.id] ?? ''
                  const value = numericCell(raw)
                  const style = styleFor(col.type === 'select' ? null : value)
                  const id = `score-${stu.id}-${col.id}`
                  const saved = savedCells?.has(`${stu.id}:${col.id}`)

                  return (
                    <div key={col.id} className="relative">
                      {!single && (
                        <label
                          htmlFor={id}
                          className="mb-1 block text-center text-[10px] font-bold text-text-muted"
                        >
                          {col.label}
                        </label>
                      )}
                      {col.type === 'select' ? (
                        <Select
                          id={id}
                          value={String(raw)}
                          onChange={(v) => onChange(stu.id, col.id, v)}
                          options={col.options ?? []}
                          placeholder="—"
                          ariaLabel={`${col.label} សម្រាប់ ${stu.name_kh || stu.name_en}`}
                          wrapperClassName={single ? 'w-44' : 'w-32'}
                        />
                      ) : (
                        <input
                          id={id}
                          type="number"
                          min={0}
                          max={maxScore}
                          step="0.25"
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`ពិន្ទុសម្រាប់ ${stu.name_kh || stu.name_en}${single ? '' : ` — ${col.label}`}`}
                          value={raw as string | number}
                          onChange={(e) => onChange(stu.id, col.id, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, containerRef.current, students.length)}
                          onFocus={(e) => e.currentTarget.select()}
                          {...cellAttrs(rowIndex, colIndex)}
                          className={[
                            'min-h-11 rounded-lg border text-center font-bold tabular-nums outline-none transition',
                            'focus:ring-2 focus:ring-focus-ring/30',
                            single ? 'w-28 text-2xl' : 'w-[74px] text-base',
                            style.field,
                          ].join(' ')}
                        />
                      )}
                      {saved && (
                        <Check
                          className="pointer-events-none absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-success p-0.5 text-white"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  )
                })}

                {/* ---------------------------------------------- grade letter */}
                <span
                  className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-base font-bold ${styleFor(average).pill}`}
                  title={average === null ? 'មិនទាន់មានពិន្ទុ' : `មធ្យមភាគ ${formatMark(average)}`}
                >
                  {letterOrDash(average)}
                </span>
              </div>
            </div>

            {/* Multi-column subjects hide the running average behind the letter;
                spell it out so the teacher does not have to grade it mentally. */}
            {!single && average !== null && (
              <p className="mt-2 text-right text-[11px] font-bold text-text-muted">
                មធ្យមភាគ៖ <span className={styleFor(average).text}>{formatMark(average)}</span>
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default ScoreEntryList
