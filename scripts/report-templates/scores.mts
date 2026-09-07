/**
 * Builders for Scores family:
 * - score_monthly_v1.xlsx
 * - score_monthly_v2.xlsx
 * - score_semester_v1.xlsx
 */

import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  BORDER,
  CENTER,
  DERIVED_NOTE,
  FORM_BAND,
  FORM_GRADE,
  FORM_LEAD,
  FORM_PASS_SUMMARY,
  FORM_RED,
  KH,
  KH_MOUL,
  KINGDOM_TITLES,
  NO_RESULT_LINE,
  OUT_DIR,
  buildSchoolFormTemplate,
  buildTableTemplate,
} from './common.mts'

export async function buildScoreMonthlyV1(): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KruSmart'
  wb.created = new Date()

  const ws = wb.addWorksheet('ពិន្ទុ', {
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
  const SUBJECT_COL = LEAD.length + 1
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

  ws.pageSetup.printTitlesRow = '7:7'

  const path = join(OUT_DIR, 'scores', 'score_monthly_v1.xlsx')
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

export async function buildScoreMonthlyV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'scores/score_monthly_v2.xlsx',
    sheetName: 'ពិន្ទុ',
    title: 'តារាងសរុបពិន្ទុប្រចាំ {{period.label}}',
    lead: FORM_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ពិន្ទុសរុប', token: '{{row.total}}', width: 9.5, bold: true },
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'ផ្សេងៗ', token: '', width: 12 },
    ],
    summary: [
      { label: 'បញ្ចូលបញ្ជីត្រឹមចំនួន ៖', token: '{{class.roll_tally}}' },
      { label: 'សិស្សជាប់មធ្យមភាគ ៖', token: '{{class.passed_tally}}' },
      { label: 'សិស្សក្រោមមធ្យមភាគ ៖', token: '{{class.failed_tally}}' },
      { label: NO_RESULT_LINE, token: '{{class.unmarked_tally}}' },
    ],
    note: 'មធ្យមភាគគិតលើមុខវិជ្ជាដែលមានពិន្ទុ។ ប្រអប់ទទេមានន័យថាមិនទាន់មានពិន្ទុ — មិនមែនសូន្យទេ។ ពិន្ទុជាប់ {{class.passmark}}',
  })
}

export async function buildScoreSemesterV1(): Promise<void> {
  await buildTableTemplate({
    file: 'scores/score_semester_v1.xlsx',
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


/**
 * `score_semester` v2 — the semester marks grid on the school-supplied form.
 *
 * Same bones as `score_monthly_v2`, and deliberately so: a teacher who has
 * learned to read one of these sheets can read the other. What differs is the
 * tail, which carries the semester's own three figures — the exam half, the
 * coursework half and the average `lib/scores/semester.ts` makes of them — so
 * the sheet shows its own working rather than a number nobody can check.
 */
export async function buildScoreSemesterV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'scores/score_semester_v2.xlsx',
    sheetName: 'ពិន្ទុឆមាស',
    title: 'តារាងសរុបពិន្ទុ{{period.semester}}',
    lead: FORM_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ម.ភាគប្រឡង', token: '{{row.exam}}', width: 9.5 },
      { label: 'ម.ភាគប្រចាំខែ', token: '{{row.monthly}}', width: 9.5 },
      { label: 'ម.ភាគឆមាស', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    summary: FORM_PASS_SUMMARY,
    note: 'ម.ភាគឆមាស = (ម.ភាគប្រឡង + ម.ភាគប្រចាំខែ) ÷ ២ · គិតលើ {{class.months}} ខែ · ពិន្ទុជាប់ {{class.passmark}}',
  })
}
