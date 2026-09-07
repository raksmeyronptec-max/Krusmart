import ExcelJS from 'exceljs'

import { cellText, mergeRanges, parseRange } from './xlsx-writer.ts'
// Extension-qualified on purpose, like `xlsx-writer.ts` itself: the node
// harnesses run this module with types stripped but specifiers unresolved.

/**
 * A filled workbook, as something a browser can draw.
 *
 * WHY THIS EXISTS. The generate dialog could say "32 pupils, 3 subjects,
 * average 8.24" and nothing about the *sheet* — so the only way to find out
 * whether the letterhead, the column order or the signature block were right
 * was to generate the file, open Excel, and start over. With thirteen reports
 * on one form and a v1/v2 choice in that same dialog whose entire consequence
 * is visual, that is the question the dialog most needs to answer.
 *
 * WHY A MODEL AND NOT AN HTML STRING. Cells hold pupil names, which teachers
 * type. Handing the browser markup to inject would make every roster an XSS
 * surface for the price of a few lines saved. The caller renders this with
 * React, where text is text.
 *
 * WHY IT READS THE FILLED WORKBOOK rather than the payload. A payload knows the
 * marks; only the template knows the letterhead, the merges, the rotated
 * headers, the summary block and the signature area — which is the whole of
 * what a teacher is checking. Reading back the very buffer that would have been
 * downloaded is the only way the picture cannot disagree with the file.
 *
 * Pure, and deliberately NOT `server-only` — same reasoning as `xlsx-writer.ts`:
 * it takes a Buffer and returns an object, touching no cookie, secret or
 * filesystem, and `scripts/verify-report-preview.mts` proves the round trip
 * under plain node because of it.
 */

/** One drawn cell. Every field is optional so an unstyled cell costs nothing. */
export interface PreviewCell {
  text: string
  colSpan?: number
  rowSpan?: number
  bold?: boolean
  italic?: boolean
  /** Font size in points, as the sheet states it. */
  size?: number
  /** `#rrggbb`, converted from exceljs's `AARRGGBB`. */
  color?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
  /** A 90° header, drawn vertically. */
  rotate?: boolean
  border?: { top?: boolean; left?: boolean; bottom?: boolean; right?: boolean }
}

export interface PreviewRow {
  /** Row height in points, when the sheet sets one. */
  height?: number
  cells: PreviewCell[]
}

export interface SheetPreview {
  name: string
  /** exceljs width units, left to right; `undefined` means the default. */
  columnWidths: (number | undefined)[]
  rows: PreviewRow[]
  /**
   * Pupil rows left out of this preview by the caller's cap, so the UI can say
   * so rather than quietly showing a short class.
   */
  omittedRows: number
}

/** `FFEFF6FF` -> `#eff6ff`. Returns undefined for absent or unusable values. */
function argb(value: string | undefined): string | undefined {
  if (!value) return undefined
  const hex = value.length === 8 ? value.slice(2) : value
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toLowerCase()}` : undefined
}

/** Does this cell draw any rule at all? */
function borderOf(cell: ExcelJS.Cell): PreviewCell['border'] {
  const b = cell.border
  if (!b) return undefined
  const out = {
    top: Boolean(b.top?.style),
    left: Boolean(b.left?.style),
    bottom: Boolean(b.bottom?.style),
    right: Boolean(b.right?.style),
  }
  return out.top || out.left || out.bottom || out.right ? out : undefined
}

function fillOf(cell: ExcelJS.Cell): string | undefined {
  const f = cell.fill
  if (!f || f.type !== 'pattern' || f.pattern !== 'solid') return undefined
  return argb((f.fgColor as { argb?: string } | undefined)?.argb)
}

function alignOf(cell: ExcelJS.Cell): PreviewCell['align'] {
  const h = cell.alignment?.horizontal
  return h === 'left' || h === 'center' || h === 'right' ? h : undefined
}

export interface PreviewOptions {
  /** Worksheet to read. Defaults to the first. */
  sheetName?: string
  /** Reported back on the model; this module never truncates anything itself. */
  omittedRows?: number
}

/**
 * Read a filled workbook into a drawable model.
 *
 * MERGES ARE THE WHOLE DIFFICULTY, exactly as they are in the writer. A merged
 * range has one master carrying the value and style; every other cell in it is
 * a slave that exceljs happily reports the master's value for. Drawing them all
 * would repeat the school's name across fifteen columns instead of spanning it
 * once — so slaves are skipped and the master carries `colSpan`/`rowSpan`. That
 * is what reproduces the form's two-column letterhead, its summary blocks and
 * its signature area rather than a wall of duplicated text.
 */
export async function previewWorkbook(
  buffer: Buffer | ArrayBuffer,
  options: PreviewOptions = {},
): Promise<SheetPreview> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as ArrayBuffer)

  const sheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : workbook.worksheets[0]
  if (!sheet) throw new Error('ទម្រង់ឯកសារនេះគ្មានសន្លឹកកិច្ចការទេ')

  // master "r:c" -> span, and every slave address that must not be drawn.
  const spans = new Map<string, { colSpan: number; rowSpan: number }>()
  const slaves = new Set<string>()
  for (const range of mergeRanges(sheet)) {
    const box = parseRange(range)
    if (!box) continue
    spans.set(`${box.r1}:${box.c1}`, {
      colSpan: box.c2 - box.c1 + 1,
      rowSpan: box.r2 - box.r1 + 1,
    })
    for (let r = box.r1; r <= box.r2; r++) {
      for (let c = box.c1; c <= box.c2; c++) {
        if (r !== box.r1 || c !== box.c1) slaves.add(`${r}:${c}`)
      }
    }
  }

  const columnCount = Math.max(sheet.columnCount, 1)
  const columnWidths: (number | undefined)[] = []
  for (let c = 1; c <= columnCount; c++) columnWidths.push(sheet.getColumn(c).width)

  const rows: PreviewRow[] = []
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const cells: PreviewCell[] = []

    for (let c = 1; c <= columnCount; c++) {
      if (slaves.has(`${r}:${c}`)) continue

      const cell = row.getCell(c)
      const span = spans.get(`${r}:${c}`)
      const font = cell.font

      const out: PreviewCell = { text: cellText(cell) }
      if (span && span.colSpan > 1) out.colSpan = span.colSpan
      if (span && span.rowSpan > 1) out.rowSpan = span.rowSpan
      if (font?.bold) out.bold = true
      if (font?.italic) out.italic = true
      if (font?.size) out.size = font.size
      const color = argb((font?.color as { argb?: string } | undefined)?.argb)
      if (color) out.color = color
      const fill = fillOf(cell)
      if (fill) out.fill = fill
      const align = alignOf(cell)
      if (align) out.align = align
      if (cell.alignment?.textRotation) out.rotate = true
      const border = borderOf(cell)
      if (border) out.border = border

      cells.push(out)
    }

    rows.push({ height: row.height, cells })
  }

  return {
    name: sheet.name,
    columnWidths,
    rows,
    omittedRows: options.omittedRows ?? 0,
  }
}
