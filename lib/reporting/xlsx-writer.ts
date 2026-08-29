import ExcelJS from 'exceljs'

import {
  ROW_MARKER,
  SUBJECT_MARKER,
  fillText,
  hasToken,
  type CellValue,
  type ReportPayload,
} from './report-mapper.ts'
// Extension-qualified on purpose: `scripts/verify-reporting.mts` runs this
// module under plain node, which strips types but does not resolve
// extensionless specifiers. Same reason `lib/scores/template.ts` does it.

/**
 * Filling an XLSX template without rebuilding it.
 *
 * §5's requirement is that the *file* carries the formatting — merged cells,
 * fonts, borders, column widths, row heights, page setup, print area, logos,
 * headers and footers — and that generation fills it in rather than
 * reconstructing it. So this loads the template workbook, mutates only cell
 * *values* and the geometry of the two variable regions, and writes it back.
 * Every property this code never touches survives by definition.
 *
 * WHY exceljs AND NOT `xlsx-js-style`
 * The rest of the app builds spreadsheets from arrays with `xlsx-js-style`,
 * which is right for constructing a sheet from nothing. It is the wrong tool
 * for a round trip: SheetJS's community build drops images, headers/footers and
 * most page setup when it re-serialises a workbook it read, which is precisely
 * the list §5 says to preserve. exceljs round-trips them. Both libraries stay —
 * they do different jobs.
 *
 * NOT marked `server-only`, deliberately. This module takes a Buffer and
 * returns a Buffer — it touches no cookie, no secret and no filesystem, so
 * nothing about it is *unsafe* on a client. The `server-only` guards sit on
 * `report-storage.ts` (reads template files) and `report-data.ts` (reads the
 * database as the signed-in user), which is where the actual server capability
 * lives. Keeping this one importable by plain Node is what lets
 * `scripts/verify-reporting.mts` prove the round trip without a browser.
 *
 * It is still server code in practice: exceljs is large, and every caller is a
 * server action. Do not import it from a client component.
 */

/** Read a cell's text, whatever shape exceljs stored it in. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // Rich text: a token typed into a styled cell arrives split across runs.
  if (typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) {
    return v.richText.map((r) => r.text).join('')
  }
  return ''
}

/** Write a resolved value, keeping the cell's existing style untouched. */
function writeCell(cell: ExcelJS.Cell, value: CellValue): void {
  cell.value = value === null ? null : value
}

/**
 * Find the single cell containing a marker, or `null`.
 *
 * Scans rather than taking an address, because the marker's position is a
 * property of the template file and must stay editable in Excel without a code
 * change — the whole point of §10.
 */
function findMarker(
  sheet: ExcelJS.Worksheet,
  marker: string,
): { row: number; col: number } | null {
  let found: { row: number; col: number } | null = null
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found) return
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (found) return
      if (cellText(cell).includes(marker)) found = { row: rowNumber, col: colNumber }
    })
  })
  return found
}

/** `A` -> `1`, `AA` -> `27`. */
function colNumber(letters: string): number {
  let out = 0
  for (const ch of letters) out = out * 26 + (ch.charCodeAt(0) - 64)
  return out
}

interface MergeBox { r1: number; c1: number; r2: number; c2: number }

function parseRange(range: string): MergeBox | null {
  const [a, b] = range.split(':')
  const ma = a?.match(/^([A-Z]+)(\d+)$/)
  const mb = b?.match(/^([A-Z]+)(\d+)$/)
  if (!ma || !mb) return null
  return { c1: colNumber(ma[1]), r1: Number(ma[2]), c2: colNumber(mb[1]), r2: Number(mb[2]) }
}

/** The sheet's merge ranges. Not on exceljs's public Worksheet type. */
function mergeRanges(sheet: ExcelJS.Worksheet): string[] {
  const model = (sheet as unknown as { model?: { merges?: string[] } }).model
  return [...(model?.merges ?? [])]
}

/**
 * Widen the subject region to the number of subjects the class actually has.
 *
 * The template carries ONE subject column, marked `{{#subjects}}` in its header.
 * This clones it to the width the payload needs, so every extra column inherits
 * the anchor's width, borders, font and alignment.
 *
 * MERGES ARE HANDLED BY HAND, and they are the whole difficulty here.
 * `spliceColumns` does two damaging things to a merged sheet: it leaves merge
 * ranges pointing at their old coordinates, so a letterhead merged `A1:H1`
 * still spans eight columns over a twelve-column table; and it drops the value
 * of any merged master whose range straddles the splice, which silently blanks
 * the school name and the report title. Both were caught by
 * `scripts/verify-reporting.mts` against a real generated file.
 *
 * So: unmerge everything first, remember each master's value and style, splice,
 * then re-merge at shifted coordinates and put the values back. A range that
 * starts after the anchor moves wholly; one that spans the anchor only extends
 * its right edge — which is what makes a full-width heading stay full-width.
 *
 * Returns the column index range the subject region now occupies.
 */
