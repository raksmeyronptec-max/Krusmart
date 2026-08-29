/**
 * The acceptance test for the report engine.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-reporting.mts
 *
 * The claim under test is §5's: generation FILLS a template rather than
 * rebuilding it, so everything the template carries — merges, fonts, borders,
 * column widths, row heights, page setup, print area — survives into the output.
 * That is checked by reading the generated workbook back and comparing it with
 * the template it came from, which is the only way to prove a round trip did
 * not quietly drop something.
 *
 * Also covers §11: the subject region widens to the class's score template, and
 * the repeating block grows to one row per pupil, without either being written
 * as a cell address anywhere in TypeScript.
 */

import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import {
  emptyPayload, fillText, hasToken, resolveToken,
  type ReportPayload,
} from '../lib/reporting/report-mapper.ts'
import {
  REPORT_DEFINITIONS, REPORT_CATEGORIES, isReportType, reportsByCategory,
} from '../lib/reporting/report-types.ts'
import {
  TEMPLATE_REGISTRY, activeTemplate, hasTemplate, templatesFor, templateById,
} from '../lib/reporting/report-template.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const TEMPLATE = 'lib/reporting/templates/score_monthly_v1.xlsx'

// ---------------------------------------------------------------------------
console.log('\nCatalogue (§19)')
{
  const ids = REPORT_DEFINITIONS.map(r => r.type)
  check('every report type is unique', new Set(ids).size === ids.length)
  check('all six categories are represented',
    REPORT_CATEGORIES.every(c => reportsByCategory(c.id).length > 0),
    REPORT_CATEGORIES.filter(c => reportsByCategory(c.id).length === 0).map(c => c.id).join(', '))
  check('the sixteen requested reports exist', REPORT_DEFINITIONS.length === 16,
    `got ${REPORT_DEFINITIONS.length}`)
  check('identifiers are machine-readable, never Khmer',
    ids.every(id => /^[a-z0-9_]+$/.test(id)))
  check('a forged report type is rejected', !isReportType('score_monthly; drop table'))
  check('a real one is accepted', isReportType('score_monthly'))
  check('every unmigrated report still points at its working screen (§27)',
    REPORT_DEFINITIONS.filter(r => !r.engine).every(r => r.legacyHref !== null))
}

// ---------------------------------------------------------------------------
console.log('\nTemplate registry (§6/§7)')
{
  check('score_monthly has an active template', hasTemplate('score_monthly'))
  check('a report with no template reports none', !hasTemplate('certificate'))
  check('the active template is v1', activeTemplate('score_monthly')?.version === 1)
  check('it is addressable by the id recorded in metadata',
    templateById('score_monthly_v1')?.reportType === 'score_monthly')
  check('exactly one active version per report',
    TEMPLATE_REGISTRY.filter(t => t.isActive).length ===
      new Set(TEMPLATE_REGISTRY.filter(t => t.isActive).map(t => t.reportType)).size)
  check('versions sort newest first', templatesFor('score_monthly')[0].version === 1)
  check('provenance is stated honestly',
    activeTemplate('score_monthly')?.provenance === 'derived')
}

// ---------------------------------------------------------------------------
console.log('\nToken mapping (§10)')
{
  const payload: ReportPayload = {
    scalars: { 'class.name': '៤ក', 'class.count': 32 },
    subjects: [],
    rows: [{ values: { 'row.name': 'សុខា', 'row.average': 8.25 }, subjectValues: [] }],
  }
  const row = payload.rows[0]

  check('a scalar resolves', resolveToken('class.name', payload) === '៤ក')
  check('a row token resolves', resolveToken('row.name', payload, row) === 'សុខា')
  check('an unknown token is blank, never a crash', resolveToken('nope.nope', payload) === null)
  check('a lone token keeps its type (stays summable)',
    fillText('{{row.average}}', payload, row) === 8.25)
  check('a mixed cell becomes a string',
    fillText('ថ្នាក់ {{class.name}}', payload) === 'ថ្នាក់ ៤ក')
  check('an unknown token in a mixed cell leaves a gap',
    fillText('x{{nope}}y', payload) === 'xy')
  check('hasToken finds one', hasToken('{{a.b}}') && !hasToken('plain text'))
  check('an empty payload is valid', emptyPayload().rows.length === 0)
}

// ---------------------------------------------------------------------------
console.log('\nFilling the template (§5/§11)')

const templateBuf = await readFile(TEMPLATE)
const before = new ExcelJS.Workbook()
await before.xlsx.load(templateBuf as unknown as ArrayBuffer)
const wsBefore = before.worksheets[0]

const SUBJECTS = [
  { key: 'kh_listen', label: 'ស្តាប់', maxScore: 10 },
  { key: 'kh_read', label: 'អាន', maxScore: 10 },
  { key: 'math_num', label: 'ចំនួន', maxScore: 10 },
  { key: 'sci_phy', label: 'រូបវិទ្យា', maxScore: 10 },
  { key: 'soc_geo', label: 'ភូមិវិទ្យា', maxScore: 10 },
]

