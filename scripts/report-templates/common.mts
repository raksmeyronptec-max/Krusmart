/**
 * Common configuration, fonts, borders, and builder functions for report templates.
 */

import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROW_MARKER, SUBJECT_MARKER, SUBJECT_SUB_MARKER,
} from '../../lib/reporting/report-mapper.ts'

export const OUT_DIR = 'lib/reporting/templates'

/** Borders on every cell of the table, matching the HTML's 1px black grid. */
export const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

export const CENTER: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true }

/** The Khmer faces the app uses. Falls back gracefully if absent on the printer. */
export const KH = 'Khmer OS Battambang'
export const KH_MOUL = 'Khmer OS Muol Light'

export interface TableColumnSpec {
  label: string
  /** The `{{token}}` written into the data row. Empty for a spacer. */
  token: string
  width: number
  align?: 'left' | 'center'
  /** Rotate the header text, for a narrow column with a long name. */
  rotate?: boolean
}

export interface TableTemplateSpec {
  file: string
  sheetName: string
  orientation: 'portrait' | 'landscape'
  /** Letterhead rows, top to bottom. */
  titles: {
    text: string
    size: number
    font?: string
    italic?: boolean
    color?: string
  }[]
  lead: TableColumnSpec[]
  /** Width of the cloned subject column, or null for a table with no subjects. */
  subjectWidth: number | null
  tail: TableColumnSpec[]
  /** Merged note rows under the table — totals, criteria, provenance. */
  notes?: { text: string; size: number; italic?: boolean; color?: string }[]
  /** Header fill, so the report families are distinguishable on paper. */
  headerFill: string
}

