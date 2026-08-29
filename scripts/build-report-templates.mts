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

console.log('Building report document templates...')
await buildScoreMonthlyV1()
console.log('Done.')