function expandSubjectColumns(
  sheet: ExcelJS.Worksheet,
  anchorCol: number,
  count: number,
): { first: number; last: number } {
  if (count <= 1) return { first: anchorCol, last: anchorCol }

  const shift = count - 1
  const width = sheet.getColumn(anchorCol).width

  // Remember every merge, with the master's content, before disturbing it.
  const saved = mergeRanges(sheet)
    .map((range) => {
      const box = parseRange(range)
      if (!box) return null
      const master = sheet.getRow(box.r1).getCell(box.c1)
      return { box, value: master.value, style: { ...master.style } }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  for (const { box } of saved) {
    sheet.unMergeCells(box.r1, box.c1, box.r2, box.c2)
  }

  for (let i = 0; i < shift; i++) {
    sheet.spliceColumns(anchorCol + 1, 0, [])
    const clone = sheet.getColumn(anchorCol + 1 + i)
    if (width !== undefined) clone.width = width
  }

  // `spliceColumns` carries no per-cell style, so copy the anchor cell's style
  // down each cloned column for every row the template defines. Without this
  // the extra subject columns print without borders — visible on paper, and
  // exactly the formatting loss §5 exists to prevent.
  for (let r = 1; r <= sheet.rowCount; r++) {
    const source = sheet.getRow(r).getCell(anchorCol)
    if (!source.style) continue
    for (let c = anchorCol + 1; c < anchorCol + count; c++) {
      sheet.getRow(r).getCell(c).style = { ...source.style }
    }
  }

  // Re-merge at the new coordinates, then restore the master. Order matters:
  // merging first clears the slaves, so writing the value afterwards is what
  // survives into the file.
  for (const { box, value, style } of saved) {
    const c1 = box.c1 > anchorCol ? box.c1 + shift : box.c1
    const c2 = box.c2 >= anchorCol ? box.c2 + shift : box.c2
    sheet.mergeCells(box.r1, c1, box.r2, c2)
    const master = sheet.getRow(box.r1).getCell(c1)
    master.value = value ?? null
    master.style = style
  }

  return { first: anchorCol, last: anchorCol + count - 1 }
}

/**
 * Grow the repeating block to one row per pupil.
 *
 * The template carries one marked row, styled the way every data row should
 * look. `duplicateRow` is exceljs's own row clone and carries height, borders
 * and fonts, so the hundredth pupil's row is formatted like the first.
 */
function expandRows(sheet: ExcelJS.Worksheet, markerRow: number, count: number): void {
  if (count > 1) sheet.duplicateRow(markerRow, count - 1, true)
}

export interface XlsxFillOptions {
  /** Worksheet to fill. Defaults to the first. */
  sheetName?: string
}

/**
 * Fill a template workbook with a payload and return the finished file.
 *
 * Order matters and is not arbitrary:
 *
 *   1. widen the subject region  — changes column indices
 *   2. grow the repeating block  — changes row indices
 *   3. write the subject headers
 *   4. write one row per pupil
 *   5. write the scalars last, over whatever is left
 *
 * Geometry before content, because every write after step 2 addresses cells by
 * their final position. Scalars last because they are the only step that scans
 * the whole sheet, and scanning before the sheet has its final shape would miss
 * the cells the earlier steps created.
 */
export async function fillXlsxTemplate(
  templateBuffer: ArrayBuffer | Buffer,
  payload: ReportPayload,
  options: XlsxFillOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(templateBuffer as ArrayBuffer)

  const sheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : workbook.worksheets[0]
  if (!sheet) throw new Error('ទម្រង់ឯកសារនេះគ្មានសន្លឹកកិច្ចការទេ')

  // ---------------------------------------------------------- 1. subjects
  const subjectAnchor = findMarker(sheet, SUBJECT_MARKER)
  let subjectRange: { first: number; last: number } | null = null
  if (subjectAnchor && payload.subjects.length > 0) {
    subjectRange = expandSubjectColumns(sheet, subjectAnchor.col, payload.subjects.length)
  }

  // ------------------------------------------------------------- 2. rows
  const rowAnchor = findMarker(sheet, ROW_MARKER)
  if (rowAnchor && payload.rows.length > 0) {
    expandRows(sheet, rowAnchor.row, payload.rows.length)
  }

  // -------------------------------------------------- 3. subject headers
  if (subjectAnchor && subjectRange) {
    payload.subjects.forEach((subject, i) => {
      const cell = sheet.getRow(subjectAnchor.row).getCell(subjectRange.first + i)
      cell.value = subject.label
    })
  }

  // ---------------------------------------------------------- 4. pupils
  if (rowAnchor) {
    if (payload.rows.length === 0) {
      // Nothing to print: blank the marker so `{{#rows}}` never reaches paper.
      const cell = sheet.getRow(rowAnchor.row).getCell(rowAnchor.col)
      cell.value = fillText(cellText(cell).replace(ROW_MARKER, ''), payload)
    } else {
      payload.rows.forEach((row, i) => {
        const target = sheet.getRow(rowAnchor.row + i)

        target.eachCell({ includeEmpty: true }, (cell) => {
          const text = cellText(cell)
          if (!text) return
          if (text.includes(ROW_MARKER)) {
            writeCell(cell, fillText(text.replace(ROW_MARKER, ''), payload, row))
            return
          }
          if (hasToken(text)) writeCell(cell, fillText(text, payload, row))
        })

        // The subject region: one mark per subject, in payload order.
        if (subjectRange) {
          payload.subjects.forEach((_, s) => {
            const cell = target.getCell(subjectRange.first + s)
            writeCell(cell, row.subjectValues[s] ?? null)
          })
        }
      })
    }
  }

  // --------------------------------------------------------- 5. scalars
  // Everything still holding a token is a header, a title or a signature line.
  // Rows already written are skipped: `fillText` left them token-free.
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const text = cellText(cell)
      if (text && hasToken(text)) writeCell(cell, fillText(text, payload))
    })
  })

  const out = await workbook.xlsx.writeBuffer()
  return Buffer.from(out)
}
