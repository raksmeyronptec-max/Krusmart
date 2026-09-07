/**
 * Builders for Ranking family:
 * - ranking_monthly_v1.xlsx
 * - ranking_semester_v1.xlsx
 * - ranking_annual_v1.xlsx
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
  FORM_PASS_SUMMARY,
  FORM_RANK_LEAD,
  FORM_YEAR_SUMMARY,
  KH,
  KH_MOUL,
  KINGDOM_TITLES,
  OUT_DIR,
  buildSchoolFormTemplate,
  buildTableTemplate,
} from './common.mts'

export async function buildRankingMonthlyV1(): Promise<void> {
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

  const path = join(OUT_DIR, 'ranking', 'ranking_monthly_v1.xlsx')
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

export async function buildRankingSemesterV1(): Promise<void> {
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

  const path = join(OUT_DIR, 'ranking', 'ranking_semester_v1.xlsx')
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}

export async function buildRankingAnnualV1(): Promise<void> {
  await buildTableTemplate({
    file: 'ranking/ranking_annual_v1.xlsx',
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


/*
 * The three league tables, on the school-supplied form.
 *
 * A ranking sheet and the marks grid it derives from carry the SAME numbers in
 * a different reading order — down the placings rather than down the register
 * — so they share the form and differ only in their lead column: placing
 * first, because that is what the sheet is read to find (§9).
 */

/** `ranking_monthly` v2 — the month's league table. */
export async function buildRankingMonthlyV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'ranking/ranking_monthly_v2.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់',
    title: 'តារាងចំណាត់ថ្នាក់ប្រចាំ {{period.label}}',
    lead: FORM_RANK_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ពិន្ទុសរុប', token: '{{row.total}}', width: 9.5, bold: true },
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    summary: FORM_PASS_SUMMARY,
    // Stated because the sheet's own order depends on it: an unmarked pupil is
    // not last, they are unplaced (§37).
    note: 'ស្មើគ្នាទទួលចំណាត់ថ្នាក់តែមួយ ហើយលេខបន្ទាប់រំលង។ សិស្សដែលគ្មានពិន្ទុមិនមានចំណាត់ថ្នាក់ទេ ហើយរៀបនៅខាងក្រោម។ ពិន្ទុជាប់ {{class.passmark}}',
  })
}

/** `ranking_semester` v2 — the semester's league table. */
export async function buildRankingSemesterV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'ranking/ranking_semester_v2.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់ឆមាស',
    title: 'តារាងចំណាត់ថ្នាក់{{period.semester}}',
    lead: FORM_RANK_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ម.ភាគប្រឡង', token: '{{row.exam}}', width: 9.5 },
      { label: 'ម.ភាគប្រចាំខែ', token: '{{row.monthly}}', width: 9.5 },
      { label: 'មធ្យមភាគឆមាស', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    summary: FORM_PASS_SUMMARY,
    note: 'ម.ភាគឆមាស = (ម.ភាគប្រឡង + ម.ភាគប្រចាំខែ) ÷ ២ · គិតលើ {{class.months}} ខែ · ពិន្ទុជាប់ {{class.passmark}}',
  })
}

/** `ranking_annual` v2 — the year's league table. */
export async function buildRankingAnnualV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'ranking/ranking_annual_v2.xlsx',
    sheetName: 'ចំណាត់ថ្នាក់ប្រចាំឆ្នាំ',
    title: 'តារាងចំណាត់ថ្នាក់ប្រចាំឆ្នាំ',
    lead: FORM_RANK_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'ម.ភាគ ឆមាសទី១', token: '{{row.sem1}}', width: 8 },
      { label: 'ម.ភាគ ឆមាសទី២', token: '{{row.sem2}}', width: 8 },
      { label: 'ម.ភាគប្រចាំឆ្នាំ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'លទ្ធផល', token: '{{row.status}}', width: 12 },
    ],
    summary: FORM_YEAR_SUMMARY,
    note: 'ស្មើគ្នាទទួលចំណាត់ថ្នាក់តែមួយ ហើយលេខបន្ទាប់រំលង។ ពិន្ទុឡើងថ្នាក់ {{class.passmark}} · {{annual.source}}',
  })
}
