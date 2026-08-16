'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import { useIsClient } from '@/components/ui/overlay/useIsClient'
import { useOverlay } from '@/components/ui/overlay/useOverlay'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { formatMark, letterOrDash } from '@/lib/utils/score-band'
import type { ColumnGroup, TotalledStudent } from './scoreTotalConfig'
import type { Settings } from '@/lib/types'

/**
 * Print preview for the totals table.
 *
 * What goes on paper is not what is on screen: the colour bands, the row menus
 * and the scroll container all disappear, the type drops to 8pt, and the sheet
 * gains the letterhead and the two signature blocks a Cambodian school office
 * expects. Showing that as a preview rather than firing `window.print()` blind
 * is the difference between one sheet of paper and four.
 *
 * The preview *is* the printed sheet — same markup, so the page cannot drift
 * from what the teacher was shown. While it is open, every other body child is
 * hidden from print; that rule is scoped to this component's lifetime.
 *
 * Browsers cannot render `@page` margin boxes, so there is no page counter —
 * the date and the class identify the sheet instead.
 */

export interface ScoreTotalPrintProps {
  open: boolean
  onClose: () => void
  rows: TotalledStudent[]
  groups: ColumnGroup[]
  settings: Settings | null
  periodLabel: string
  academicYear: string
  modeLabel: string
}

export function ScoreTotalPrint({
  open,
  onClose,
  rows,
  groups,
  settings,
  periodLabel,
  academicYear,
  modeLabel,
}: ScoreTotalPrintProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isClient = useIsClient()
  useOverlay(open, onClose, panelRef)

  if (!isClient || !open) return null

  const columns = groups.flatMap(g => g.columns)
  const today = new Date().toLocaleDateString('km-KH')

  return createPortal(
    <div
      data-score-print
      className="overlay-enter fixed inset-0 z-[100] overflow-auto bg-brand-950/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          /* Only the sheet goes on paper while this preview is open. */
          body > *:not([data-score-print]) { display: none !important; }
          [data-score-print] {
            position: static !important;
            overflow: visible !important;
            background: #fff !important;
            padding: 0 !important;
            backdrop-filter: none !important;
          }
          .score-sheet-chrome { display: none !important; }
          .score-sheet {
            max-width: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .score-sheet table { break-inside: auto; }
          .score-sheet tr { break-inside: avoid; }
          .score-sheet thead { display: table-header-group; }
        }
        .score-sheet-table { width: 100%; border-collapse: collapse; font-size: 8pt; color: #000; }
        .score-sheet-table th,
        .score-sheet-table td { border: 1px solid #000; padding: 2px 3px; text-align: center; }
        .score-sheet-table th { font-weight: 700; background: #fff; }
        .score-sheet-table .col-name { text-align: left; white-space: nowrap; }
        .score-sheet-table .vertical {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          height: 96px;
          font-weight: 400;
          font-size: 7.5pt;
        }
      `}</style>

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="មើលជាមុនមុនបោះពុម្ព"
        tabIndex={-1}
        className="score-sheet mx-auto max-w-[1100px] rounded-xl bg-white p-6 shadow-lg outline-none"
      >
        <div className="score-sheet-chrome mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
          <p className="text-sm font-bold text-gray-700">
            មើលជាមុន · A4 ផ្តេក · សិស្ស {toKhmerNumber(rows.length)} នាក់
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" printHidden={false} onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" /> បិទ
            </Button>
            <Button printHidden={false} onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" /> បោះពុម្ព
            </Button>
          </div>
        </div>

        {/* ------------------------------------------------------ letterhead */}
        <div className="text-black">
          <div className="mb-2 text-center">
            <p className="kh-moul text-[11pt]">ព្រះរាជាណាចក្រកម្ពុជា</p>
            <p className="kh-moul text-[11pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
          </div>

          <div className="mb-3 flex items-start justify-between text-[9pt]">
            <div className="leading-relaxed">
              <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា'}</p>
              <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា'}</p>
              <p className="font-bold">{settings?.school_name || 'សាលា......'}</p>
            </div>
            <div className="text-right leading-relaxed">
              <p>ថ្នាក់៖ {settings?.class_name || '—'}</p>
              <p>ឆ្នាំសិក្សា៖ {academicYear}</p>
              <p>កាលបរិច្ឆេទ៖ {today}</p>
            </div>
          </div>

          <h1 className="kh-moul mb-3 text-center text-[13pt]">
            តារាងពិន្ទុ{modeLabel} {periodLabel}
          </h1>

          {/* ----------------------------------------------------- the table */}
          <table className="score-sheet-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: '28px' }}>ល.រ</th>
                <th rowSpan={2} className="col-name" style={{ minWidth: '130px' }}>ឈ្មោះសិស្ស</th>
                <th rowSpan={2} style={{ width: '30px' }}>ភេទ</th>
                {groups.map((g) => (
                  <th key={g.name} colSpan={g.columns.length}>{g.name}</th>
                ))}
                <th rowSpan={2} style={{ width: '48px' }}>មធ្យមភាគ</th>
                <th rowSpan={2} style={{ width: '34px' }}>និទ្ទេស</th>
                <th rowSpan={2} style={{ width: '34px' }}>ចំណាត់ថ្នាក់</th>
              </tr>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} style={{ width: '22px' }}>
                    <span className="vertical inline-block">{c.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((stu, i) => {
                const avg = stu.finalAverageForRank || null
                return (
                  <tr key={stu.id}>
                    <td>{toKhmerNumber(i + 1)}</td>
                    <td className="col-name">{stu.name_kh || stu.name_en}</td>
                    <td>{stu.gender || '—'}</td>
                    {columns.map((c) => {
                      const raw = stu.scores[c.key]
                      const numeric = Number(raw)
                      return (
                        <td key={c.key} className={Number.isFinite(numeric) && numeric < 5 ? 'font-bold' : ''}>
                          {raw === null || raw === undefined || raw === ''
                            ? '—'
                            : Number.isFinite(numeric) ? formatMark(numeric) : String(raw)}
                        </td>
                      )
                    })}
                    <td className="font-bold">{formatMark(avg)}</td>
                    <td>{letterOrDash(avg)}</td>
                    <td>{stu.rank ? toKhmerNumber(stu.rank) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* -------------------------------------------------- signatures */}
          <div className="mt-6 grid grid-cols-2 gap-8 text-center text-[9.5pt]">
            <div className="kh-moul leading-relaxed">
              <p className="mb-1">ថ្ងៃទី......ខែ......ឆ្នាំ......</p>
              <p>គ្រូប្រចាំថ្នាក់</p>
              <div className="h-14" />
              <p>{settings?.homeroom_teacher || ''}</p>
            </div>
            <div className="kh-moul leading-relaxed">
              <p className="mb-1">បានឃើញ និងឯកភាព</p>
              <p>{settings?.manager_role || 'នាយកសាលា'}</p>
              <div className="h-14" />
              <p>{settings?.manager_name || ''}</p>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default ScoreTotalPrint
