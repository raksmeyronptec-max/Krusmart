'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Eye, PencilLine, X } from 'lucide-react'

import { useIsClient } from '@/components/ui/overlay/useIsClient'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash, styleFor, styleForMark } from '@/lib/utils/score-band'
import { DEFAULT_SCHEME_CONFIG, type GradingSchemeConfig } from '@/lib/grading/scheme'
import { markOf } from '@/lib/scores/totals'
import type { ColumnGroup, TotalledStudent } from './scoreTotalConfig'

/**
 * One pupil's results, as a slide-over (§12).
 *
 * Read-only on purpose. The redesign's product principle is that `/score/total`
 * reviews results and `/score/enter` records them, so this offers a link to the
 * entry screen rather than a second set of inputs — duplicating the entry logic
 * here would mean two code paths writing the same marks, which is how the two
 * end up validating differently.
 *
 * A drawer rather than a route because the question is asked *while* reading
 * the table: navigating away would drop the filters, the period and the sort,
 * and the teacher would set all three again to get back.
 *
 * Subjects come from `groups`, which the caller has already narrowed to the
 * class's template, so a de-configured subject cannot reappear here.
 */
export function ScoreTotalStudentDetail({
  student,
  onClose,
  groups,
  scheme = DEFAULT_SCHEME_CONFIG,
  maxByColumn = {},
  enterHref,
  periodLabel,
  rowNumber,
}: {
  /** `null` closes the drawer. */
  student: TotalledStudent | null
  onClose: () => void
  groups: ColumnGroup[]
  scheme?: GradingSchemeConfig
  maxByColumn?: Record<string, number>
  /** Link to score entry, already carrying the period. */
  enterHref: string
  periodLabel: string
  rowNumber?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isClient = useIsClient()
  useOverlay(student !== null, onClose, panelRef)

  if (!isClient || !student) return null

  const average = student.finalAverageForRank || null
  const style = styleFor(average, scheme)

  return createPortal(
    <div
      className="overlay-enter fixed inset-0 z-[100] flex justify-end bg-brand-950/50 backdrop-blur-[2px] print:hidden"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`លទ្ធផលរបស់ ${student.name_kh || student.name_en || 'សិស្ស'}`}
        tabIndex={-1}
        className="drawer-enter flex h-full w-full max-w-md flex-col bg-bg-surface shadow-lg outline-none"
      >
        {/* ------------------------------------------------------- identity */}
        <header className="flex items-start gap-3 border-b border-divider px-5 py-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper text-base font-bold text-brand">
            {student.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getDriveImageUrl(student.photo_url)} alt="" className="h-full w-full object-cover" />
            ) : (
              (student.name_kh || student.name_en || '?').trim().charAt(0)
            )}
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold text-text-heading">
              {student.name_kh || student.name_en || '—'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {[
                rowNumber ? `លេខ ${toKhmerNumber(rowNumber)}` : null,
                student.student_id ? `អត្តលេខ ${student.student_id}` : null,
                periodLabel,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="បិទ"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {/* -------------------------------------------------- headline stats */}
        <div className="grid grid-cols-2 gap-2 border-b border-divider px-5 py-3">
          <div className="rounded-lg border border-divider bg-paper p-3">
            <p className="text-[11px] font-bold text-text-muted">មធ្យមភាគ</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${style.text}`}>
              {formatMark(average)}
              <span className="ml-1.5 text-sm opacity-80">{letterOrDash(average, scheme)}</span>
            </p>
          </div>
          <div className="rounded-lg border border-divider bg-paper p-3">
            <p className="text-[11px] font-bold text-text-muted">ចំណាត់ថ្នាក់</p>
            <p className="mt-1 text-xl font-bold text-text-heading tabular-nums">
              {student.rank ? toKhmerNumber(student.rank) : '—'}
            </p>
          </div>
        </div>

        {/* ---------------------------------------------------- subject marks */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {groups.length === 0 ? (
            <p className="text-sm text-text-muted">មិនទាន់មានមុខវិជ្ជាកំណត់សម្រាប់ថ្នាក់នេះទេ។</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => {
                const marks = group.columns
                  .map((col) => ({
                    key: col.key,
                    label: col.label,
                    raw: student.scores[col.key],
                    isText: col.isText === true,
                    max: maxByColumn[col.key] ?? scheme.maxScore,
                  }))
                  .filter((m) => m.raw !== null && m.raw !== undefined && m.raw !== '')

                if (marks.length === 0) return null

                return (
                  <section key={group.name}>
                    <h3 className="mb-1.5 text-xs font-bold text-text-heading">{group.name}</h3>
                    <ul className="rounded-lg border border-divider">
                      {marks.map((mark) => {
                        const value = markOf(mark.raw)
                        return (
                          <li
                            key={mark.key}
                            className="flex items-center justify-between gap-3 border-t border-divider px-3 py-2 first:border-t-0"
                          >
                            <span className="min-w-0 truncate text-[13px] text-text-body">
                              {mark.label}
                            </span>
                            {mark.isText || value === null ? (
                              <span className="shrink-0 rounded-md bg-paper px-2 py-0.5 text-xs font-bold text-text-body">
                                {String(mark.raw)}
                              </span>
                            ) : (
                              <span
                                className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${styleForMark(value, mark.max, scheme).pill}`}
                              >
                                {formatMark(value)}
                                <span className="ml-0.5 font-normal opacity-70">
                                  /{toKhmerNumber(mark.max)}
                                </span>
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------- actions */}
        <footer className="flex flex-wrap gap-2 border-t border-divider px-5 py-3">
          <Link
            href={`/students/${student.id}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Eye className="h-4 w-4" aria-hidden="true" /> ព័ត៌មានសិស្ស
          </Link>
          <Link
            href={enterHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" /> កែពិន្ទុ
          </Link>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export default ScoreTotalStudentDetail