export async function buildTableTemplate(spec: TableTemplateSpec): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet(spec.sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: spec.orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: spec.titles.length + 1 }],
  })

  const hasSubjects = spec.subjectWidth !== null
  const SUBJECT_COL = spec.lead.length + 1
  const TAIL_START = SUBJECT_COL + (hasSubjects ? 1 : 0)
  const TOTAL_COLS = spec.lead.length + (hasSubjects ? 1 : 0) + spec.tail.length

  ws.columns = [
    ...spec.lead.map((c) => ({ width: c.width })),
    ...(hasSubjects ? [{ width: spec.subjectWidth as number }] : []),
    ...spec.tail.map((c) => ({ width: c.width })),
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  // ------------------------------------------------------------ letterhead
  spec.titles.forEach((title, i) => {
    const row = i + 1
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = title.text
    cell.font = {
      name: title.font ?? KH_MOUL,
      size: title.size,
      italic: title.italic ?? false,
      ...(title.color ? { color: { argb: title.color } } : {}),
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  // ---------------------------------------------------------- header row
  const headerRow = spec.titles.length + 1
  const header = ws.getRow(headerRow)
  header.height = 34

  const headerCell = (col: number, value: string, rotate = false) => {
    const cell = header.getCell(col)
    cell.value = value
    cell.font = { name: KH_MOUL, size: rotate ? 8 : 9 }
    cell.alignment = rotate ? { ...CENTER, textRotation: 90 } : CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: spec.headerFill } }
  }

  spec.lead.forEach((c, i) => headerCell(i + 1, c.label, c.rotate))
  if (hasSubjects) headerCell(SUBJECT_COL, SUBJECT_MARKER, true)
  spec.tail.forEach((c, i) => headerCell(TAIL_START + i, c.label, c.rotate))

  // ------------------------------------------------------------ data row
  const data = ws.getRow(headerRow + 1)
  data.height = 22

  const dataCell = (col: number, value: string, align: 'left' | 'center') => {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = { name: KH, size: 11 }
    cell.alignment = align === 'left'
      ? { vertical: 'middle', horizontal: 'left' }
      : CENTER
    cell.border = BORDER
  }

  // The repeating marker rides on the FIRST lead cell, so the writer finds the
  // block from the same scan it uses for every other template.
  spec.lead.forEach((c, i) => {
    const token = i === 0 ? `${ROW_MARKER}${c.token}` : c.token
    dataCell(i + 1, token, c.align ?? 'center')
  })
  if (hasSubjects) dataCell(SUBJECT_COL, '', 'center')
  spec.tail.forEach((c, i) => dataCell(TAIL_START + i, c.token, c.align ?? 'center'))

  // --------------------------------------------------------------- notes
  let cursor = headerRow + 3
  for (const note of spec.notes ?? []) {
    ws.mergeCells(span(cursor))
    const cell = ws.getCell(`A${cursor}`)
    cell.value = note.text
    cell.font = {
      name: KH,
      size: note.size,
      italic: note.italic ?? false,
      ...(note.color ? { color: { argb: note.color } } : {}),
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    ws.getRow(cursor).height = 18
    cursor += 1
  }

  // ---------------------------------------------------------- signatures
  cursor += 1
  ws.mergeCells(`A${cursor}:${lastCol(Math.max(2, Math.floor(TOTAL_COLS / 3)))}${cursor}`)
  const teacher = ws.getCell(`A${cursor}`)
  teacher.value = 'គ្រូបន្ទុកថ្នាក់\n{{teacher.name}}'
  teacher.font = { name: KH, size: 10 }
  teacher.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }

  const dirStart = Math.max(3, TOTAL_COLS - Math.max(1, Math.floor(TOTAL_COLS / 3)) + 1)
  ws.mergeCells(`${lastCol(dirStart)}${cursor}:${lastCol(TOTAL_COLS)}${cursor}`)
  const director = ws.getCell(`${lastCol(dirStart)}${cursor}`)
  director.value = '{{province.date}}\n{{director.role}}\n{{director.name}}'
  director.font = { name: KH, size: 10 }
  director.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
  ws.getRow(cursor).height = 56

  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`

  const path = join(OUT_DIR, spec.file)
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/** The two lines every Cambodian official document opens with. */
export const KINGDOM_TITLES = [
  { text: 'ព្រះរាជាណាចក្រកម្ពុជា', size: 12 },
  { text: 'ជាតិ សាសនា ព្រះមហាក្សត្រ', size: 12 },
  { text: '{{school.name}}', size: 11, font: KH },
]

/** The provenance line every derived template carries (§31). */
export const DERIVED_NOTE = {
  text: 'ទម្រង់នេះបង្កើតឡើងដោយ KruSmart — មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការរបស់ក្រសួងទេ',
  size: 8,
  italic: true,
  color: 'FF9A6700',
}

// ---------------------------------------------------------------------------
// School-supplied form builder ("v2")
// ---------------------------------------------------------------------------

export const FORM_INK = 'FF0F172A'          // body text
export const FORM_NAVY = 'FF1E3A8A'         // letterhead
export const FORM_BLUE = 'FF1E40AF'         // emphasis
export const FORM_GRADE = 'FF2563EB'        // និទ្ទេស
export const FORM_RED = 'FFDC2626'          // title, rank, failing band
export const FORM_GREEN = 'FF15803D'        // signature roles
export const FORM_BAND = 'FFEFF6FF'         // header and result-column fill
export const FORM_RULE = 'FF1E293B'         // grid

export const FORM_GRID: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: FORM_RULE } },
  left: { style: 'thin', color: { argb: FORM_RULE } },
  bottom: { style: 'thin', color: { argb: FORM_RULE } },
  right: { style: 'thin', color: { argb: FORM_RULE } },
}

export const FORM_BANDS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface FormColumnSpec {
  label: string
  token: string
  width: number
  align?: 'left' | 'center'
  bold?: boolean
  color?: string
  fill?: string
}

export interface FormTemplateSpec {
  file: string
  sheetName: string
  title: string
  /**
   * An optional line under the academic year — the rule a filtered list
   * applies, say. Takes over row 10, which is otherwise a thin spacer, so the
   * header stays on row 11 for EVERY report on this form. Harnesses and print
   * titles key on that row; a report that moved it would need its own layout
   * table, which is the drift this shared builder exists to prevent.
   */
  subtitle?: string
  lead: FormColumnSpec[]
  /**
   * Width of the single cloned column of the variable region, or `null` for a
   * table that has none. With no region there is nothing for
   * `expandSubjectColumns` to widen, so the two-column split falls at the
   * table's midpoint instead of on the anchor.
   */
  subjectWidth: number | null
  tail: FormColumnSpec[]
  summary: { label: string; token: string }[]
  /**
   * The right-hand summary block. Defaults to the scheme's A–F pupil bands,
   * which is what the supplied form prints.
   *
   * Overridable because that block counts PUPILS per grade, and one report —
   * `annual_subject_results` — has subjects for rows and grade bands for
   * columns. Printing per-pupil band counts beside a per-subject table would
   * be two different populations under one heading. `null` prints no right
   * block at all.
   */
  bands?: { label: string; token: string; color?: string }[] | null
  note: string
  /**
   * A SECOND header line under the variable region, and a caption over it.
   *
   * The two ministry attendance sheets need three header rows where every other
   * report needs one: a caption spanning the whole region (`កាលបរិច្ឆេទ`,
   * `អវត្តមានប្រចាំខែ`), then the per-column label, then a second line under it
   * — the weekday under a date, `ច្ប`/`អច្ប` under a month.
   *
   * The label row stays on row 11 for every report on this form; the sub-row is
   * row 12 and pushes the data row to 13. Nothing moves for a template that
   * does not ask for it.
   */
  subHeader?: {
    /** Caption merged across the whole variable region, on row 10. */
    caption: string
    /** Captions over runs of fixed tail columns, on the same row. */
    tailCaptions?: { label: string; span: number }[]
  }
}

/** The A–F pupil-band block the supplied form carries, as data. */
const DEFAULT_BAND_BLOCK = FORM_BANDS.map((band) => ({
  label: `សិស្សទទួលបាននិទ្ទេស ${band} ៖`,
  token: `{{class.grade_${band.toLowerCase()}}}`,
  color: band === 'F' ? FORM_RED : FORM_GRADE,
}))

export async function buildSchoolFormTemplate(spec: FormTemplateSpec): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet(spec.sheetName, {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 11 }],
  })

  const hasSubjects = spec.subjectWidth !== null
  const SUBJECT_COL = spec.lead.length + 1
  const TAIL_START = SUBJECT_COL + (hasSubjects ? 1 : 0)
  const TOTAL_COLS = spec.lead.length + (hasSubjects ? 1 : 0) + spec.tail.length

  /*
   * Where the two-column letterhead, summary and signature blocks divide.
   *
   * ON THE ANCHOR when there is a variable region, and that is load-bearing:
   * `expandSubjectColumns` widens a merge that *ends at or after* the anchor
   * and shifts one that *starts after* it, so a left block merged up to the
   * anchor grows with the region while the right block rides on the tail. That
   * is what keeps the halves proportional for a class teaching four subjects
   * and one teaching twenty-two. With no region nothing expands, so the
   * midpoint is simply the tidiest split.
   */
  const SPLIT_COL = hasSubjects ? SUBJECT_COL : Math.max(2, Math.ceil(TOTAL_COLS / 2))

  ws.columns = [
    ...spec.lead.map((c) => ({ width: c.width })),
    ...(hasSubjects ? [{ width: spec.subjectWidth as number }] : []),
    ...spec.tail.map((c) => ({ width: c.width })),
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  const left = (row: number, text: string, opts: { font?: string; size?: number; color?: string; bold?: boolean } = {}) => {
    ws.mergeCells(`A${row}:${lastCol(SPLIT_COL)}${row}`)
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = {
      name: opts.font ?? KH,
      size: opts.size ?? 10,
      bold: opts.bold,
      color: { argb: opts.color ?? FORM_INK },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'left' }
  }

  const right = (row: number, text: string, opts: { font?: string; size?: number; color?: string; bold?: boolean } = {}) => {
    ws.mergeCells(`${lastCol(SPLIT_COL + 1)}${row}:${lastCol(TOTAL_COLS)}${row}`)
    const cell = ws.getCell(`${lastCol(SPLIT_COL + 1)}${row}`)
    cell.value = text
    cell.font = {
      name: opts.font ?? KH,
      size: opts.size ?? 10,
      bold: opts.bold,
      color: { argb: opts.color ?? FORM_INK },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  const centerFull = (row: number, text: string, opts: { font?: string; size?: number; color?: string; bold?: boolean } = {}) => {
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = {
      name: opts.font ?? KH,
      size: opts.size ?? 10,
      bold: opts.bold,
      color: { argb: opts.color ?? FORM_INK },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  centerFull(1, 'ព្រះរាជាណាចក្រកម្ពុជា', { font: KH_MOUL, size: 12 })
  centerFull(2, 'ជាតិ សាសនា ព្រះមហាក្សត្រ', { font: KH_MOUL, size: 12 })

  left(3, '{{school.unit1}}')
  left(4, '{{school.unit2}}')
  left(5, '{{school.name}}', { bold: true })
  left(6, 'ថ្នាក់ទី {{class.grade}} "{{class.name}}"', { bold: true, color: FORM_BLUE })

  right(6, 'សិស្សសរុប ៖ {{class.count}} នាក់ / ស្រី ៖ {{class.female}} នាក់', { bold: true, color: FORM_BLUE })
  ws.getRow(7).height = 6

  centerFull(8, spec.title, { font: KH_MOUL, size: 14, color: FORM_RED })
  centerFull(9, 'ឆ្នាំសិក្សា {{period.year}}', { font: KH_MOUL, size: 11, color: FORM_NAVY })
  if (spec.subtitle) {
    centerFull(10, spec.subtitle, { size: 9, color: 'FF475569' })
    ws.getRow(10).height = 16
  } else {
    ws.getRow(10).height = 6
  }

  const HEADER_ROW = 11
  const SUB_ROW = HEADER_ROW + 1
  const hasSub = spec.subHeader !== undefined
  const header = ws.getRow(HEADER_ROW)
  header.height = 36

  const headerCell = (
    col: number,
    label: string,
    opts: { rotate?: boolean; bold?: boolean; color?: string } = {},
    row = HEADER_ROW,
  ) => {
    const cell = ws.getRow(row).getCell(col)
    cell.value = label
    cell.font = {
      name: KH_MOUL,
      size: opts.rotate ? 8 : 9,
      bold: opts.bold,
      color: { argb: opts.color ?? FORM_INK },
    }
    cell.alignment = opts.rotate ? { ...CENTER, textRotation: 90 } : CENTER
    cell.border = FORM_GRID
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FORM_BAND } }
  }

  spec.lead.forEach((c, i) => headerCell(i + 1, c.label))
  if (hasSubjects) headerCell(SUBJECT_COL, SUBJECT_MARKER, { rotate: !hasSub })
  spec.tail.forEach((c, i) => headerCell(TAIL_START + i, c.label, { bold: c.bold, color: c.color }))

  /*
   * The three-row header, for the sheets that ask for it.
   *
   * Row 10 carries the region's caption, merged from the anchor TO the anchor —
   * a horizontal merge ending on it, so `expandSubjectColumns` widens it with
   * the region. Lead and tail columns merge VERTICALLY instead, which is safe
   * at every column except the anchor: a vertical merge there is the one shape
   * the expander turns into a single block swallowing every cloned header.
   */
  if (hasSub) {
    ws.getRow(10).height = 22
    ws.getRow(SUB_ROW).height = 30

    const band = (cell: ExcelJS.Cell, text?: string) => {
      if (text !== undefined) cell.value = text
      cell.font = { name: KH_MOUL, size: 9, color: { argb: FORM_INK } }
      cell.alignment = CENTER
      cell.border = FORM_GRID
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FORM_BAND } }
    }

    band(ws.getRow(10).getCell(SUBJECT_COL), spec.subHeader!.caption)
    // The per-column second line: one marked cell, cloned with the region.
    headerCell(SUBJECT_COL, SUBJECT_SUB_MARKER, {}, SUB_ROW)

    /*
     * Lead columns span all three rows, and the label has to be written AFTER
     * the merge, on row 10.
     *
     * `mergeCells` clears every slave, and row 11 — where `headerCell` put the
     * label a moment ago — is a slave of a merge whose master is row 10. Merge
     * first and write into the master, or `ល.រ` and the pupil's name silently
     * vanish from the header of both attendance sheets.
     */
    spec.lead.forEach((c, i) => {
      const col = i + 1
      band(ws.getRow(10).getCell(col))
      band(ws.getRow(SUB_ROW).getCell(col))
      ws.mergeCells(`${lastCol(col)}10:${lastCol(col)}${SUB_ROW}`)
      band(ws.getRow(10).getCell(col), c.label)
    })

    // Tail: an optional caption over a run of columns, then each column's own
    // label spanning the label and sub rows.
    let at = TAIL_START
    for (const group of spec.subHeader!.tailCaptions ?? []) {
      band(ws.getRow(10).getCell(at), group.label)
      for (let k = 1; k < group.span; k++) band(ws.getRow(10).getCell(at + k))
      if (group.span > 1) ws.mergeCells(`${lastCol(at)}10:${lastCol(at + group.span - 1)}10`)
      at += group.span
    }
    // The tail's master IS row 11, so its label survives the merge — but write
    // it back anyway rather than relying on which end of the range wins.
    spec.tail.forEach((c, i) => {
      const col = TAIL_START + i
      band(ws.getRow(SUB_ROW).getCell(col))
      ws.mergeCells(`${lastCol(col)}${HEADER_ROW}:${lastCol(col)}${SUB_ROW}`)
      headerCell(col, c.label, { bold: c.bold, color: c.color })
    })
  }

  const DATA_ROW = hasSub ? SUB_ROW + 1 : 12
  const data = ws.getRow(DATA_ROW)
  data.height = 22

  const dataCell = (col: number, value: string, align: 'left' | 'center', opts: { bold?: boolean; color?: string; fill?: string } = {}) => {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = {
      name: KH,
      size: 10,
      bold: opts.bold,
      color: { argb: opts.color ?? FORM_INK },
    }
    cell.alignment = align === 'left' ? { vertical: 'middle', horizontal: 'left' } : CENTER
    cell.border = FORM_GRID
    if (opts.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
    }
  }

  spec.lead.forEach((c, i) => {
    const token = i === 0 ? `${ROW_MARKER}${c.token}` : c.token
    dataCell(i + 1, token, c.align ?? 'center', { bold: c.bold, color: c.color, fill: c.fill })
  })
  if (hasSubjects) dataCell(SUBJECT_COL, '', 'center')
  spec.tail.forEach((c, i) => {
    dataCell(TAIL_START + i, c.token, c.align ?? 'center', { bold: c.bold, color: c.color, fill: c.fill })
  })

  /*
   * The summary block divides on the SAME column the letterhead and the
   * signatures do — labels and values left of the split, grade bands right of
   * it. Anchoring the band block to the sheet's right edge instead (which is
   * what it used to do) is fine on a thirty-column sheet and collides outright
   * on a seven-column one: `annual_subject` has three tail columns, so the
   * left value's merge and the band label's merge landed on the same cell and
   * exceljs refused the build. One split for every block is both correct and
   * the only version that cannot drift.
   */
  // One blank row under the marked data row, wherever that ended up.
  const SUMM_ROW = DATA_ROW + 2
  const BAND_LABEL_COL = SPLIT_COL + 1
  const BAND_VALUE_COL = SPLIT_COL + 3
  /** Not every table is wide enough for two blocks side by side. */
  const bandsFit = BAND_VALUE_COL <= TOTAL_COLS

  spec.summary.forEach((line, i) => {
    const row = SUMM_ROW + i
    ws.mergeCells(`A${row}:B${row}`)
    const lbl = ws.getCell(`A${row}`)
    lbl.value = line.label
    lbl.font = { name: KH, size: 9, bold: true, color: { argb: FORM_INK } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left' }

    /*
     * The value MERGES across to the split column — `C66:N66` on the supplied
     * form — rather than sitting in a bare column C.
     *
     * Unmerged it looks right in Excel, because a long string overflows into
     * empty neighbours there. Nowhere else: an HTML table clips it to the
     * column, so the pre-download preview wrapped "៥២ នាក់ ស្រី ១៩ នាក់" onto
     * three lines and collided with the row below — a picture disagreeing with
     * the file it claims to show, which is the one thing that preview must
     * never do. Merging makes both renderings the same by construction.
     */
    if (SPLIT_COL > 3) ws.mergeCells(`C${row}:${lastCol(SPLIT_COL)}${row}`)
    const val = ws.getCell(`C${row}`)
    val.value = line.token
    val.font = { name: KH, size: 9, bold: true, color: { argb: FORM_BLUE } }
    val.alignment = { vertical: 'middle', horizontal: 'right' }
    ws.getRow(row).height = 18
  })

  const bandBlock = spec.bands === null || !bandsFit
    ? []
    : spec.bands ?? DEFAULT_BAND_BLOCK
  bandBlock.forEach((band, i) => {
    const row = SUMM_ROW + i

    ws.mergeCells(`${lastCol(BAND_LABEL_COL)}${row}:${lastCol(BAND_VALUE_COL - 1)}${row}`)
    const lbl = ws.getCell(`${lastCol(BAND_LABEL_COL)}${row}`)
    lbl.value = band.label
    lbl.font = { name: KH, size: 9, bold: true, color: { argb: FORM_INK } }
    lbl.alignment = { vertical: 'middle', horizontal: 'left' }

    ws.mergeCells(`${lastCol(BAND_VALUE_COL)}${row}:${lastCol(TOTAL_COLS)}${row}`)
    const val = ws.getCell(`${lastCol(BAND_VALUE_COL)}${row}`)
    val.value = band.token
    val.font = { name: KH, size: 9, bold: true, color: { argb: band.color ?? FORM_GRADE } }
    val.alignment = { vertical: 'middle', horizontal: 'right' }
  })

  const NOTE_ROW = SUMM_ROW + Math.max(spec.summary.length, bandBlock.length) + 1
  ws.mergeCells(span(NOTE_ROW))
  const note = ws.getCell(`A${NOTE_ROW}`)
  note.value = spec.note
  note.font = { name: KH, size: 9, italic: true, color: { argb: 'FF475569' } }
  note.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(NOTE_ROW).height = 18

  ws.mergeCells(span(NOTE_ROW + 1))
  const prov = ws.getCell(`A${NOTE_ROW + 1}`)
  prov.value = DERIVED_NOTE.text
  prov.font = { name: KH, size: 8, italic: true, color: { argb: DERIVED_NOTE.color } }
  prov.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(NOTE_ROW + 1).height = 16

  const SIGN_ROW = NOTE_ROW + 3
  left(SIGN_ROW, 'បានឃើញ និងឯកភាព', { font: KH_MOUL, size: 10, color: FORM_NAVY })
  left(SIGN_ROW + 1, '{{director.role}}', { font: KH_MOUL, size: 10, color: FORM_GREEN })
  left(SIGN_ROW + 5, '{{director.name}}', { font: KH_MOUL, size: 11, color: FORM_RED })

  right(SIGN_ROW, '{{date.lunar}}', {
    font: KH,
    size: 9,
    color: 'FF475569',
  })
  right(SIGN_ROW + 1, '{{province.date}} {{date.today}}', {
    font: KH,
    size: 10,
    color: FORM_BLUE,
    bold: true,
  })
  right(SIGN_ROW + 2, 'គ្រូបន្ទុកថ្នាក់', { font: KH_MOUL, size: 11, color: FORM_GREEN })
  right(SIGN_ROW + 5, '{{teacher.name}}', { font: KH_MOUL, size: 11, color: FORM_RED })

  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`

  const path = join(OUT_DIR, spec.file)
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

export const FORM_LEAD: FormColumnSpec[] = [
  { label: 'ល.រ', token: '{{row.no}}', width: 5, align: 'center' },
  { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 26, align: 'left', bold: true },
  { label: 'ភេទ', token: '{{row.gender}}', width: 7, align: 'center' },
]

export const NO_RESULT_LINE = 'សិស្សគ្មានលទ្ធផលពេញលេញ ៖'

/** The three fixed columns a LEAGUE TABLE opens with — placing first. */
export const FORM_RANK_LEAD: FormColumnSpec[] = [
  { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, align: 'center', bold: true, color: FORM_RED },
  { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 26, align: 'left', bold: true },
  { label: 'ភេទ', token: '{{row.gender}}', width: 7, align: 'center' },
]

/**
 * The left-hand summary block for a sheet whose verdict is PASS or FAIL — the
 * monthly and semester documents, which split on the class's own `passMark`.
 */
export const FORM_PASS_SUMMARY = [
  { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
  { label: 'សិស្សជាប់មធ្យមភាគ ៖', token: '{{class.passed_tally}}' },
  { label: 'សិស្សក្រោមមធ្យមភាគ ៖', token: '{{class.failed_tally}}' },
  { label: NO_RESULT_LINE, token: '{{class.unmarked_tally}}' },
]

/**
 * The left-hand block for a sheet whose verdict is the YEAR's — promoted,
 * repeated or incomplete. `annualStatus` is the only judge of which; this
 * block never restates a threshold of its own.
 */
export const FORM_YEAR_SUMMARY = [
  { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
  { label: 'សិស្សឡើងថ្នាក់ ៖', token: '{{class.promoted_tally}}' },
  { label: 'សិស្សត្រួតថ្នាក់ ៖', token: '{{class.repeated_tally}}' },
  { label: NO_RESULT_LINE, token: '{{class.incomplete_tally}}' },
]

/** The tail every ANNUAL pupil sheet ends with. */
export const FORM_YEAR_TAIL: FormColumnSpec[] = [
  { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 8 },
  { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 8 },
  { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
  { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
  { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
  { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
]

/** The provenance line the annual sheets carry about where the year came from. */
export const FORM_ANNUAL_SOURCE = '{{annual.source}}'
