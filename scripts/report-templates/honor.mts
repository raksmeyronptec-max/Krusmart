/**
 * Builders for Honor family:
 * - honor_v1.xlsx
 */

import ExcelJS from 'exceljs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  BORDER,
  CENTER,
  FORM_BAND,
  FORM_GRADE,
  FORM_LEAD,
  FORM_RED,
  KH,
  KH_MOUL,
  OUT_DIR,
  buildSchoolFormTemplate,
} from './common.mts'

export async function buildHonorV1(): Promise<void> {
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

  const path = join(OUT_DIR, 'honor', 'honor_v1.xlsx')
  await mkdir(dirname(path), { recursive: true })
  await wb.xlsx.writeFile(path)
  console.log(`  ✓ ${path}`)
}


/**
 * `honor` v2 — the honour roll on the school-supplied form.
 *
 * Its left-hand summary is NOT the class's pass/fail split: this sheet lists
 * only the pupils who qualified, so the population under the table is the
 * honoured cohort, and the class total sits beside it for context. The rule
 * itself is printed, because `lib/scores/honor.ts` derives it from the class's
 * own grading scheme rather than reading a number someone typed — a claim the
 * paper has to make, not a footnote (§25/§31).
 */
export async function buildHonorV2(): Promise<void> {
  await buildSchoolFormTemplate({
    file: 'honor/honor_v2.xlsx',
    sheetName: 'កិត្តិយស',
    title: 'បញ្ជីសិស្សពូកែ {{period.label}}',
    subtitle: 'លក្ខណៈវិនិច្ឆ័យ ៖ {{honor.criteria}}',
    lead: FORM_LEAD,
    subjectWidth: 6.83,
    tail: [
      { label: 'មធ្យមភាគ', token: '{{row.average}}', width: 9.5, fill: FORM_BAND, bold: true },
      { label: 'ចំណាត់ថ្នាក់', token: '{{row.rank}}', width: 8, color: FORM_RED, bold: true },
      { label: 'និទ្ទេស', token: '{{row.grade}}', width: 9.5, color: FORM_GRADE, bold: true },
      { label: 'មុខវិជ្ជាមានពិន្ទុ', token: '{{row.subjects}}', width: 10 },
    ],
    // No right-hand band block: it counts pupils per grade ACROSS THE CLASS,
    // and on a sheet that lists only the honoured it would read as describing
    // the list. Absence is better than an ambiguous population.
    bands: null,
    summary: [
      { label: 'សិស្សក្នុងបញ្ជីនេះ ៖', token: '{{honor.count}} នាក់' },
      { label: 'សិស្សក្នុងថ្នាក់សរុប ៖', token: '{{honor.total}} នាក់' },
      { label: 'មធ្យមភាគនៃបញ្ជីនេះ ៖', token: '{{honor.average}}' },
      { label: 'មធ្យមភាគថ្នាក់ ៖', token: '{{class.average}}' },
    ],
    note: '{{honor.provenance}}',
  })
}
