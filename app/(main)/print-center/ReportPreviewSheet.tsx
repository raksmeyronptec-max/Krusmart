'use client'

import { useState } from 'react'
import { Minimize2, Maximize2 } from 'lucide-react'

import type { PreviewCell, SheetPreview } from '@/lib/reporting/xlsx-preview'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * The filled sheet, drawn.
 *
 * A picture of the document the teacher is about to download — the letterhead,
 * the class's own subject columns, the summary block and the signature area —
 * built from `previewReport`'s model of the very buffer that would have been
 * saved. It answers the question the counts beside it cannot: not "is this the
 * right class?" but "is this the right *sheet*?"
 *
 * WHY A TABLE AND NOT A CANVAS. The model is a grid of merged, ruled, filled
 * cells; a `<table>` with `colSpan`/`rowSpan` is what that is. It also stays
 * selectable and readable to a screen reader, which an image of a spreadsheet
 * would not be.
 *
 * WHY ZOOM. A landscape sheet is thirty columns wide and lives here inside a
 * dialog. At 100% a teacher sees the first six columns and learns nothing about
 * the layout, which is the only thing they opened it for. Scaling the whole
 * table is one transform and keeps every proportion honest — as against
 * shrinking the font, which would not.
 *
 * `FullscreenGrid` is deliberately not reused: it is desktop-only, collapses
 * under `lg`, and opens its own `useOverlay` overlay, which inside the dialog's
 * overlay is a focus-trap fight for no gain here.
 */

/** exceljs width units are roughly characters; ~7px each plus the cell padding. */
function widthPx(width: number | undefined): number {
  return Math.round((width ?? 9) * 7 + 5)
}

/** Points to CSS pixels, for row heights the sheet sets explicitly. */
function heightPx(height: number | undefined): number | undefined {
  return height === undefined ? undefined : Math.round(height * (96 / 72))
}

const ZOOMS = [0.5, 0.75, 1] as const

function cellStyle(cell: PreviewCell): React.CSSProperties {
  const rule = '1px solid #1e293b'
  return {
    fontWeight: cell.bold ? 700 : undefined,
    fontStyle: cell.italic ? 'italic' : undefined,
    // The sheet's points are close enough to CSS pixels at this scale, and the
    // whole table is scaled anyway — what matters is the relative size.
    fontSize: cell.size ? `${cell.size}px` : undefined,
    color: cell.color,
    backgroundColor: cell.fill,
    textAlign: cell.align,
    borderTop: cell.border?.top ? rule : undefined,
    borderLeft: cell.border?.left ? rule : undefined,
    borderBottom: cell.border?.bottom ? rule : undefined,
    borderRight: cell.border?.right ? rule : undefined,
  }
}

export interface ReportPreviewSheetProps {
  sheet: SheetPreview
  /** Named under the sheet, so the teacher knows which version they are seeing. */
  templateLabel?: string
  /**
   * The document being looked at, and the class and period it covers.
   *
   * A preview inside a dialog inherits its title from the dialog, which is
   * three screenfuls up once a landscape sheet is open and the panel is
   * scrolled. Repeating the two facts that make the picture mean anything —
   * WHICH document, and WHOSE — is not duplication; it is the caption a
   * document review needs to be a review rather than a rendering.
   *
   * Both optional: the caption degrades to the heading it has always had rather
   * than to an empty line.
   */
  documentLabel?: string
  contextLabel?: string
  /**
   * The facts a teacher checks before committing paper — and only the ones
   * actually known.
   *
   * `studentCount` and `subjectCount` come from the resolver that built this
   * very sheet. The paper size and orientation come from the workbook's own
   * page setup, read back in `previewWorkbook`, so a template that declares
   * none shows none. There is deliberately no PAGE COUNT: pagination depends on
   * the printer, the driver and the scale, none of which is knowable here, and
   * a made-up "៤ ទំព័រ" is worse than silence because it looks checkable.
   */
  studentCount?: number
  subjectCount?: number
  formatLabel?: string
}

