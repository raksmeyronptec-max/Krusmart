/**
 * Builds the document templates that ship with the app.
 *
 *     node scripts/build-report-templates.mts
 *
 * WHY A SCRIPT RATHER THAN A CHECKED-IN BINARY
 * A .xlsx is a zip: it does not diff, so a template committed as a blob is a
 * file nobody can review and nobody can explain. This script is the reviewable
 * source, and the .xlsx it writes is the build artefact. Editing the layout
 * means editing readable code here, not opening Excel and hoping.
 *
 * PROVENANCE — read this before treating the output as official.
 * `score_monthly_v1` is DERIVED from two screens this product already ships:
 * the page header, the column set and the A4-landscape page setup come from
 * `/score/print` ("តារាងពិន្ទុតាមទម្រង់ក្រសួង"), and the per-subject column
 * region comes from `/score/total`'s grouped grid. Both are output the product
 * has been producing, so nothing here is invented — but neither is it a
 * transcription of a ministry file. That is why the registry marks it
 * `provenance: 'derived'` and the Print Center says so on the card. A real
 * ministry .xlsx supersedes it as v2; nothing in the engine changes when it
 * does.
 *
 * The tokens below are the contract with `lib/reporting/report-mapper.ts`.
 * Moving a column here needs no TypeScript change anywhere (§10).
 */

import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// The markers come from the mapper rather than being retyped: a template whose
// marker text drifts from the writer's is a template the writer silently skips.
import { ROW_MARKER, SUBJECT_MARKER } from '../lib/reporting/report-mapper.ts'
import { writeDocx, type DocxParagraph, type DocxRun } from './docx-template-kit.mts'

const OUT_DIR = 'lib/reporting/templates'

/** Borders on every cell of the table, matching the HTML's 1px black grid. */
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
}

const CENTER: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true }

/** The Khmer faces the app uses. Falls back gracefully if absent on the printer. */
const KH = 'Khmer OS Battambang'
const KH_MOUL = 'Khmer OS Muol Light'

// ===========================================================================
// The shared table-template builder
// ===========================================================================

/**
 * Every class table this product prints has the same bones: a Khmer letterhead,
 * a header row of fixed columns wrapped around one variable subject region, one
 * marked data row, and a signature block. The first four templates each wrote
 * those bones out by hand, which was fine at four and would be indefensible at
 * fourteen — ten more copies is ten more places for a border style or a print
 * title to drift.
 *
 * So the bones are a function and each template is a specification. This is the
 * document-template counterpart of the rule the resolvers already follow: the
 * layout differs per report, the machinery does not.
 *
 * The four existing builders are deliberately NOT rewritten onto this. They are
 * verified output that teachers' documents already depend on, and re-deriving
 * them to save duplication would risk a real regression to buy tidiness.
 */
interface TableColumnSpec {
  label: string
  /** The `{{token}}` written into the data row. Empty for a spacer. */
  token: string
  width: number
  align?: 'left' | 'center'
  /** Rotate the header text, for a narrow column with a long name. */
  rotate?: boolean
}

interface TableTemplateSpec {
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

async function buildTableTemplate(spec: TableTemplateSpec): Promise<void> {
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

  await mkdir(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, spec.file)
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/** The two lines every Cambodian official document opens with. */
const KINGDOM_TITLES = [
  { text: 'ព្រះរាជាណាចក្រកម្ពុជា', size: 12 },
  { text: 'ជាតិ សាសនា ព្រះមហាក្សត្រ', size: 12 },
  { text: '{{school.name}}', size: 11, font: KH },
]

/** The provenance line every derived template carries (§31). */
const DERIVED_NOTE = {
  text: 'ទម្រង់នេះបង្កើតឡើងដោយ KruSmart — មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការរបស់ក្រសួងទេ',
  size: 8,
  italic: true,
  color: 'FF9A6700',
}


async function buildScoreMonthlyV1(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet('ពិន្ទុ', {
    // A4 landscape with 10mm margins — the same page setup /score/print uses,
    // carried in the file so the teacher never sets it in the print dialog.
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 7 }],
  })

  // Fixed columns: three before the subject region, four after.
  const LEAD = ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ']
  const TAIL = ['ពិន្ទុសរុប', 'មធ្យមភាគ', 'និទ្ទេស', 'ចំណាត់ថ្នាក់']
  const SUBJECT_COL = LEAD.length + 1              // the single template subject column
  const TOTAL_COLS = LEAD.length + 1 + TAIL.length

