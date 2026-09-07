import ExcelJS from 'exceljs'

import {
  ROW_MARKER,
  SUBJECT_MARKER,
  SUBJECT_SUB_MARKER,
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

/**
 * Read a cell's text, whatever shape exceljs stored it in.
 *
 * Exported because `xlsx-preview.ts` reads the SAME cells back out of the
 * filled workbook. Two readers that disagree about what a cell says would put
 * one thing on screen and another in the file, which is precisely the failure
 * a pre-download preview exists to prevent.
 */
export function cellText(cell: ExcelJS.Cell): string {
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

export interface MergeBox { r1: number; c1: number; r2: number; c2: number }

/** `A1:C3` -> a box. `null` for anything that is not a plain A1 range. */
export function parseRange(range: string): MergeBox | null {
  const [a, b] = range.split(':')
  const ma = a?.match(/^([A-Z]+)(\d+)$/)
  const mb = b?.match(/^([A-Z]+)(\d+)$/)
  if (!ma || !mb) return null
  return { c1: colNumber(ma[1]), r1: Number(ma[2]), c2: colNumber(mb[1]), r2: Number(mb[2]) }
}

/** The sheet's merge ranges. Not on exceljs's public Worksheet type. */
export function mergeRanges(sheet: ExcelJS.Worksheet): string[] {
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

  /*
   * Column widths, remembered before the splice and restored after.
   *
   * `spliceColumns` does not carry them reliably: the anchor's own width was
   * being re-applied to a moving target inside the insert loop (each pass
   * pushed the column it had just sized one to the right and sized it again),
   * so the whole cloned region ended up with none; and a run of tail columns
   * sharing one width could lose it outright, because exceljs stores adjacent
   * equal widths as a single `<col min max>` range and the splice does not
   * re-span it. Both print as a sheet of default-width columns — the exact
   * formatting loss §5 exists to prevent, and invisible until someone opens
   * the file, since every value is still correct.
   */
  const widths = new Map<number, number>()
  const columnEnd = Math.max(sheet.columnCount, anchorCol)
  for (let c = 1; c <= columnEnd; c++) {
    const w = sheet.getColumn(c).width
    if (w !== undefined) widths.set(c, w)
  }
  const width = widths.get(anchorCol)

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
  }

  // Put every remembered width back at its shifted index, then give the whole
  // cloned region the anchor's — a subject column is a copy of the anchor, so
  // it is as wide as the anchor.
  for (const [c, w] of widths) {
    sheet.getColumn(c > anchorCol ? c + shift : c).width = w
  }
  if (width !== undefined) {
    for (let c = anchorCol; c <= anchorCol + shift; c++) sheet.getColumn(c).width = width
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

    /*
     * The optional second header line, for the two ministry attendance forms.
     *
     * A date column is headed by its day number over its weekday; a month's
     * absence pair by the month over `ច្ប` / `អច្ប`. Neither fits one row, and
     * the second one also needs the month to SPAN its pair — so where a
     * template carries the sub-marker, adjacent columns sharing a label are
     * merged in the label row above.
     *
     * Gated on the sub-marker rather than applied always: every score sheet
     * that shipped before this has distinct adjacent labels today, but a class
     * that ever grew two columns with one name would silently start printing
     * them merged. Opting in per template keeps that impossible.
     */
    const subAnchor = findMarker(sheet, SUBJECT_SUB_MARKER)
    if (subAnchor) {
      payload.subjects.forEach((subject, i) => {
        const cell = sheet.getRow(subAnchor.row).getCell(subjectRange.first + i)
        cell.value = subject.sublabel ?? null
      })

      /*
       * The caption over the whole region — `កាលបរិច្ឆេទ`, `អវត្តមានប្រចាំខែ`.
       *
       * Merged HERE and not in the template, because a one-column region cannot
       * express "span the region": a merge needs two cells, and before
       * expansion there is only one. `expandSubjectColumns` can widen a merge
       * it finds, not invent one — so the row above the labels is merged across
       * the region once its true width is known.
       *
       * Confined to templates carrying the sub-marker, and to a cell that
       * already has a caption in it. A template without both is untouched.
       */
      const capRow = subjectAnchor.row - 1
      if (capRow >= 1 && payload.subjects.length > 1) {
        const caption = sheet.getRow(capRow).getCell(subjectRange.first)
        const captionText = cellText(caption)
        if (captionText) {
          const style = { ...caption.style }
          sheet.mergeCells(capRow, subjectRange.first, capRow, subjectRange.last)
          const master = sheet.getRow(capRow).getCell(subjectRange.first)
          master.value = captionText
          master.style = style
        }
      }

      // Merge runs of equal label, left to right. `mergeCells` clears the
      // slaves, so the master's value is written back afterwards.
      let runStart = 0
      const flush = (end: number) => {
        if (end <= runStart) return
        const c1 = subjectRange.first + runStart
        const c2 = subjectRange.first + end
        const master = sheet.getRow(subjectAnchor.row).getCell(c1)
        const value = master.value
        sheet.mergeCells(subjectAnchor.row, c1, subjectAnchor.row, c2)
        sheet.getRow(subjectAnchor.row).getCell(c1).value = value
      }
      for (let i = 1; i <= payload.subjects.length; i++) {
        const same = i < payload.subjects.length
          && payload.subjects[i].label === payload.subjects[runStart].label
        if (!same) {
          flush(i - 1)
          runStart = i
        }
      }
    }
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