export function ReportPreviewSheet({
  sheet,
  templateLabel,
  documentLabel,
  contextLabel,
  studentCount,
  subjectCount,
  formatLabel,
}: ReportPreviewSheetProps) {
  const [zoom, setZoom] = useState<number>(0.75)

  const totalWidth = sheet.columnWidths.reduce<number>((sum, w) => sum + widthPx(w), 0)

  /** Only what is known. Every entry here is a value somebody measured. */
  const facts = [
    studentCount !== undefined ? `សិស្ស ${toKhmerNumber(studentCount)} នាក់` : null,
    subjectCount ? `មុខវិជ្ជា ${toKhmerNumber(subjectCount)}` : null,
    sheet.paper ?? null,
    sheet.orientation === 'landscape' ? 'ផ្ដេក' : sheet.orientation === 'portrait' ? 'បញ្ឈរ' : null,
    formatLabel ?? null,
  ].filter((f): f is string => Boolean(f))

  return (
    <div className="rounded-lg border border-divider">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-text-heading">
            {documentLabel ?? 'មើលឯកសារជាមុន'}
          </p>
          {/*
            The three facts under the title, quietest last: whose document,
            which period, which layout version. The layout is last because a
            teacher checking a preview is checking the data first and the
            version only when they were choosing between versions.
          */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-text-muted">
            {contextLabel && <span>{contextLabel}</span>}
            {contextLabel && templateLabel && <span aria-hidden="true">·</span>}
            {templateLabel && <span className="min-w-0">{templateLabel}</span>}
          </p>

          {facts.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-body [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
              {facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="ពង្រីក">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                zoom === z
                  ? 'bg-brand text-brand-contrast'
                  : 'text-text-muted hover:bg-bg-app hover:text-text-body'
              }`}
            >
              {z === 0.5 && <Minimize2 className="mr-1 inline h-3 w-3" aria-hidden="true" />}
              {z === 1 && <Maximize2 className="mr-1 inline h-3 w-3" aria-hidden="true" />}
              {toKhmerNumber(Math.round(z * 100))}%
            </button>
          ))}
        </div>
      </div>

      {/*
        Its own horizontal scroller. A landscape sheet is wider than any dialog,
        and wide content scrolls inside itself here rather than pushing the page
        sideways. Focusable and labelled, because a scroll region with no
        focusable child cannot be reached from the keyboard.
      */}
      <div
        tabIndex={0}
        role="region"
        aria-label={`មើលឯកសារជាមុន ${sheet.name}`}
        className="max-h-[46vh] overflow-auto bg-paper p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <div
          style={{
            width: totalWidth * zoom,
            height: 'fit-content',
          }}
        >
          <table
            className="border-collapse bg-white text-black"
            style={{
              width: totalWidth,
              tableLayout: 'fixed',
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              fontFamily: '"Khmer OS Battambang", "Hanuman", serif',
            }}
          >
            <colgroup>
              {sheet.columnWidths.map((w, i) => (
                <col key={i} style={{ width: widthPx(w) }} />
              ))}
            </colgroup>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} style={{ height: heightPx(row.height) }}>
                  {row.cells.map((cell, c) => (
                    <td
                      key={c}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      style={{
                        ...cellStyle(cell),
                        ...(cell.rotate
                          ? {
                            writingMode: 'vertical-rl' as const,
                            transform: 'rotate(180deg)',
                            whiteSpace: 'nowrap' as const,
                          }
                          : { overflow: 'hidden' as const }),
                        verticalAlign: 'middle',
                        padding: '1px 3px',
                      }}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Never a silently short class: say what is not on screen (§36). */}
      {sheet.omittedRows > 0 && (
        <p className="border-t border-divider px-3 py-1.5 text-[11px] text-text-muted">
          បង្ហាញតែជួរដំបូងប៉ុណ្ណោះ — ឯកសារពិតនឹងមានសិស្សបន្ថែម{' '}
          <span className="font-bold">{toKhmerNumber(sheet.omittedRows)}</span> នាក់ទៀត។
        </p>
      )}
    </div>
  )
}