  ws.columns = [
    { width: 6 },   // ល.រ
    { width: 30 },  // name
    { width: 7 },   // gender
    { width: 9 },   // the subject column the generator clones
    { width: 11 }, { width: 11 }, { width: 10 }, { width: 12 },
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  // ------------------------------------------------------------- letterhead
  const heading = (row: number, text: string, size: number, font = KH_MOUL) => {
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = { name: font, size }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  heading(1, 'ព្រះរាជាណាចក្រកម្ពុជា', 12)
  heading(2, 'ជាតិ សាសនា ព្រះមហាក្សត្រ', 12)
  heading(3, '{{school.name}}', 11, KH)
  heading(4, 'តារាងពិន្ទុ {{period.label}}', 13)
  heading(5, 'ថ្នាក់ {{class.name}} · សិស្សសរុប {{class.count}} នាក់ · មធ្យមភាគថ្នាក់ {{class.average}}', 10, KH)
  ws.getRow(6).height = 6

  // ----------------------------------------------------------- header row 7
  const header = ws.getRow(7)
  header.height = 34

  LEAD.forEach((label, i) => {
    const cell = header.getCell(i + 1)
    cell.value = label
    cell.font = { name: KH_MOUL, size: 9 }
    cell.alignment = CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  })

  // The subject region. ONE column in the file; the generator clones it to the
  // width the class's score template needs (§11), copying this cell's style.
  const subjectCell = header.getCell(SUBJECT_COL)
  subjectCell.value = '{{#subjects}}'
  subjectCell.font = { name: KH_MOUL, size: 8 }
  subjectCell.alignment = { ...CENTER, textRotation: 90 }
  subjectCell.border = BORDER
  subjectCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

  TAIL.forEach((label, i) => {
    const cell = header.getCell(SUBJECT_COL + 1 + i)
    cell.value = label
    cell.font = { name: KH_MOUL, size: 9 }
    cell.alignment = CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  })

  // ------------------------------------------------------- data row 8 (one)
  // The generator duplicates this row per pupil, carrying its style.
  const data = ws.getRow(8)
  data.height = 20

  const cells: [number, string, Partial<ExcelJS.Alignment>][] = [
    [1, '{{#rows}}{{row.no}}', CENTER],
    [2, '{{row.name}}', { vertical: 'middle', horizontal: 'left' }],
    [3, '{{row.gender}}', CENTER],
    [SUBJECT_COL, '', CENTER],
    [SUBJECT_COL + 1, '{{row.total}}', CENTER],
    [SUBJECT_COL + 2, '{{row.average}}', CENTER],
    [SUBJECT_COL + 3, '{{row.grade}}', CENTER],
    [SUBJECT_COL + 4, '{{row.rank}}', CENTER],
  ]

  for (const [col, value, alignment] of cells) {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = { name: KH, size: 10 }
    cell.alignment = alignment
    cell.border = BORDER
  }

  // ------------------------------------------------------------ signatures
  ws.getRow(9).height = 10
  ws.mergeCells(`A10:C10`)
  const teacher = ws.getCell('A10')
  teacher.value = 'គ្រូបន្ទុកថ្នាក់\n{{teacher.name}}'
  teacher.font = { name: KH, size: 10 }
  teacher.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }

  ws.mergeCells(`${lastCol(SUBJECT_COL + 1)}10:${lastCol(TOTAL_COLS)}10`)
  const director = ws.getCell(`${lastCol(SUBJECT_COL + 1)}10`)
  director.value = '{{province.date}}\n{{director.role}}\n{{director.name}}'
  director.font = { name: KH, size: 10 }
  director.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
  ws.getRow(10).height = 56

  // Repeat the header on every printed page — a two-page class otherwise gets a
  // second sheet of unlabelled numbers.
  ws.pageSetup.printTitlesRow = '7:7'

  await mkdir(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, 'score_monthly_v1.xlsx')
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/**
 * ranking_monthly v1 — the league table.
 *
 * Same letterhead and page setup as the score sheet, because they are printed
 * from the same office for the same class; what differs is the body. Rank leads
 * the row, the pupil's standing (`ជាប់`/`ធ្លាក់`) closes it, and the class
 * statistics band under the table carries the counts a head teacher reads first.
 *
 * DERIVED, not official — built from what `/ranking` already renders on screen
 * (rank · name · total · average · niddes). No ministry file was transcribed,
 * and the registry and the Print Center card both say so.
 */
async function buildRankingMonthlyV1(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet('ចំណាត់ថ្នាក់', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 7 }],
  })

  const LEAD = ['ចំណាត់ថ្នាក់', 'គោត្តនាម និងនាម', 'ភេទ']
  const TAIL = ['ពិន្ទុសរុប', 'មធ្យមភាគ', 'និទ្ទេស', 'លទ្ធផល']
  const SUBJECT_COL = LEAD.length + 1
  const TOTAL_COLS = LEAD.length + 1 + TAIL.length

  ws.columns = [
    { width: 11 },  // rank
    { width: 30 },  // name
    { width: 7 },   // gender
    { width: 9 },   // the subject column the generator clones
    { width: 11 }, { width: 11 }, { width: 10 }, { width: 10 },
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  const heading = (row: number, text: string, size: number, font = KH_MOUL) => {
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = { name: font, size }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  heading(1, 'ព្រះរាជាណាចក្រកម្ពុជា', 12)
  heading(2, 'ជាតិ សាសនា ព្រះមហាក្សត្រ', 12)
  heading(3, '{{school.name}}', 11, KH)
  heading(4, 'តារាងចំណាត់ថ្នាក់ {{period.label}}', 13)
  heading(5, 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · សិស្សសរុប {{class.count}} នាក់ · មធ្យមភាគថ្នាក់ {{class.average}}', 10, KH)
  ws.getRow(6).height = 6

  const header = ws.getRow(7)
  header.height = 34

  const headerCell = (col: number, value: string, rotate = false) => {
    const cell = header.getCell(col)
    cell.value = value
    cell.font = { name: KH_MOUL, size: rotate ? 8 : 9 }
    cell.alignment = rotate ? { ...CENTER, textRotation: 90 } : CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  }

  LEAD.forEach((label, i) => headerCell(i + 1, label))
  headerCell(SUBJECT_COL, '{{#subjects}}', true)
  TAIL.forEach((label, i) => headerCell(SUBJECT_COL + 1 + i, label))

  const data = ws.getRow(8)
  data.height = 20

  const cells: [number, string, Partial<ExcelJS.Alignment>][] = [
    [1, '{{#rows}}{{row.rank}}', CENTER],
    [2, '{{row.name}}', { vertical: 'middle', horizontal: 'left' }],
    [3, '{{row.gender}}', CENTER],
    [SUBJECT_COL, '', CENTER],
    [SUBJECT_COL + 1, '{{row.total}}', CENTER],
    [SUBJECT_COL + 2, '{{row.average}}', CENTER],
    [SUBJECT_COL + 3, '{{row.grade}}', CENTER],
    [SUBJECT_COL + 4, '{{row.status}}', CENTER],
  ]

  for (const [col, value, alignment] of cells) {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = { name: KH, size: 10 }
    cell.alignment = alignment
    cell.border = BORDER
  }

  // Class statistics band, directly under the table.
  ws.mergeCells(span(10))
  const stats = ws.getCell('A10')
  stats.value =
    'សិស្សមានពិន្ទុ {{class.scored}} នាក់ · ជាប់ {{class.passed}} នាក់ · ធ្លាក់ {{class.failed}} នាក់ · ពិន្ទុជាប់ {{class.passmark}}'
  stats.font = { name: KH, size: 10 }
  stats.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(10).height = 20

  ws.getRow(11).height = 10
  ws.mergeCells('A12:C12')
  const teacher = ws.getCell('A12')
  teacher.value = 'គ្រូបន្ទុកថ្នាក់\n{{teacher.name}}'
  teacher.font = { name: KH, size: 10 }
  teacher.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }

  ws.mergeCells(`${lastCol(SUBJECT_COL + 1)}12:${lastCol(TOTAL_COLS)}12`)
  const director = ws.getCell(`${lastCol(SUBJECT_COL + 1)}12`)
  director.value = '{{province.date}}\n{{director.role}}\n{{director.name}}'
  director.font = { name: KH, size: 10 }
  director.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
  ws.getRow(12).height = 56

  ws.pageSetup.printTitlesRow = '7:7'

  await mkdir(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, 'ranking_monthly_v1.xlsx')
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/**
 * ranking_semester v1 — the semester league table.
 *
 * The monthly ranking sheet plus the two halves a semester average is made of,
 * because "why is this pupil 4.0 when they wrote 8?" is the first question a
 * semester sheet gets, and it is unanswerable unless the exam and coursework
 * columns are both on the paper.
 *
 * DERIVED, not official — the same provenance as every other template here.
 */
async function buildRankingSemesterV1(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet('ចំណាត់ថ្នាក់ឆមាស', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 7 }],
  })

  const LEAD = ['ចំណាត់ថ្នាក់', 'គោត្តនាម និងនាម', 'ភេទ']
  // The two halves, then the combined result — the audit trail of the average.
  const TAIL = ['ម.ភាគប្រឡង', 'ម.ភាគប្រចាំខែ', 'មធ្យមភាគឆមាស', 'និទ្ទេស', 'លទ្ធផល']
  const SUBJECT_COL = LEAD.length + 1
  const TOTAL_COLS = LEAD.length + 1 + TAIL.length

  ws.columns = [
    { width: 11 }, { width: 30 }, { width: 7 },
    { width: 9 },                                   // cloned per subject
    { width: 12 }, { width: 13 }, { width: 13 }, { width: 10 }, { width: 10 },
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  const heading = (row: number, text: string, size: number, font = KH_MOUL) => {
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = { name: font, size }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  heading(1, 'ព្រះរាជាណាចក្រកម្ពុជា', 12)
  heading(2, 'ជាតិ សាសនា ព្រះមហាក្សត្រ', 12)
  heading(3, '{{school.name}}', 11, KH)
  heading(4, 'តារាងចំណាត់ថ្នាក់ {{period.label}}', 13)
  heading(5, 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · សិស្សសរុប {{class.count}} នាក់ · មធ្យមភាគថ្នាក់ {{class.average}}', 10, KH)
  ws.getRow(6).height = 6

  const header = ws.getRow(7)
  header.height = 34

  const headerCell = (col: number, value: string, rotate = false) => {
    const cell = header.getCell(col)
    cell.value = value
    cell.font = { name: KH_MOUL, size: rotate ? 8 : 9 }
    cell.alignment = rotate ? { ...CENTER, textRotation: 90 } : CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  }

  LEAD.forEach((label, i) => headerCell(i + 1, label))
  headerCell(SUBJECT_COL, '{{#subjects}}', true)
  TAIL.forEach((label, i) => headerCell(SUBJECT_COL + 1 + i, label))

  const data = ws.getRow(8)
  data.height = 20

  const cells: [number, string, Partial<ExcelJS.Alignment>][] = [
    [1, '{{#rows}}{{row.rank}}', CENTER],
    [2, '{{row.name}}', { vertical: 'middle', horizontal: 'left' }],
    [3, '{{row.gender}}', CENTER],
    [SUBJECT_COL, '', CENTER],
    [SUBJECT_COL + 1, '{{row.exam}}', CENTER],
    [SUBJECT_COL + 2, '{{row.monthly}}', CENTER],
    [SUBJECT_COL + 3, '{{row.average}}', CENTER],
    [SUBJECT_COL + 4, '{{row.grade}}', CENTER],
    [SUBJECT_COL + 5, '{{row.status}}', CENTER],
  ]

  for (const [col, value, alignment] of cells) {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = { name: KH, size: 10 }
    cell.alignment = alignment
    cell.border = BORDER
  }

  ws.mergeCells(span(10))
  const stats = ws.getCell('A10')
  stats.value =
    'សិស្សមានពិន្ទុ {{class.scored}} នាក់ · ជាប់ {{class.passed}} នាក់ · ធ្លាក់ {{class.failed}} នាក់ · ពិន្ទុជាប់ {{class.passmark}} · គិតលើ {{class.months}} ខែ'
  stats.font = { name: KH, size: 10 }
  stats.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(10).height = 20

  ws.getRow(11).height = 10
  ws.mergeCells('A12:C12')
  const teacher = ws.getCell('A12')
  teacher.value = 'គ្រូបន្ទុកថ្នាក់\n{{teacher.name}}'
  teacher.font = { name: KH, size: 10 }
  teacher.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }

  ws.mergeCells(`${lastCol(SUBJECT_COL + 1)}12:${lastCol(TOTAL_COLS)}12`)
  const director = ws.getCell(`${lastCol(SUBJECT_COL + 1)}12`)
  director.value = '{{province.date}}\n{{director.role}}\n{{director.name}}'
  director.font = { name: KH, size: 10 }
  director.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
  ws.getRow(12).height = 56

  ws.pageSetup.printTitlesRow = '7:7'

  await mkdir(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, 'ranking_semester_v1.xlsx')
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/**
 * honor v1 — the honour roll.
 *
 * Portrait, not landscape: an honour list is a handful of names, and the sheet
 * is meant to go on a wall rather than into a file. The subject region is still
 * dynamic, but narrower — the document leads with who, not with marks.
 *
 * The criteria band under the title is not decoration. It carries the rule and
 * the words "មិនមែនផ្លូវការពីក្រសួងទេ", because the product has no official
 * honour policy and a sheet headed កិត្តិយស would otherwise read as one.
 *
 * DERIVED — both the layout and the criteria.
 */
async function buildHonorV1(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet('កិត្តិយស', {
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
    views: [{ state: 'frozen', ySplit: 8 }],
  })

  const LEAD = ['ល.រ', 'គោត្តនាម និងនាម', 'ភេទ']
  const TAIL = ['មធ្យមភាគ', 'និទ្ទេស', 'ចំណាត់ថ្នាក់']
  const SUBJECT_COL = LEAD.length + 1
  const TOTAL_COLS = LEAD.length + 1 + TAIL.length

  ws.columns = [
    { width: 6 }, { width: 32 }, { width: 7 },
    { width: 9 },                                  // cloned per subject
    { width: 12 }, { width: 12 }, { width: 12 },
  ]

  const lastCol = (n: number) => ws.getRow(1).getCell(n).address.replace(/\d+/g, '')
  const span = (row: number) => `A${row}:${lastCol(TOTAL_COLS)}${row}`

  const heading = (row: number, text: string, size: number, font = KH_MOUL) => {
    ws.mergeCells(span(row))
    const cell = ws.getCell(`A${row}`)
    cell.value = text
    cell.font = { name: font, size }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  }

  heading(1, 'ព្រះរាជាណាចក្រកម្ពុជា', 12)
  heading(2, 'ជាតិ សាសនា ព្រះមហាក្សត្រ', 12)
  heading(3, '{{school.name}}', 11, KH)
  heading(4, 'តារាងកិត្តិយស {{period.label}}', 14)
  heading(5, 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · ទទួលកិត្តិយស {{honor.count}} ក្នុងចំណោម {{honor.total}} នាក់', 10, KH)

  // The rule, and the disclaimer, on the paper itself.
  heading(6, 'លក្ខណៈវិនិច្ឆ័យ៖ {{honor.criteria}}', 9, KH)
  ws.getCell('A6').font = { name: KH, size: 9, italic: true }
  heading(7, '{{honor.provenance}}', 8, KH)
  ws.getCell('A7').font = { name: KH, size: 8, italic: true, color: { argb: 'FF9A6700' } }

  const header = ws.getRow(8)
  header.height = 32

  const headerCell = (col: number, value: string, rotate = false) => {
    const cell = header.getCell(col)
    cell.value = value
    cell.font = { name: KH_MOUL, size: rotate ? 8 : 9 }
    cell.alignment = rotate ? { ...CENTER, textRotation: 90 } : CENTER
    cell.border = BORDER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E0' } }
  }

  LEAD.forEach((label, i) => headerCell(i + 1, label))
  headerCell(SUBJECT_COL, '{{#subjects}}', true)
  TAIL.forEach((label, i) => headerCell(SUBJECT_COL + 1 + i, label))

  const data = ws.getRow(9)
  data.height = 22

  const cells: [number, string, Partial<ExcelJS.Alignment>][] = [
    [1, '{{#rows}}{{row.no}}', CENTER],
    [2, '{{row.name}}', { vertical: 'middle', horizontal: 'left' }],
    [3, '{{row.gender}}', CENTER],
    [SUBJECT_COL, '', CENTER],
    [SUBJECT_COL + 1, '{{row.average}}', CENTER],
    [SUBJECT_COL + 2, '{{row.grade}}', CENTER],
    [SUBJECT_COL + 3, '{{row.rank}}', CENTER],
  ]

  for (const [col, value, alignment] of cells) {
    const cell = data.getCell(col)
    cell.value = value
    cell.font = { name: KH, size: 11 }
    cell.alignment = alignment
    cell.border = BORDER
  }

  ws.mergeCells(span(11))
  const stats = ws.getCell('A11')
  stats.value = 'មធ្យមភាគរបស់សិស្សកិត្តិយស {{honor.average}}'
  stats.font = { name: KH, size: 10 }
  stats.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(11).height = 20

  ws.getRow(12).height = 10
  ws.mergeCells('A13:B13')
  const teacher = ws.getCell('A13')
  teacher.value = 'គ្រូបន្ទុកថ្នាក់\n{{teacher.name}}'
  teacher.font = { name: KH, size: 10 }
  teacher.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }

  ws.mergeCells(`${lastCol(SUBJECT_COL + 1)}13:${lastCol(TOTAL_COLS)}13`)
  const director = ws.getCell(`${lastCol(SUBJECT_COL + 1)}13`)
  director.value = '{{province.date}}\n{{director.role}}\n{{director.name}}'
  director.font = { name: KH, size: 10 }
  director.alignment = { vertical: 'top', horizontal: 'center', wrapText: true }
  ws.getRow(13).height = 56

  ws.pageSetup.printTitlesRow = '8:8'

  await mkdir(OUT_DIR, { recursive: true })
  const path = join(OUT_DIR, 'honor_v1.xlsx')
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

/**
 * `ranking_annual` — the year's league table.
 *
 * Landscape, because the subject region carries a per-subject annual figure
 * beside the two semester averages. The provenance note is not decoration: the
 * semester figures may be the teacher's own stored averages or the system's
 * derived ones, and `{{annual.source}}` is how the sheet says which (§31).
 */
async function buildRankingAnnualV1(): Promise<void> {
  await buildTableTemplate({
    file: 'ranking_annual_v1.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់ប្រចាំឆ្នាំ',
    orientation: 'landscape',
    headerFill: 'FFE7F0FA',
    titles: [
      ...KINGDOM_TITLES,
      { text: 'តារាងចំណាត់ថ្នាក់ប្រចាំឆ្នាំ', size: 14 },
      {
        text: 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · {{period.label}} · សិស្ស {{class.count}} នាក់',
        size: 10,
        font: KH,
      },
      { text: '{{annual.source}}', size: 8, font: KH, italic: true, color: 'FF6B7280' },
    ],
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 6 },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
      { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 30, align: 'left' },
      { label: 'ភេទ', token: '{{row.gender}}', width: 7 },
    ],
    subjectWidth: 9,
    tail: [
      { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 11 },
      { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 11 },
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 11 },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    notes: [
      {
        text: 'មធ្យមភាគថ្នាក់ {{class.average}} · មានពិន្ទុ {{class.scored}} នាក់ · ឡើងថ្នាក់ {{class.promoted}} នាក់ · ត្រួតថ្នាក់ {{class.repeated}} នាក់ · មិនទាន់គ្រប់ {{class.incomplete}} នាក់',
        size: 10,
      },
      DERIVED_NOTE,
    ],
  })
}

/**
 * `certificate` — បណ្ណសរសើរ, one page per pupil, as a real .docx.
 *
 * THE WORD DOCUMENT IS THE DESIGN AUTHORITY (§10). The legacy `/certificate`
 * screen positions Khmer text absolutely over a background image the teacher
 * uploads, then calls `window.print()`. That is a layout only a browser can
 * reproduce, and §40 rules it out as the engine's path — so this is NOT a port
 * of those coordinates. It is a flowed Word document carrying the same FIELDS
 * the legacy sheet prints: the office, the school, the pupil, their class,
 * their placing and average, and the signature block. Nothing was invented, and
 * nothing that only existed as a CSS offset was preserved.
 *
 * PROVENANCE. `derived` — see the registry note. No ministry .docx was
 * supplied, and the sheet says so on its own last line rather than only in
 * metadata (§31).
 *
 * The legacy screen keeps working, untouched (§29): a teacher who wants the
 * image-backed certificate still has it.
 */
async function buildCertificateV1(): Promise<void> {
  const NAVY = '000080'
  const RED = 'C00000'
  const GREY = '6B7280'
  const AMBER = '9A6700'

  /** One centred line. Every token is its own run, so none can split. */
  const line = (
    runs: DocxRun[],
    opts: { align?: 'left' | 'center' | 'right'; spaceAfter?: number; pageBreakBefore?: boolean } = {},
  ): DocxParagraph => ({
    runs,
    align: opts.align ?? 'center',
    spaceAfter: opts.spaceAfter ?? 6,
    pageBreakBefore: opts.pageBreakBefore,
  })

  const text = (
    value: string,
    size: number,
    opts: { font?: string; color?: string; italic?: boolean } = {},
  ): DocxRun => ({ text: value, size, font: opts.font ?? KH, color: opts.color, italic: opts.italic })

  const spacer = (points: number): DocxParagraph => ({ runs: [], align: 'center', spaceAfter: points })

  await writeDocx(join(OUT_DIR, 'certificate_v1.docx'), {
    orientation: 'portrait',
    margin: 18,
    defaultFont: KH,
    defaultSize: 12,
    paragraphs: [
      // The loop tags sit in paragraphs of their own; easy-template-x removes
      // them and repeats everything between, once per pupil.
      line([{ text: '{#rows}', size: 1 }], { spaceAfter: 0 }),

      // `pageBreakBefore` on the FIRST line of the body: certificate 1 opens on
      // page 1, every later one opens on a fresh page, and no blank page is
      // left at either end.
      line([text('ព្រះរាជាណាចក្រកម្ពុជា', 16, { font: KH_MOUL })], { pageBreakBefore: true, spaceAfter: 2 }),
      line([text('ជាតិ សាសនា ព្រះមហាក្សត្រ', 12, { font: KH_MOUL })], { spaceAfter: 10 }),
      line([text('{school.unit1}', 11, { color: NAVY })], { spaceAfter: 2 }),
      line([text('{school.name}', 15, { font: KH_MOUL, color: RED })], { spaceAfter: 24 }),

      line([text('បណ្ណសរសើរ', 34, { font: KH_MOUL, color: NAVY })], { spaceAfter: 24 }),

      line([text('សូមប្រកាសសរសើរជូន', 12)], { spaceAfter: 8 }),
      line([text('{row.name}', 22, { font: KH_MOUL, color: NAVY })], { spaceAfter: 10 }),
      line([
        text('ភេទ ', 12), text('{row.gender}', 12, { color: NAVY }),
        text(' · ថ្នាក់ ', 12), text('{class.name}', 12, { color: NAVY }),
        text(' · ថ្នាក់ទី ', 12), text('{class.grade}', 12, { color: NAVY }),
      ], { spaceAfter: 14 }),

      // The achievement sentence is composed by the resolver from the canonical
      // rank, average and niddes — never re-derived inside the document.
      line([text('{achievement}', 13)], { spaceAfter: 8 }),
      line([text('{period.label}', 12, { color: NAVY })], { spaceAfter: 30 }),

      line([text('{province.date}', 11)], { align: 'right', spaceAfter: 4 }),
      line([text('{director.role}', 11)], { align: 'right', spaceAfter: 30 }),
      line([text('{director.name}', 13, { font: KH_MOUL })], { align: 'right', spaceAfter: 18 }),

      spacer(4),
      line([text('{annual.source}', 8, { color: GREY, italic: true })], { spaceAfter: 2 }),
      line([text('{certificate.provenance}', 8, { color: AMBER, italic: true })], { spaceAfter: 0 }),

      line([{ text: '{/rows}', size: 1 }], { spaceAfter: 0 }),
    ],
  })
  console.log(`  ✓ ${join(OUT_DIR, 'certificate_v1.docx')}`)
}

// ---------------------------------------------------------------- the family

/**
 * The seven yearly templates.
 *
 * Specifications, not seven builders: the letterhead, the header row, the
 * variable region, the repeating row, the notes and the signature block are all
 * `buildTableTemplate`'s. What differs per report is which columns it carries
 * and what the variable region means — subjects for two of them, the year's
 * months for two more, and the scheme's grade bands for the tally sheet. Every
 * one of them says `derived` on its own last line (§20/§31).
 */

/** Lead columns shared by every pupil-row annual sheet. */
const PUPIL_LEAD: TableColumnSpec[] = [
  { label: 'ល.រ', token: '{{row.no}}', width: 6 },
  { label: 'អត្តលេខ', token: '{{row.student_id}}', width: 12 },
  { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 28, align: 'left' },
  { label: 'ភេទ', token: '{{row.gender}}', width: 7 },
]

/** Tail columns shared by the sheets that end in the year's verdict. */
const YEAR_TAIL: TableColumnSpec[] = [
  { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 11 },
  { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 11 },
  { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
  { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
  { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
  { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
]

const CLASS_LINE = {
  text: 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · {{period.label}} · សិស្ស {{class.count}} នាក់',
  size: 10,
  font: KH,
}

const SOURCE_LINE = {
  text: '{{annual.source}}',
  size: 8,
  font: KH,
  italic: true,
  color: 'FF6B7280',
}

const YEAR_TOTALS_NOTE = {
  text: 'មធ្យមភាគថ្នាក់ {{class.average}} · មានពិន្ទុ {{class.scored}} នាក់ · ឡើងថ្នាក់ {{class.promoted}} នាក់ · ត្រួតថ្នាក់ {{class.repeated}} នាក់ · មិនទាន់គ្រប់ {{class.incomplete}} នាក់',
  size: 10,
}

const YEARLY_FILL = 'FFEFF6EE'

async function buildAnnualFamily(): Promise<void> {
  // ------------------------------------------------ បញ្ជីបូកលទ្ធផលសរុប (§12)
  await buildTableTemplate({
    file: 'annual_summary_v1.xlsx',
    sheetName: 'លទ្ធផលសរុប',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'បញ្ជីបូកលទ្ធផលសរុបប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: null,
    tail: YEAR_TAIL,
    notes: [YEAR_TOTALS_NOTE, DERIVED_NOTE],
  })

  // -------------------------------------------- ចំណាត់ថ្នាក់ និងនិទ្ទេស (§13)
  await buildTableTemplate({
    file: 'annual_monthly_ranking_v1.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'ចំណាត់ថ្នាក់ និងនិទ្ទេសប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    // The variable region is the year's MONTHS here — one column per period on
    // the class's own calendar, carrying where the pupil placed that month.
    subjectWidth: 8,
    tail: YEAR_TAIL,
    notes: [
      { text: 'ជួរឈរតាមខែបង្ហាញចំណាត់ថ្នាក់ប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------------------ មធ្យមភាគប្រចាំឆ្នាំ (§14)
  await buildTableTemplate({
    file: 'annual_monthly_average_v1.xlsx',
    sheetName: 'មធ្យមភាគ',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'មធ្យមភាគប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: 8,
    tail: YEAR_TAIL,
    notes: [
      { text: 'ជួរឈរតាមខែបង្ហាញមធ្យមភាគប្រចាំខែ។ ខែដែលមិនទាន់មានពិន្ទុទុកជាទទេ — មិនមែនសូន្យទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------------------ មុខវិជ្ជាប្រចាំឆ្នាំ (§15)
  await buildTableTemplate({
    file: 'annual_subject_v1.xlsx',
    sheetName: 'មុខវិជ្ជា',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'មធ្យមភាគតាមមុខវិជ្ជាប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    lead: PUPIL_LEAD,
    subjectWidth: 9,
    tail: [
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
    ],
    notes: [
      { text: 'មុខវិជ្ជាមកពីទម្រង់ពិន្ទុរបស់ថ្នាក់នេះ — មិនមែនបញ្ជីថេរទេ។', size: 9, italic: true },
      YEAR_TOTALS_NOTE,
      DERIVED_NOTE,
    ],
  })

  // --------------------------------------------- លទ្ធផលតាមមុខវិជ្ជា (§16)
  await buildTableTemplate({
    file: 'annual_subject_results_v1.xlsx',
    sheetName: 'លទ្ធផលមុខវិជ្ជា',
    orientation: 'landscape',
    headerFill: YEARLY_FILL,
    titles: [...KINGDOM_TITLES, { text: 'លទ្ធផលតាមមុខវិជ្ជាប្រចាំឆ្នាំ', size: 14 }, CLASS_LINE, SOURCE_LINE],
    // Rows are SUBJECTS on this sheet, not pupils.
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 6 },
      { label: 'មុខវិជ្ជា', token: '{{row.subject}}', width: 30, align: 'left' },
      { label: 'មានពិន្ទុ', token: '{{row.marked}}', width: 12 },
    ],
    // ...and the variable region is the scheme's own grade bands.
    subjectWidth: 11,
    tail: [
      { label: 'ជាប់មធ្យមភាគ', token: '{{row.pass}}', width: 13 },
      { label: 'ជាប់និទ្ទេស ABC', token: '{{row.pass_abc}}', width: 14 },
      { label: 'ធ្លាក់មធ្យមភាគ', token: '{{row.fail}}', width: 13 },
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 11 },
    ],
    notes: [
      { text: 'តួលេខបង្ហាញជា សរុប (ស្រី)។ មុខវិជ្ជាដែលគ្មានសិស្សណាមានពិន្ទុមិនបង្ហាញទេ។', size: 9, italic: true },
      { text: 'ជាប់ = ពាក់កណ្តាលពិន្ទុពេញ · និទ្ទេស ABC = ៧០% នៃពិន្ទុពេញ · មុខវិជ្ជាសរុប {{class.subjects}}', size: 9, italic: true },
      DERIVED_NOTE,
    ],
  })

  // ------------------------------------- សិស្សឡើងថ្នាក់ / ត្រួតថ្នាក់ (§17/§18)
  for (const [file, sheet, heading] of [
    ['annual_promoted_students_v1.xlsx', 'ឡើងថ្នាក់', 'បញ្ជីរាយនាមសិស្សឡើងថ្នាក់'],
    ['annual_repeated_students_v1.xlsx', 'ត្រួតថ្នាក់', 'បញ្ជីរាយនាមសិស្សត្រួតថ្នាក់'],
  ] as const) {
    await buildTableTemplate({
      file,
      sheetName: sheet,
      orientation: 'landscape',
      headerFill: YEARLY_FILL,
      titles: [
        ...KINGDOM_TITLES,
        { text: heading, size: 14 },
        CLASS_LINE,
        // The rule is printed on the sheet, with the actual threshold in it, so
        // a reader can check the list rather than trust it (§52).
        { text: 'លក្ខណៈវិនិច្ឆ័យ៖ {{list.rule}}', size: 9, font: KH, italic: true },
        SOURCE_LINE,
      ],
      lead: [
        ...PUPIL_LEAD,
        { label: 'ថ្ងៃខែឆ្នាំកំណើត', token: '{{row.dob}}', width: 14 },
      ],
      subjectWidth: null,
      tail: [
        { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 11 },
        { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 11 },
        { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 12 },
        { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
        { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
      ],
      notes: [
        {
          text: 'សរុប {{list.count}} នាក់ ក្នុងនោះស្រី {{list.female}} នាក់ · មធ្យមភាគ {{list.average}}',
          size: 10,
        },
        {
          text: 'សិស្សដែលមិនទាន់មានលទ្ធផលប្រចាំឆ្នាំ ({{class.incomplete}} នាក់) មិនស្ថិតក្នុងបញ្ជីណាមួយទេ។',
          size: 9,
          italic: true,
        },
        DERIVED_NOTE,
      ],
    })
  }
}

/**
 * `student_tracking_record_book` — សៀវភៅសិក្ខាគារិក, one page per pupil.
 *
 * A4 LANDSCAPE and page-oriented, so DOCX rather than XLSX (§24): the unit of
 * this document is a pupil's sheet, not a row of a register. Four sections,
 * matching the form `/record-book` renders:
 *
 *   ក  results per subject — the class's OWN curriculum, expanded from data
 *   ខ  absences, excused and unexcused, per semester
 *   គ  the four behavioural assessments (words, never marks)
 *   ឃ  the year's outcome and the two signatures
 *
 * The subject table nests a `{#subjects}` loop inside the `{#rows}` pupil loop.
 * Each subject's row carries three figures, which reach it through
 * `ReportRow.subjectDetail` — the reason that field exists.
 *
 * `derived`: no ministry .docx was supplied, and the sheet says so on its own
 * last line (§31).
 */
async function buildRecordBookV1(): Promise<void> {
  const NAVY = '000080'
  const HEAD_SHADE = 'EFF6EE'
  const GREY = '6B7280'
  const AMBER = '9A6700'

  const p = (
    text: string,
    opts: {
      size?: number; font?: string; color?: string; italic?: boolean
      align?: 'left' | 'center' | 'right'; spaceAfter?: number; pageBreakBefore?: boolean
    } = {},
  ): DocxParagraph => ({
    runs: text === '' ? [] : [{
      text, size: opts.size ?? 10, font: opts.font ?? KH,
      color: opts.color, italic: opts.italic,
    }],
    align: opts.align ?? 'center',
    spaceAfter: opts.spaceAfter ?? 4,
    pageBreakBefore: opts.pageBreakBefore,
  })

  const cell = (text: string, opts: Parameters<typeof p>[1] = {}, shade?: string) =>
    ({ paragraphs: [p(text, { size: 9, spaceAfter: 0, ...opts })], shade })

  const section = (text: string) =>
    p(text, { size: 11, font: KH_MOUL, color: NAVY, align: 'left', spaceAfter: 4 })

  await writeDocx(join(OUT_DIR, 'student_tracking_record_book_v1.docx'), {
    orientation: 'landscape',
    margin: 14,
    defaultFont: KH,
    defaultSize: 10,
    paragraphs: [
      p('{#rows}', { size: 1, spaceAfter: 0 }),

      // ------------------------------------------------------- letterhead
      p('ព្រះរាជាណាចក្រកម្ពុជា', { size: 12, font: KH_MOUL, spaceAfter: 1, pageBreakBefore: true }),
      p('ជាតិ សាសនា ព្រះមហាក្សត្រ', { size: 10, font: KH_MOUL, spaceAfter: 6 }),
      p('{school.name}', { size: 11, font: KH_MOUL, color: NAVY, spaceAfter: 2 }),
      p('{book.title}', { size: 16, font: KH_MOUL, color: NAVY, spaceAfter: 2 }),
      p('{period.label}', { size: 10, spaceAfter: 8 }),

      // ---------------------------------------------------- identity block
      {
        kind: 'table',
        widths: [45, 30, 45, 30, 45, 40],
        rows: [{
          cells: [
            cell('គោត្តនាម និងនាម', { font: KH_MOUL }, HEAD_SHADE),
            cell('{row.name}', { color: NAVY }),
            cell('ភេទ / អត្តលេខ', { font: KH_MOUL }, HEAD_SHADE),
            cell('{row.gender} / {row.student_id}'),
            cell('ថ្នាក់ / ថ្នាក់ទី', { font: KH_MOUL }, HEAD_SHADE),
            cell('{class.name} / {class.grade}'),
          ],
        }],
      },
      p('', { spaceAfter: 6 }),

      // --------------------------------------- ក. results per subject
      section('ក. លទ្ធផលតាមមុខវិជ្ជា'),
      {
        kind: 'table',
        widths: [110, 40, 40, 45],
        rows: [
          {
            header: true,
            cells: [
              cell('មុខវិជ្ជា', { font: KH_MOUL, align: 'left' }, HEAD_SHADE),
              cell('ឆមាសទី១', { font: KH_MOUL }, HEAD_SHADE),
              cell('ឆមាសទី២', { font: KH_MOUL }, HEAD_SHADE),
              cell('ប្រចាំឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          // The nested loop: one row per subject the CLASS teaches, never a
          // compiled-in list (§21).
          //
          // TWO THINGS HERE ARE THE LIBRARY'S RULES, NOT PREFERENCES, and both
          // were established by probing `easy-template-x` rather than assumed:
          //
          //   - a TABLE-ROW loop opens inside the first cell of the row it
          //     repeats and closes inside the last cell of that SAME row. Tags
          //     placed in rows of their own scope the loop to a column instead,
          //     which repeats the first cell and leaves the rest unfilled.
          //   - inside a loop the item's fields are addressed by BARE name —
          //     `{label}`, not `{subjects.label}`. The dotted form resolves
          //     against the item and silently yields nothing.
          {
            cells: [
              cell('{#subjects}{label}', { align: 'left' }),
              cell('{sem1}'),
              cell('{sem2}'),
              cell('{annual}{/subjects}', { color: NAVY }),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // ------------------------------------------------- ខ. absences
      section('ខ. អវត្តមាន'),
      {
        kind: 'table',
        widths: [60, 55, 55, 65],
        rows: [
          {
            header: true,
            cells: [
              cell('ឆមាស', { font: KH_MOUL }, HEAD_SHADE),
              cell('មានច្បាប់', { font: KH_MOUL }, HEAD_SHADE),
              cell('ឥតច្បាប់', { font: KH_MOUL }, HEAD_SHADE),
              cell('សរុបទាំងឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('ឆមាសទី១'),
              cell('{row.absent_s1_excused}'),
              cell('{row.absent_s1_unexcused}'),
              cell('{row.absent_total}'),
            ],
          },
          {
            cells: [
              cell('ឆមាសទី២'),
              cell('{row.absent_s2_excused}'),
              cell('{row.absent_s2_unexcused}'),
              cell(''),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // --------------------------------------------- គ. behaviour
      section('គ. ការវាយតម្លៃឥរិយាបថ'),
      {
        kind: 'table',
        widths: [59, 59, 59, 58],
        rows: [
          {
            header: true,
            cells: [
              cell('ចំណេះដឹង', { font: KH_MOUL }, HEAD_SHADE),
              cell('បំណិន-ចំណេះធ្វើ', { font: KH_MOUL }, HEAD_SHADE),
              cell('តម្លៃ-សីលធម៌', { font: KH_MOUL }, HEAD_SHADE),
              cell('សាមគ្គីភាព', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('{row.sem_eval_knowledge}'),
              cell('{row.sem_eval_skill}'),
              cell('{row.sem_eval_moral}'),
              cell('{row.sem_eval_participate}'),
            ],
          },
        ],
      },
      p('', { spaceAfter: 6 }),

      // ------------------------------------------------- ឃ. outcome
      section('ឃ. លទ្ធផលប្រចាំឆ្នាំ'),
      {
        kind: 'table',
        widths: [47, 47, 47, 47, 47],
        rows: [
          {
            header: true,
            cells: [
              cell('ម.ភាគ ឆមាសទី១', { font: KH_MOUL }, HEAD_SHADE),
              cell('ម.ភាគ ឆមាសទី២', { font: KH_MOUL }, HEAD_SHADE),
              cell('ម.ភាគប្រចាំឆ្នាំ', { font: KH_MOUL }, HEAD_SHADE),
              cell('និទ្ទេស', { font: KH_MOUL }, HEAD_SHADE),
              cell('ចំណាត់ថ្នាក់ / លទ្ធផល', { font: KH_MOUL }, HEAD_SHADE),
            ],
          },
          {
            cells: [
              cell('{row.sem1}'),
              cell('{row.sem2}'),
              cell('{row.average}', { color: NAVY }),
              cell('{row.grade}'),
              cell('{row.rank} / {row.status}'),
            ],
          },
        ],
      },
      p('', { spaceAfter: 10 }),

      // ---------------------------------------------------- signatures
      {
        kind: 'table',
        widths: [118, 117],
        rows: [{
          cells: [
            { paragraphs: [p('គ្រូបន្ទុកថ្នាក់', { size: 10, spaceAfter: 24 }), p('{teacher.name}', { size: 10, spaceAfter: 0 })] },
            { paragraphs: [p('{province.date}', { size: 9, spaceAfter: 2 }), p('{director.role}', { size: 10, spaceAfter: 24 }), p('{director.name}', { size: 10, spaceAfter: 0 })] },
          ],
        }],
      },

      p('{annual.source}', { size: 8, color: GREY, italic: true, spaceAfter: 1 }),
      p('{book.provenance}', { size: 8, color: AMBER, italic: true, spaceAfter: 0 }),

      p('{/rows}', { size: 1, spaceAfter: 0 }),
    ],
  })
  console.log(`  ✓ ${join(OUT_DIR, 'student_tracking_record_book_v1.docx')}`)
}

/**
 * `score_semester` — the semester marks grid, in register order.
 *
 * The semester counterpart of `score_monthly_v1`, and deliberately NOT a copy
 * of `ranking_semester_v1`: same columns, opposite reading order. A teacher
 * checking marks reads down the register; a teacher posting results reads down
 * the placings. Both print the same numbers because both resolvers come out of
 * `resolveSemesterClass`.
 *
 * The two average columns are separated on purpose — a semester average is half
 * exam and half coursework, and a sheet that showed only the combined figure
 * would make a pupil's missing coursework indistinguishable from a poor exam.
 */
async function buildScoreSemesterV1(): Promise<void> {
  await buildTableTemplate({
    file: 'score_semester_v1.xlsx',
    sheetName: 'ពិន្ទុឆមាស',
    orientation: 'landscape',
    headerFill: 'FFEAF2FB',
    titles: [
      ...KINGDOM_TITLES,
      { text: 'តារាងពិន្ទុ{{period.semester}}', size: 14 },
      {
        text: 'ថ្នាក់ {{class.name}} · ថ្នាក់ទី {{class.grade}} · {{period.label}} · សិស្ស {{class.count}} នាក់',
        size: 10,
        font: KH,
      },
    ],
    lead: [
      { label: 'ល.រ', token: '{{row.no}}', width: 6 },
      { label: 'អត្តលេខ', token: '{{row.student_id}}', width: 12 },
      { label: 'គោត្តនាម និងនាម', token: '{{row.name}}', width: 30, align: 'left' },
      { label: 'ភេទ', token: '{{row.gender}}', width: 7 },
    ],
    subjectWidth: 9,
    tail: [
      { label: 'ម.ភាគប្រឡង', token: '{{row.exam}}', width: 11 },
      { label: 'ម.ភាគប្រចាំខែ', token: '{{row.monthly}}', width: 11 },
      { label: 'ម.ភាគឆមាស', token: '{{row.average}}', width: 12 },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 10 },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 10 },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 10 },
    ],
    notes: [
      {
        text: 'ម.ភាគឆមាស = (ម.ភាគប្រឡង + ម.ភាគប្រចាំខែ) ÷ ២ · គិតលើ {{class.months}} ខែ · ពិន្ទុជាប់ {{class.passmark}}',
        size: 9,
        italic: true,
      },
      {
        text: 'មធ្យមភាគថ្នាក់ {{class.average}} · មានពិន្ទុ {{class.scored}} នាក់ · ជាប់ {{class.passed}} នាក់ · ធ្លាក់ {{class.failed}} នាក់',
        size: 10,
      },
      DERIVED_NOTE,
    ],
  })
}

console.log('Building report document templates...')
await buildScoreMonthlyV1()
await buildRankingMonthlyV1()
await buildRankingSemesterV1()
await buildHonorV1()
await buildRankingAnnualV1()
await buildCertificateV1()
await buildAnnualFamily()
await buildRecordBookV1()
await buildScoreSemesterV1()
console.log('Done.')
