'use client'

import Link from 'next/link'
import { Eye, PencilLine } from 'lucide-react'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash, numericCell, styleFor, styleForMark } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import type { GridColumn, TotalledStudent } from './scoreTotalConfig'

/**
 * The totals table, below `lg`.
 *
 * A twenty-nine column table on a phone is a table nobody reads: the pupil's
 * name is off-screen by the third subject. The card keeps the two things a
 * teacher is scanning for — who, and how are they doing — always visible, and
 * lists the subjects underneath in the same order the table uses.
 *
 * Read-only by design. Editing a mark goes to `/score/enter`, which is built
 * for a thumb; the inline inputs stay a desktop affordance.
 */

export interface ScoreTotalCardsProps {
  rows: TotalledStudent[]
  columns: GridColumn[]
  /** Link target for "edit scores", already carrying the period. */
  enterHref: string
  rowNumbers: Map<string, number>
  /** The class's grading scheme; letters and colours follow it. */
  scheme?: GradingSchemeConfig
  /** Full mark per column id, so a mark pill bands on its own scale. */
  maxByColumn?: Record<string, number>
}

export function ScoreTotalCards({
  rows, columns, enterHref, rowNumbers,
  scheme = DEFAULT_SCHEME_CONFIG, maxByColumn = {},
}: ScoreTotalCardsProps) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((stu) => {
        const avg = stu.finalAverageForRank || null
        const style = styleFor(avg, scheme)
        const marks = columns
          .map(c => ({ key: c.key, label: c.label, value: stu.scores[c.key] }))
          .filter(m => m.value !== null && m.value !== undefined && m.value !== '')

        return (
          <li
            key={stu.id}
            className={`rounded-xl border border-divider bg-bg-surface p-3 shadow-sm ${style.rail}`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-sm font-bold text-brand">
                {stu.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getDriveImageUrl(stu.photo_url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  (stu.name_kh || stu.name_en || '?').trim().charAt(0)
                )}
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/students/${stu.id}`}
                  className="flex items-baseline gap-1.5 font-bold text-text-heading hover:text-brand"
                >
                  <span className="text-xs font-normal text-text-muted tabular-nums">
                    {toKhmerNumber(rowNumbers.get(stu.id) ?? 0)}.
                  </span>
                  <span className="min-w-0 truncate">{stu.name_kh || stu.name_en}</span>
                </Link>
                <p className="text-[11px] text-text-muted">
                  ចំណាត់ថ្នាក់ទី {stu.rank ? toKhmerNumber(stu.rank) : '—'}
                  {stu.gender ? ` · ${stu.gender}` : ''}
                </p>
              </div>

              <span className={`shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums ${style.pill}`}>
                ម.ភ {formatMark(avg)} · {letterOrDash(avg, scheme)}
              </span>
            </div>

            {marks.length > 0 && (
              <ul className="mt-2.5 flex flex-wrap gap-1.5 border-t border-divider pt-2.5">
                {marks.map((m) => {
                  // `numericCell`: `Number('')` is 0, which painted an unmarked
                  // chip as a fail on the phone cards too.
                  const numeric = numericCell(m.value)
                  const cell = numeric !== null
                    ? styleForMark(numeric, maxByColumn[m.key] ?? scheme.maxScore, scheme)
                    : styleFor(null)
                  return (
                    <li
                      key={m.label}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${cell.pill}`}
                    >
                      {m.label}: {numeric !== null ? formatMark(numeric) : String(m.value)}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-2.5 flex gap-2">
              <Link
                href={`/students/${stu.id}`}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-divider text-xs font-bold text-text-body transition hover:border-brand-400 hover:text-brand"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /> មើលលម្អិត
              </Link>
              <Link
                href={enterHref}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand text-xs font-bold text-brand-contrast transition hover:bg-brand-hover"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> កែពិន្ទុ
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default ScoreTotalCards