const PUPILS = ['សុខា', 'ដារា', 'វិចិត្រ', 'សម្បត្តិ', 'រតនា', 'ចាន់ធី', 'ស្រីនាង']

const payload: ReportPayload = {
  scalars: {
    'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
    'class.name': '៤ក',
    'class.count': '៧',
    'class.average': 7.9,
    'period.label': 'ខែវិច្ឆិកា ឆ្នាំសិក្សា 2025-2026',
    'teacher.name': 'លោកគ្រូ សុភា',
    'director.role': 'នាយកសាលា',
    'director.name': 'លោក វិចិត្រ',
    'province.date': 'ភ្នំពេញ, ថ្ងៃទី៣០ ខែវិច្ឆិកា',
  },
  subjects: SUBJECTS,
  rows: PUPILS.map((name, i) => ({
    values: {
      'row.no': String(i + 1),
      'row.name': name,
      'row.gender': i % 2 ? 'ស្រី' : 'ប្រុស',
      'row.total': 40 - i,
      'row.average': Number((8 - i * 0.2).toFixed(2)),
      'row.grade': 'ល្អ',
      'row.rank': String(i + 1),
    },
    subjectValues: SUBJECTS.map((_, s) => 8 - ((i + s) % 4)),
  })),
}

const out = await fillXlsxTemplate(templateBuf, payload)
const after = new ExcelJS.Workbook()
await after.xlsx.load(out as unknown as ArrayBuffer)
const ws = after.worksheets[0]

const SUBJECT_COL = 4
const firstTail = SUBJECT_COL + SUBJECTS.length          // ពិន្ទុសរុប after widening

{
  check('the output is a readable workbook', ws !== undefined)
  check('the sheet keeps its name', ws.name === wsBefore.name, `got ${ws.name}`)

  // ---- §11: the subject region widened -----------------------------------
  const headers = SUBJECTS.map((_, i) => ws.getRow(7).getCell(SUBJECT_COL + i).value)
  check('one column per subject, labelled in order',
    JSON.stringify(headers) === JSON.stringify(SUBJECTS.map(s => s.label)),
    `got ${JSON.stringify(headers)}`)
  check('the {{#subjects}} marker is gone from the sheet',
    !headers.some(h => String(h).includes('#subjects')))

  // ---- §11: the repeating block grew -------------------------------------
  const names = PUPILS.map((_, i) => ws.getRow(8 + i).getCell(2).value)
  check('one row per pupil, in order',
    JSON.stringify(names) === JSON.stringify(PUPILS), `got ${JSON.stringify(names)}`)
  check('the {{#rows}} marker never reaches paper',
    !String(ws.getRow(8).getCell(1).value ?? '').includes('#rows'))

  // ---- marks stay numeric ------------------------------------------------
  const mark = ws.getRow(8).getCell(SUBJECT_COL).value
  check('a mark is written as a number, so the column sums', typeof mark === 'number',
    `got ${typeof mark} (${mark})`)
  check('a derived average is numeric too',
    typeof ws.getRow(8).getCell(firstTail + 1).value === 'number')
  check('subject marks land in the right columns',
    ws.getRow(8).getCell(SUBJECT_COL + 1).value === payload.rows[0].subjectValues[1])
  check('the tail columns shifted right with the region',
    ws.getRow(7).getCell(firstTail).value === 'ពិន្ទុសរុប',
    `got ${ws.getRow(7).getCell(firstTail).value}`)

  // ---- scalars -----------------------------------------------------------
  check('the school name filled', String(ws.getCell('A3').value).includes('ហ៊ុនសែន'))
  check('a mixed-text heading filled',
    String(ws.getCell('A5').value).includes('៤ក') &&
    !String(ws.getCell('A5').value).includes('{{'))
  check('no token survives anywhere in the sheet', (() => {
    let leftover: string | null = null
    ws.eachRow({ includeEmpty: false }, (r) => {
      r.eachCell({ includeEmpty: false }, (c) => {
        const v = typeof c.value === 'string' ? c.value : ''
        if (v.includes('{{')) leftover = v
      })
    })
    return leftover === null
  })())
}

