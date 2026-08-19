'use client'

import { useRef } from 'react'
import { Check, MoveHorizontal } from 'lucide-react'
import { FullscreenGrid } from '@/components/ui/data/FullscreenGrid'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import {
  coefficientAverage, DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig,
} from '@/lib/grading/scheme'
import { formatMark, letterOrDash, numericCell, styleFor, styleForMark } from '@/lib/utils/score-band'
import { cellAttrs, handleCellKeyDown } from './cellNav'
import type { SubjectColumn } from '@/lib/scores/template'
import type { Student } from '@/lib/types'

/**
 * The spreadsheet view: one row per pupil, one column per mark.
 *
 * This is the shape of the paper register a teacher is usually copying from, so
 * it stays the default on a wide screen. The pupil column and the header row
 * both stick, which is the whole reason the grid is usable at 28 columns — the
 * name must never scroll out from under the mark being typed.
 *
 * `<select>` is used raw for the behavioural columns, deliberately: hundreds of
 * portal-rendered listboxes inside one table is the wrong trade, and the shared
 * `Select` exists for the surrounding chrome. This is the same exception the
 * totals grid already documents.
 */

export interface ScoreEntryGridProps {
  students: Student[]
  columns: SubjectColumn[]
  values: Record<string, Record<string, string | number | null>>
  onChange: (studentId: string, columnId: string, value: string) => void
  savedCells?: Set<string>
  rowNumbers: Map<string, number>
  /**
   * Full mark for one column. A grid can hold columns from a dozen
   * different subjects at once, so the maximum is per column, not per
   * grid — see `maxScoreByColumn` in `lib/scores/template.ts`.
   */
  maxScoreFor?: (columnId: string) => number
  /**
   * The class's grading scheme. Averages, letters and colours all follow it —
   * under `coefficient` weighting the per-pupil average is Σscore ÷ Σ(max÷50)
   * and lands on /50; under the default it is the plain /10 mean, unchanged.
   */
  scheme?: GradingSchemeConfig
}

export function ScoreEntryGrid({
  students,
  columns,
  values,
  onChange,
  savedCells,
  rowNumbers,
  maxScoreFor = () => 10,
  scheme = DEFAULT_SCHEME_CONFIG,
}: ScoreEntryGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    /* `FullscreenGrid` owns the ពេញអេក្រង់ toggle, the scroll region and its
       accessibility contract. Ctrl+S keeps working while expanded — the save
       shortcut is a window listener in `ScoreEnterClient` — which is why the
       expanded hint repeats it; the sticky save bar itself sits behind the
       overlay until the teacher exits. */
    <FullscreenGrid
      label="តារាងបញ្ចូលពិន្ទុ"
      scrollRef={scrollRef}
      hint={
        <span className="flex min-w-0 items-center gap-1.5">
          <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="kh-truncate">
            អូសតារាងទៅឆ្វេង-ស្តាំ · ឈ្មោះសិស្សនៅជាប់នឹងកន្លែងដើម
          </span>
        </span>
      }
      expandedHint="Ctrl+S ដើម្បីរក្សាទុក · ESC ដើម្បីបិទពេញអេក្រង់"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 min-w-[190px] border-b border-divider bg-paper px-3 py-2.5 text-left font-bold text-text-body shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
            >
              សិស្ស ({toKhmerNumber(students.length)})
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                scope="col"
                className="sticky top-0 z-20 border-b border-l border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold whitespace-nowrap text-text-body"
                style={{ minWidth: col.width || '86px' }}
              >
                {col.label}
              </th>
            ))}
            <th
              scope="col"
              className="sticky top-0 z-20 min-w-[84px] border-b border-l border-divider bg-paper px-2 py-2.5 text-center text-xs font-bold text-text-body"
            >
              មធ្យមភាគ
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((stu, rowIndex) => {
            const average = coefficientAverage(
              columns
                .filter((c) => c.type !== 'select')
                .map((c) => ({ score: numericCell(values[stu.id]?.[c.id]), maxScore: maxScoreFor(c.id) })),
              scheme,
            )

            return (
              <tr key={stu.id} className="group border-b border-divider last:border-b-0">
                <th
                  scope="row"
                  className={`sticky left-0 z-10 max-w-[240px] truncate border-r border-divider bg-bg-surface px-3 py-1.5 text-left font-bold text-text-heading shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] group-hover:bg-paper ${styleFor(average, scheme).rail}`}
                >
                  <span className="mr-1.5 text-[11px] font-normal text-text-muted tabular-nums">
                    {toKhmerNumber(rowNumbers.get(stu.id) ?? rowIndex + 1)}.
                  </span>
                  {stu.name_kh || stu.name_en}
                </th>

                {columns.map((col, colIndex) => {
                  const raw = values[stu.id]?.[col.id] ?? ''
                  const value = numericCell(raw)
                  const style = styleForMark(col.type === 'select' ? null : value, maxScoreFor(col.id), scheme)
                  const saved = savedCells?.has(`${stu.id}:${col.id}`)
                  const label = `${col.label} សម្រាប់ ${stu.name_kh || stu.name_en}`

                  return (
                    <td key={col.id} className="relative border-l border-divider p-1 text-center">
                      {col.type === 'select' ? (
                        <select
                          aria-label={label}
                          value={String(raw)}
                          onChange={(e) => onChange(stu.id, col.id, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, scrollRef.current, students.length)}
                          {...cellAttrs(rowIndex, colIndex)}
                          className={`w-full min-w-[92px] cursor-pointer rounded-md border px-1 py-2 text-center text-[13px] font-bold outline-none transition focus:ring-2 focus:ring-focus-ring/30 ${raw ? 'border-success bg-success/10 text-success' : 'border-divider bg-bg-surface text-text-muted'}`}
                          style={{ textAlignLast: 'center' }}
                        >
                          <option value="">—</option>
                          {col.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={maxScoreFor(col.id)}
                          step="0.25"
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`ពិន្ទុសម្រាប់ ${stu.name_kh || stu.name_en} — ${col.label}`}
                          value={raw as string | number}
                          onChange={(e) => onChange(stu.id, col.id, e.target.value)}
                          onKeyDown={(e) => handleCellKeyDown(e, scrollRef.current, students.length)}
                          onFocus={(e) => e.currentTarget.select()}
                          {...cellAttrs(rowIndex, colIndex)}
                          className={`min-h-11 w-full rounded-md border px-1 text-center text-[15px] font-bold tabular-nums outline-none transition focus:ring-2 focus:ring-focus-ring/30 sm:min-h-9 ${style.field}`}
                        />
                      )}
                      {saved && (
                        <Check
                          className="pointer-events-none absolute top-0.5 right-0.5 h-3 w-3 rounded-full bg-success p-[1px] text-white"
                          aria-hidden="true"
                        />
                      )}
                    </td>
                  )
                })}

                <td className="border-l border-divider px-2 py-1.5 text-center">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold tabular-nums ${styleFor(average, scheme).pill}`}
                  >
                    {formatMark(average)}
                    <span className="opacity-70">{letterOrDash(average, scheme)}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </FullscreenGrid>
  )
}

export default ScoreEntryGrid