// ---------------------------------------------------------------------------
console.log('\nFormatting survived the round trip (§5)')
{
  check('page setup: still A4 landscape',
    ws.pageSetup.orientation === 'landscape' && ws.pageSetup.paperSize === 9,
    `${ws.pageSetup.orientation} / ${ws.pageSetup.paperSize}`)
  check('page setup: fit-to-width kept', ws.pageSetup.fitToWidth === 1)
  check('page setup: margins kept', ws.pageSetup.margins?.left === 0.4)
  check('print titles (header repeats per page) kept',
    ws.pageSetup.printTitlesRow === '7:7', `got ${ws.pageSetup.printTitlesRow}`)

  check('merged letterhead cells survived',
    ws.getCell('A1').isMerged && ws.getCell('A4').isMerged)
  // The bug this catches: spliceColumns leaves merge ranges at their old width,
  // so a full-width heading stops spanning the widened table.
  check('the letterhead merge widened with the table', (() => {
    const model = (ws as unknown as { model?: { merges?: string[] } }).model
    return (model?.merges ?? []).some(m => m.startsWith('A1:') && m !== 'A1:H1')
  })(), JSON.stringify((ws as unknown as { model?: { merges?: string[] } }).model?.merges))
  // The signature block starts at row 10 in the template and is pushed down by
  // the pupil rows inserted above it, so it is located by content rather than
  // by a fixed address.
  const sigRow = (() => {
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getRow(r).getCell(1).value ?? '').includes('គ្រូបន្ទុកថ្នាក់')) return r
    }
    return -1
  })()
  check('the signature block survived and moved below the pupils',
    sigRow > 8 + PUPILS.length - 1, `found at row ${sigRow}`)
  check('its merge survived', sigRow > 0 && ws.getRow(sigRow).getCell(1).isMerged)
  check('the teacher name filled into it',
    String(ws.getRow(sigRow).getCell(1).value ?? '').includes('សុភា'))

  check('column widths kept', ws.getColumn(2).width === wsBefore.getColumn(2).width,
    `${ws.getColumn(2).width} vs ${wsBefore.getColumn(2).width}`)
  check('row heights kept', ws.getRow(7).height === wsBefore.getRow(7).height)

  const h = ws.getRow(7).getCell(1)
  check('header font kept', h.font?.name === 'Khmer OS Muol Light' && h.font?.size === 9,
    JSON.stringify(h.font))
  check('header fill kept', h.fill?.type === 'pattern')
  check('borders kept on a header cell', h.border?.top?.style === 'thin')

  // The property the naive implementation loses: cloned subject columns must
  // carry the anchor's style, or the extra columns print without borders.
  const cloned = ws.getRow(7).getCell(SUBJECT_COL + 3)
  check('cloned subject header keeps its border',
    cloned.border?.top?.style === 'thin', JSON.stringify(cloned.border))
  check('cloned subject header keeps its rotation',
    cloned.alignment?.textRotation === 90, JSON.stringify(cloned.alignment))
  check('cloned subject column keeps its width',
    ws.getColumn(SUBJECT_COL + 3).width === wsBefore.getColumn(SUBJECT_COL).width,
    `${ws.getColumn(SUBJECT_COL + 3).width} vs ${wsBefore.getColumn(SUBJECT_COL).width}`)

  // Duplicated pupil rows must be styled like the one in the template.
  const lastRow = ws.getRow(8 + PUPILS.length - 1)
  check('duplicated pupil rows keep their borders',
    lastRow.getCell(2).border?.left?.style === 'thin')
  check('duplicated pupil rows keep their height',
    lastRow.height === wsBefore.getRow(8).height,
    `${lastRow.height} vs ${wsBefore.getRow(8).height}`)
  check('duplicated pupil rows keep the name left-aligned',
    lastRow.getCell(2).alignment?.horizontal === 'left')
}

// ---------------------------------------------------------------------------
console.log('\nEdge cases')
{
  // A class with no pupils must still print a blank official sheet.
  const blank = await fillXlsxTemplate(templateBuf, {
    scalars: { 'class.name': '៥ខ' }, subjects: SUBJECTS, rows: [],
  })
  const bw = new ExcelJS.Workbook()
  await bw.xlsx.load(blank as unknown as ArrayBuffer)
  const bs = bw.worksheets[0]
  check('an empty class still yields a usable sheet',
    bs.getRow(7).getCell(SUBJECT_COL).value === 'ស្តាប់')
  check('and leaves no row marker behind',
    !String(bs.getRow(8).getCell(1).value ?? '').includes('#rows'))

  // A class with one subject must not widen anything.
  const one = await fillXlsxTemplate(templateBuf, {
    scalars: {}, subjects: [SUBJECTS[0]],
    rows: [{ values: { 'row.name': 'ក' }, subjectValues: [7] }],
  })
  const ow = new ExcelJS.Workbook()
  await ow.xlsx.load(one as unknown as ArrayBuffer)
  const os = ow.worksheets[0]
  check('a single-subject class keeps the original width',
    os.getRow(7).getCell(SUBJECT_COL + 1).value === 'ពិន្ទុសរុប',
    `got ${os.getRow(7).getCell(SUBJECT_COL + 1).value}`)
  check('and still writes the one mark', os.getRow(8).getCell(SUBJECT_COL).value === 7)

  // A class with no subjects at all — the template's single column stays.
  const none = await fillXlsxTemplate(templateBuf, {
    scalars: {}, subjects: [],
    rows: [{ values: { 'row.name': 'ខ' }, subjectValues: [] }],
  })
  const nw = new ExcelJS.Workbook()
  await nw.xlsx.load(none as unknown as ArrayBuffer)
  check('no subjects still produces a document',
    nw.worksheets[0].getRow(8).getCell(2).value === 'ខ')
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ report engine fills templates and preserves formatting.')
