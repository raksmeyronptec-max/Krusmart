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
  reportAvailability,
} from '../lib/reporting/report-template.ts'
import { DEFAULT_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import { assignRanks, studentAverage } from '../lib/scores/aggregate.ts'
import {
  isSemesterId, monthlyComponent, monthsForSemester, semesterAverage, semesterLabel,
} from '../lib/scores/semester.ts'
import { DEFAULT_CALENDAR, periodKeysForSemester } from '../lib/scores/calendar.ts'
import type { MonthId } from '../lib/constants/months.ts'
import {
  defaultHonorCriteria, evaluateHonor, HONOR_CRITERIA_PROVENANCE,
} from '../lib/scores/honor.ts'
import { SECONDARY_SCHEME_CONFIG } from '../lib/grading/scheme.ts'

const byTypeGlobal = (t: string) =>
  REPORT_DEFINITIONS.find(r => r.type === t)!

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const TEMPLATE = 'lib/reporting/templates/score_monthly_v1.xlsx'
const RANKING_TEMPLATE = 'lib/reporting/templates/ranking_monthly_v1.xlsx'

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
  check('ranking_monthly is in the catalogue (§24.1)',
    REPORT_DEFINITIONS.some(r => r.type === 'ranking_monthly' && r.category === 'ranking'))
  check('and declares a resolver (§24.2)',
    byTypeGlobal('ranking_monthly').resolver === true)
  check('identifiers are machine-readable, never Khmer',
    ids.every(id => /^[a-z0-9_]+$/.test(id)))
  check('a forged report type is rejected', !isReportType('score_monthly; drop table'))
  check('a real one is accepted', isReportType('score_monthly'))
  check('every report without a resolver still points at its working screen (§27)',
    REPORT_DEFINITIONS.filter(r => !r.resolver).every(r => r.legacyHref !== null))
}

// ---------------------------------------------------------------------------
console.log('\nTemplate registry (§6/§7)')
{
  check('score_monthly has an active template', hasTemplate('score_monthly'))
  // Was `certificate`, then `score_semester`, as each gained a real template.
  // `score_annual` is the last report with none — move the example on again
  // rather than weakening the check when it is migrated (§34).
  check('a report with no template reports none', !hasTemplate('score_annual'))
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
console.log('\nReport availability — no card may over-claim (§10/§11)')
{
  const byType = (t: string) => REPORT_DEFINITIONS.find(r => r.type === t)!

  const monthly = reportAvailability(byType('score_monthly'))
  check('score_monthly is engine-ready', monthly.status === 'engine_ready', monthly.status)
  check('and offers a generate action', monthly.action === 'generate')
  check('and names the template it will use (§28)',
    monthly.template?.id === 'score_monthly_v1')

  // Picked dynamically rather than named. Naming one meant this block broke
  // every time that report was migrated — three times so far — which is churn,
  // not signal: the property under test is that the MODEL reports a
  // legacy-only report correctly, not which report happens to be one today.
  const legacyDef = REPORT_DEFINITIONS.find(
    r => !r.resolver && r.legacyHref !== null && !hasTemplate(r.type))
  check('some report is still legacy-only (else this block is vacuous)',
    legacyDef !== undefined)
  if (legacyDef) {
    const legacy = reportAvailability(legacyDef)
    check(`a legacy-only report (${legacyDef.type}) is marked legacy, not ready`,
      legacy.status === 'legacy_only', legacy.status)
    check('and opens its existing screen rather than offering to generate',
      legacy.action === 'open')
    check('and claims NO template', legacy.template === null)
  }

  // The dishonesty the four-state model exists to prevent: a resolver with no
  // document template must never present a generate button.
  // A resolver pointed at a report type that has no template in the registry.
  const orphan = reportAvailability({ ...byType('score_monthly'), type: 'score_annual' })
  check('a resolver with no template asks for one instead of generating',
    orphan.status === 'needs_template' && orphan.action !== 'generate', orphan.status)

  const undone = reportAvailability({
    ...byType('ranking_monthly'), resolver: false, legacyHref: null,
  })
  check('a report with neither resolver nor screen says so honestly',
    undone.status === 'not_implemented' && undone.action === 'none')

  check('no report claims engine_ready without an active template',
    REPORT_DEFINITIONS.every(r => {
      const a = reportAvailability(r)
      return a.status !== 'engine_ready' || a.template !== null
    }))
  check('every generate action has a template behind it',
    REPORT_DEFINITIONS.every(r => {
      const a = reportAvailability(r)
      return a.action !== 'generate' || a.template !== null
    }))
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

// ---------------------------------------------------------------------------
console.log('\nranking_monthly (§24)')
{
  const def = byTypeGlobal('ranking_monthly')
  const avail = reportAvailability(def)

  check('with an active template it is engine_ready (§24.4)',
    avail.status === 'engine_ready', avail.status)
  check('and offers generation, not the legacy screen',
    avail.action === 'generate')
  check('template version is recorded (§24.15)',
    avail.template?.id === 'ranking_monthly_v1' && avail.template?.version === 1)
  check('provenance is derived, never claimed official (§21)',
    avail.template?.provenance === 'derived')
  check('the legacy /ranking route is preserved in the catalogue (§17)',
    def.legacyHref === '/ranking')

  // §24.3 — the same definition with no template must NOT be engine_ready.
  // Pointed at `ranking_annual`, then `score_semester`, and moved on each time
  // that report was migrated — exactly what §34 asks for. Now `score_annual`,
  // the last definition with neither a resolver nor a template. When IT is
  // migrated this breaks again, and the answer is still to move the example
  // rather than weaken the check.
  const orphan = reportAvailability({ ...def, type: 'score_annual' })
  check('no active template means not engine_ready (§24.3)',
    orphan.status === 'needs_template' && orphan.action !== 'generate', orphan.status)
}

// ---------------------------------------------------------------------------
console.log('\nranking agrees with the canonical engine (§24.6/§7/§19)')
{
  // The ranking report does not re-rank: it reads `assignRanks`, the same
  // helper /score/total and /ranking both call. These assertions pin the
  // semantics the report inherits, so a change to them fails here rather than
  // silently producing a sheet that disagrees with the screen.
  type R = { id: string; avg: number; rank: number }
  const rank = (avgs: [string, number][]): R[] => {
    const rows: R[] = avgs.map(([id, avg]) => ({ id, avg, rank: 0 }))
    assignRanks([...rows], (r) => r.avg, (r, n) => { r.rank = n })
    return rows
  }

  // §7 — ties share a rank and the NEXT rank skips: 1,2,2,4 (never 1,2,2,3).
  const tied = rank([['a', 9], ['b', 8], ['c', 8], ['d', 7]])
  check('ties share a rank and the next rank skips (1,2,2,4)',
    tied.map(r => r.rank).join(',') === '1,2,2,4',
    tied.map(r => `${r.id}:${r.rank}`).join(' '))

  const allTied = rank([['a', 8], ['b', 8], ['c', 8]])
  check('a whole class tied all share rank 1',
    allTied.every(r => r.rank === 1))

  // §19 — a pupil with no marks has average null, weighed as 0 by the ranking
  // pass. The report prints no rank for them and sorts them last; what it must
  // never do is treat the missing mark as a zero *score* inside the average.
  const unmarkedLast = rank([['a', 7], ['b', 0], ['c', 9]])
  check('an unmarked pupil (average 0) ranks below every marked one',
    unmarkedLast.find(r => r.id === 'b')!.rank === 3)

  // The average itself: a missing subject drops out with its coefficient
  // rather than counting as zero — `studentAverage`'s documented rule, and
  // what makes the report agree with /score/total.
  const scheme = DEFAULT_SCHEME_CONFIG
  const maxes = { a: 10, b: 10, c: 10 }
  const partial = studentAverage({ a: 8, b: 6 }, ['a', 'b', 'c'], maxes, scheme)
  check('a missing subject is skipped, not counted as zero',
    partial.average === 7, `got ${partial.average}`)
  check('and only the marked subjects count toward the total',
    partial.total === 14 && partial.scored === 2)

  const none = studentAverage({}, ['a', 'b'], maxes, scheme)
  check('a pupil with nothing marked has a null average, never 0.00',
    none.average === null, String(none.average))
}

// ---------------------------------------------------------------------------
console.log('\nranking_monthly document (§24.7-14)')
{
  const buf = await readFile(RANKING_TEMPLATE)
  const tpl = new ExcelJS.Workbook()
  await tpl.xlsx.load(buf as unknown as ArrayBuffer)
  const tplWs = tpl.worksheets[0]

  const RANK_SUBJECT_COL = 4

  /** A ranking payload the resolver would produce: rank order, ties preserved. */
  const rankingPayload = (subjectCount: number, pupils: number): ReportPayload => {
    const subs = Array.from({ length: subjectCount }, (_, i) => ({
      key: `k${i}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    }))
    return {
      scalars: {
        'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
        'class.name': '៤ក', 'class.grade': '៤', 'class.count': String(pupils),
        'class.average': 7.5, 'class.scored': String(pupils),
        'class.passed': String(pupils), 'class.failed': '០', 'class.passmark': '៥',
        'period.label': 'ខែវិច្ឆិកា ឆ្នាំសិក្សា 2025-2026',
        'teacher.name': 'លោកគ្រូ សុភា', 'director.role': 'នាយកសាលា',
        'director.name': 'លោក វិចិត្រ', 'province.date': 'ភ្នំពេញ',
      },
      subjects: subs,
      rows: Array.from({ length: pupils }, (_, i) => ({
        values: {
          'row.rank': String(i + 1), 'row.name': `សិស្ស${i + 1}`, 'row.gender': 'ប្រុស',
          'row.total': 40 - i, 'row.average': Number((9 - i * 0.5).toFixed(2)),
          'row.grade': 'ល្អ', 'row.status': 'ជាប់',
        },
        subjectValues: subs.map((_, s) => 8 - ((i + s) % 3)),
      })),
    }
  }

  // §24.12 — multiple subjects
  const many = await fillXlsxTemplate(buf, rankingPayload(6, 5))
  const mw = new ExcelJS.Workbook()
  await mw.xlsx.load(many as unknown as ArrayBuffer)
  const ws = mw.worksheets[0]

  check('six subject columns expand (§24.8)',
    ws.getRow(7).getCell(RANK_SUBJECT_COL + 5).value === 'មុខវិជ្ជា៦'.replace('៦', '6'),
    String(ws.getRow(7).getCell(RANK_SUBJECT_COL + 5).value))
  check('the tail columns shifted with the region',
    ws.getRow(7).getCell(RANK_SUBJECT_COL + 6).value === 'ពិន្ទុសរុប',
    String(ws.getRow(7).getCell(RANK_SUBJECT_COL + 6).value))
  check('five pupil rows expand (§24.9)',
    ws.getRow(12).getCell(2).value === 'សិស្ស5',
    String(ws.getRow(12).getCell(2).value))
  check('rank leads the row', ws.getRow(8).getCell(1).value === '1')
  check('status closes the row',
    ws.getRow(8).getCell(RANK_SUBJECT_COL + 9).value === 'ជាប់',
    String(ws.getRow(8).getCell(RANK_SUBJECT_COL + 9).value))
  check('a mark stays numeric so the column sums',
    typeof ws.getRow(8).getCell(RANK_SUBJECT_COL).value === 'number')
  check('no token survives (§24.13)', (() => {
    let leftover: string | null = null
    ws.eachRow({ includeEmpty: false }, (r) => {
      r.eachCell({ includeEmpty: false }, (c) => {
        const v = typeof c.value === 'string' ? c.value : ''
        if (v.includes('{{')) leftover = v
      })
    })
    return leftover === null
  })())

  // The class-statistics band must survive the row expansion and still fill.
  const statsRow = (() => {
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getRow(r).getCell(1).value ?? '').includes('សិស្សមានពិន្ទុ')) return r
    }
    return -1
  })()
  check('the class statistics band survived and filled',
    statsRow > 0 && String(ws.getRow(statsRow).getCell(1).value).includes('ជាប់'))
  check('and its merge survived expansion (§24.14)',
    statsRow > 0 && ws.getRow(statsRow).getCell(1).isMerged)

  // §24.13 — formatting round trip
  check('page setup survived', ws.pageSetup.orientation === 'landscape')
  check('print titles survived', ws.pageSetup.printTitlesRow === '7:7')
  check('letterhead merge widened with the table',
    (ws as unknown as { model?: { merges?: string[] } }).model?.merges?.some(
      m => m.startsWith('A1:') && m !== 'A1:H1') === true)
  check('cloned subject header keeps its rotation',
    ws.getRow(7).getCell(RANK_SUBJECT_COL + 3).alignment?.textRotation === 90)
  check('duplicated rows keep their borders',
    ws.getRow(12).getCell(2).border?.left?.style === 'thin')
  check('column widths kept',
    ws.getColumn(2).width === tplWs.getColumn(2).width)

  // §24.11 — a single subject must not widen anything
  const one = await fillXlsxTemplate(buf, rankingPayload(1, 2))
  const ow = new ExcelJS.Workbook()
  await ow.xlsx.load(one as unknown as ArrayBuffer)
  check('a single-subject class keeps the original width (§24.11)',
    ow.worksheets[0].getRow(7).getCell(RANK_SUBJECT_COL + 1).value === 'ពិន្ទុសរុប')

  // §24.10 — an empty class still yields a usable sheet
  const empty = await fillXlsxTemplate(buf, {
    ...rankingPayload(3, 0), rows: [],
  })
  const ew = new ExcelJS.Workbook()
  await ew.xlsx.load(empty as unknown as ArrayBuffer)
  check('an empty class still yields a usable sheet (§24.10)',
    ew.worksheets[0].getRow(7).getCell(RANK_SUBJECT_COL).value === 'មុខវិជ្ជា1')
  check('and leaves no row marker behind',
    !String(ew.worksheets[0].getRow(8).getCell(1).value ?? '').includes('#rows'))
}

// ---------------------------------------------------------------------------
console.log('\nranking_semester — catalogue and availability (§24.1-4/13-14)')
{
  const def = byTypeGlobal('ranking_semester')
  check('ranking_semester is in the catalogue', def.category === 'ranking')
  check('and declares a resolver', def.resolver === true)
  check('its period selector is the semester', def.period === 'semester')

  const avail = reportAvailability(def)
  check('with an active template it is engine_ready', avail.status === 'engine_ready', avail.status)
  check('and offers generation, not the legacy screen', avail.action === 'generate')
  check('template version is recorded',
    avail.template?.id === 'ranking_semester_v1' && avail.template?.version === 1)
  check('provenance is derived, never claimed official',
    avail.template?.provenance === 'derived')
  check('the legacy /ranking route is preserved', def.legacyHref === '/ranking')

  const orphan = reportAvailability({ ...def, type: 'score_annual' })
  check('no active template means not engine_ready',
    orphan.status === 'needs_template' && orphan.action !== 'generate', orphan.status)
}

// ---------------------------------------------------------------------------
console.log('\nsemester calculation — the canonical definition (§8/§23)')
{
  // §23: this IS /score/total's formula. `ScoreTotalClient` calls the same
  // `semesterAverage`, so these assertions pin both surfaces at once. If the
  // screen ever diverges, it diverges from this and the test fails.
  check('A. fully marked: mean of the two halves',
    semesterAverage(8, 6) === 7)
  check('B/C/D. a missing SUBJECT is handled inside each half, not here',
    semesterAverage(7.5, 7.5) === 7.5)
  check('E. nothing recorded at all is null, never 0',
    semesterAverage(null, null) === null)
  // The asymmetry inherited from /score/total, asserted so it cannot drift.
  check('F. no monthly component halves the exam mark (product definition)',
    semesterAverage(8, null) === 4)
  check('G. no exam halves the coursework the same way',
    semesterAverage(null, 8) === 4)
  check('H. coefficient schemes need no special case — both halves arrive scaled',
    semesterAverage(40, 30) === 35)

  // The month split — the bug this phase fixed.
  const s1 = monthsForSemester('sem1')
  const s2 = monthsForSemester('sem2')
  check('semester 1 is វិច្ឆិកា–មីនា',
    s1.join(',') === 'nov,dec,jan,feb,mar', s1.join(','))
  check('semester 2 is the REST of the academic year, not nov–mar again',
    s2.join(',') === 'apr,may,jun,jul,aug,sep,oct', s2.join(','))
  check('the two halves do not overlap', s1.every(m => !s2.includes(m)))
  check('together they cover the whole academic year', s1.length + s2.length === 12)

  // The monthly half skips months with no marks rather than zeroing them.
  check('the monthly component averages only months that have marks',
    monthlyComponent({ nov: 8, dec: 6 }, s1) === 7)
  check('a month with no marks is skipped, not counted as zero',
    monthlyComponent({ nov: 8 }, s1) === 8)
  check('no monthly marks at all yields null, not 0',
    monthlyComponent({}, s1) === null)
  check('months outside the semester are ignored',
    monthlyComponent({ nov: 8, jul: 2 }, s1) === 8)

  check('semester ids are validated', isSemesterId('sem1') && !isSemesterId('sem3'))
  check('labels are Khmer', semesterLabel('sem2') === 'ឆមាសទី២')
}

// ---------------------------------------------------------------------------
console.log('\nperiod calendar — screen ≡ paper on a customised calendar (§11)')
{
  // /score/total seeds its month set from periodKeysForSemester(calendar, s)
  // and ranking_semester reads the same keys through fetchScoreCalendar. This
  // section pins the pure halves of both paths to one another.

  // A class with no calendar rows resolves the default — every key identical
  // to what monthsForSemester always answered, so no number can move.
  check('the default calendar reproduces monthsForSemester for both semesters',
    periodKeysForSemester(DEFAULT_CALENDAR, 'sem1').join(',') === monthsForSemester('sem1').join(',') &&
    periodKeysForSemester(DEFAULT_CALENDAR, 'sem2').join(',') === monthsForSemester('sem2').join(','))

  // The user's scenario: the semester boundary moved past មេសា, then mar+apr
  // merged into one period anchored at 'mar' (INV-1: no invented key).
  const merged = DEFAULT_CALENDAR
    .filter((p) => p.key !== 'apr')
    .map((p) => (p.key === 'mar' ? { ...p, members: ['mar', 'apr'] as MonthId[] } : p))

  const s1 = periodKeysForSemester(merged, 'sem1')
  const s2 = periodKeysForSemester(merged, 'sem2')
  check("merged sem1 keys are the anchors — 'apr' is absorbed, not renamed",
    s1.join(',') === 'nov,dec,jan,feb,mar', s1.join(','))
  check('merged sem2 drops to six periods (the denominator change)',
    s2.join(',') === 'may,jun,jul,aug,sep,oct', s2.join(','))

  // A pupil with marks in every month, apr included. The merged calendar
  // reads only anchor keys, so apr's 2 vanishes from BOTH surfaces at once —
  // hidden, not moved.
  const averages = { nov: 8, dec: 8, jan: 8, feb: 8, mar: 8, apr: 2, may: 6 }

  // The screen's inline seed computation (ScoreTotalClient monthlyComponent
  // memo), verbatim: mean over the selected keys, skipping missing months.
  const screenComponent = (keys: string[]) => {
    const values = keys
      .map((m) => (averages as Record<string, number>)[m])
      .filter((v): v is number => typeof v === 'number')
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  for (const s of ['sem1', 'sem2'] as const) {
    const keys = periodKeysForSemester(merged, s)
    check(`${s}: the screen's seeded component equals the report's monthlyComponent`,
      screenComponent(keys) === monthlyComponent(averages, keys))
  }

  check("apr's mark is hidden from the merged sem1 coursework, not re-counted",
    monthlyComponent(averages, s1) === 8)
  check('the same pupil, same marks, same exam produces one semester average',
    semesterAverage(7, monthlyComponent(averages, s1)) ===
    semesterAverage(7, screenComponent(s1)))
}

// ---------------------------------------------------------------------------
console.log('\nsemester ranking — ties and unmarked pupils (§24.7-9)')
{
  type R = { id: string; avg: number | null; rank: number }
  const rank = (rows: R[]) => {
    assignRanks([...rows], r => r.avg ?? 0, (r, n) => { r.rank = n })
    return rows
  }

  // A: high. B and C: same semester average from DIFFERENT halves (§8.J).
  // D: nothing recorded.
  const a = { id: 'A', avg: semesterAverage(9, 9), rank: 0 }
  const b = { id: 'B', avg: semesterAverage(8, 6), rank: 0 }   // 7
  const c = { id: 'C', avg: semesterAverage(6, 8), rank: 0 }   // 7
  const d = { id: 'D', avg: semesterAverage(null, null), rank: 0 }
  rank([a, b, c, d])

  check('B and C reach the same average from different halves',
    b.avg === 7 && c.avg === 7)
  check('A ranks 1', a.rank === 1)
  check('B and C share rank 2', b.rank === 2 && c.rank === 2)
  check('the next rank SKIPS to 4 — competition, not dense (§9)',
    d.rank === 4, `got ${d.rank}`)
  check('the unmarked pupil keeps a null average', d.avg === null)
}

// ---------------------------------------------------------------------------
console.log('\nranking_semester document (§24.10-15/§25/§26)')
{
  const buf = await readFile('lib/reporting/templates/ranking_semester_v1.xlsx')
  const tpl = new ExcelJS.Workbook()
  await tpl.xlsx.load(buf as unknown as ArrayBuffer)
  const tplWs = tpl.worksheets[0]
  const SC = 4   // the subject anchor column

  const payload = (subjectCount: number, pupils: number): ReportPayload => {
    const subs = Array.from({ length: subjectCount }, (_, i) => ({
      key: `k${i}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    }))
    return {
      scalars: {
        'school.name': 'សាលាតេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
        'class.count': String(pupils), 'class.average': 7,
        'period.label': 'ឆមាសទី១ ឆ្នាំសិក្សា 2025-2026',
        'class.scored': String(pupils), 'class.passed': String(pupils),
        'class.failed': '០', 'class.passmark': '៥', 'class.months': '៥',
        'teacher.name': 'គ្រូ ក', 'director.role': 'នាយកសាលា',
        'director.name': 'លោក ខ', 'province.date': 'ភ្នំពេញ',
      },
      subjects: subs,
      rows: Array.from({ length: pupils }, (_, i) => ({
        values: {
          'row.rank': String(i + 1), 'row.name': `សិស្ស${i + 1}`, 'row.gender': 'ប្រុស',
          'row.exam': 8 - i, 'row.monthly': 7 - i,
          'row.average': Number(((8 - i + 7 - i) / 2).toFixed(2)),
          'row.grade': 'ល្អ', 'row.status': 'ជាប់',
        },
        subjectValues: subs.map((_, s) => 8 - ((i + s) % 3)),
      })),
    }
  }

  // §24.10 multiple subjects, §24.11 row expansion
  const out = await fillXlsxTemplate(buf, payload(6, 5))
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]

  check('six subject columns expand', ws.getRow(7).getCell(SC + 5).value === 'មុខវិជ្ជា6',
    String(ws.getRow(7).getCell(SC + 5).value))
  check('the tail shifted with the region',
    ws.getRow(7).getCell(SC + 6).value === 'ម.ភាគប្រឡង',
    String(ws.getRow(7).getCell(SC + 6).value))
  check('five pupil rows expand', ws.getRow(12).getCell(2).value === 'សិស្ស5')
  check('both halves are printed, so the average is auditable',
    ws.getRow(8).getCell(SC + 6).value === 8 && ws.getRow(8).getCell(SC + 7).value === 7)
  check('the semester average is numeric', typeof ws.getRow(8).getCell(SC + 8).value === 'number')
  check('no token survives', (() => {
    let bad: string | null = null
    ws.eachRow({ includeEmpty: false }, r => r.eachCell({ includeEmpty: false }, c => {
      const v = typeof c.value === 'string' ? c.value : ''
      if (v.includes('{{')) bad = v
    }))
    return bad === null
  })())

  // §24.12 / §25 — formatting round trip
  check('page setup survived', ws.pageSetup.orientation === 'landscape')
  check('fit-to-width survived', ws.pageSetup.fitToWidth === 1)
  check('margins survived', ws.pageSetup.margins?.left === 0.4)
  check('print titles survived', ws.pageSetup.printTitlesRow === '7:7')
  check('letterhead merge widened with the table',
    (ws as unknown as { model?: { merges?: string[] } }).model?.merges?.some(
      m => m.startsWith('A1:') && m !== 'A1:I1') === true)
  check('cloned subject header keeps its rotation',
    ws.getRow(7).getCell(SC + 3).alignment?.textRotation === 90)
  check('cloned subject column keeps its width',
    ws.getColumn(SC + 3).width === tplWs.getColumn(SC).width)
  check('duplicated rows keep their borders',
    ws.getRow(12).getCell(2).border?.left?.style === 'thin')
  check('column widths kept', ws.getColumn(2).width === tplWs.getColumn(2).width)

  const statsRow = (() => {
    for (let r = 1; r <= ws.rowCount; r++) {
      if (String(ws.getRow(r).getCell(1).value ?? '').includes('សិស្សមានពិន្ទុ')) return r
    }
    return -1
  })()
  check('the statistics band survived and filled',
    statsRow > 0 && String(ws.getRow(statsRow).getCell(1).value).includes('គិតលើ'))
  check('and its merge survived expansion', statsRow > 0 && ws.getRow(statsRow).getCell(1).isMerged)

  // §26 — edges
  const single = await fillXlsxTemplate(buf, payload(1, 1))
  const sw = new ExcelJS.Workbook(); await sw.xlsx.load(single as unknown as ArrayBuffer)
  check('a single subject does not widen the region',
    sw.worksheets[0].getRow(7).getCell(SC + 1).value === 'ម.ភាគប្រឡង')
  check('a single pupil renders', sw.worksheets[0].getRow(8).getCell(2).value === 'សិស្ស1')

  const empty = await fillXlsxTemplate(buf, { ...payload(3, 0), rows: [] })
  const ew = new ExcelJS.Workbook(); await ew.xlsx.load(empty as unknown as ArrayBuffer)
  check('an empty class still yields a usable sheet',
    ew.worksheets[0].getRow(7).getCell(SC).value === 'មុខវិជ្ជា1')
  check('and leaves no row marker behind',
    !String(ew.worksheets[0].getRow(8).getCell(1).value ?? '').includes('#rows'))

  const noSubjects = await fillXlsxTemplate(buf, {
    ...payload(0, 1), subjects: [],
    rows: [{ values: { 'row.name': 'ក' }, subjectValues: [] }],
  })
  const nw = new ExcelJS.Workbook(); await nw.xlsx.load(noSubjects as unknown as ArrayBuffer)
  check('no configured subjects still produces a document',
    nw.worksheets[0].getRow(8).getCell(2).value === 'ក')
}

// ---------------------------------------------------------------------------
console.log('\nhonor — catalogue and availability (§21.1-4)')
{
  const def = byTypeGlobal('honor')
  check('honor is in the catalogue', def.category === 'honor')
  check('and declares a resolver', def.resolver === true)
  check('its output is XLSX through the engine', def.formats.includes('xlsx'))

  const avail = reportAvailability(def)
  check('with an active template it is engine_ready', avail.status === 'engine_ready', avail.status)
  check('and offers generation', avail.action === 'generate')
  check('template version is recorded',
    avail.template?.id === 'honor_v1' && avail.template?.version === 1)
  check('provenance is derived, never claimed official (§25)',
    avail.template?.provenance === 'derived')
  check('the legacy /honor-roll route is preserved (§16)', def.legacyHref === '/honor-roll')

  const orphan = reportAvailability({ ...def, type: 'score_annual' })
  check('no active template means not engine_ready',
    orphan.status === 'needs_template' && orphan.action !== 'generate', orphan.status)
}

// ---------------------------------------------------------------------------
console.log('\nhonor criteria — derived from the scheme, not invented (§6/§21.6)')
{
  const primary = defaultHonorCriteria(DEFAULT_SCHEME_CONFIG)
  const secondary = defaultHonorCriteria(SECONDARY_SCHEME_CONFIG)

  check('the criteria are marked provisional', HONOR_CRITERIA_PROVENANCE === 'derived')
  check('primary threshold is the scheme\'s ល្អ band (8/10), not a constant',
    primary.minAverage === 8, String(primary.minAverage))
  check('secondary threshold scales with ITS scheme (40/50) automatically',
    secondary.minAverage === 40, String(secondary.minAverage))
  check('the threshold is read from the scheme, so the two differ',
    primary.minAverage !== secondary.minAverage)
  check('no-failing-subject is on by default', primary.noFailingSubject === true)
  check('the rule is stated in Khmer for the document',
    primary.label.includes('៨') || primary.label.includes('8'))
}

// ---------------------------------------------------------------------------
console.log('\nhonor eligibility and boundaries (§19/§21.7-8)')
{
  const scheme = DEFAULT_SCHEME_CONFIG          // /10, pass 5
  const criteria = defaultHonorCriteria(scheme) // minAverage 8
  const keys = ['a', 'b']
  const maxes = { a: 10, b: 10 }
  const judge = (average: number | null, scores: Record<string, number | string | null>) =>
    evaluateHonor({ average, scores, subjectKeys: keys, maxByColumn: maxes }, criteria, scheme)

  // §19 — X - epsilon, X, X + epsilon around the average threshold.
  check('X - ε (7.99) is NOT eligible', judge(7.99, { a: 8, b: 8 }).eligible === false)
  check('X exactly (8.00) IS eligible — the boundary is inclusive',
    judge(8, { a: 8, b: 8 }).eligible === true)
  check('X + ε (8.01) is eligible', judge(8.01, { a: 8, b: 8 }).eligible === true)

  // The reason must be answerable to a parent.
  check('a near-miss says why', judge(7.99, { a: 8, b: 8 }).reason?.includes('មធ្យមភាគ') === true)

  // A failing subject disqualifies regardless of the average (§2 — criteria,
  // not position: a high average cannot buy past a failed subject).
  const withFail = judge(9, { a: 10, b: 4 })
  check('a high average with a FAILING subject is not eligible', withFail.eligible === false)
  check('and the failing subject is named', withFail.failingSubjects.includes('b'))
  check('the pass boundary is inclusive too — exactly 5 does not fail',
    judge(9, { a: 10, b: 5 }).eligible === true)
  check('just below the pass mark does fail', judge(9, { a: 10, b: 4.99 }).eligible === false)

  // A subject on its own scale: /100 marked 45 fails a half-way pass.
  const bigScale = evaluateHonor(
    { average: 9, scores: { a: 9, b: 45 }, subjectKeys: keys, maxByColumn: { a: 10, b: 100 } },
    criteria, scheme)
  check('a subject is judged against ITS OWN full mark, not the scheme scale',
    bigScale.eligible === false && bigScale.failingSubjects.includes('b'))

  // Missing data.
  check('an unmarked pupil is not eligible', judge(null, {}).eligible === false)
  check('and the reason says so', judge(null, {}).reason === 'មិនទាន់មានពិន្ទុ')
  check('a pupil with no marked subjects is not eligible',
    judge(9, {}).eligible === false)
  check('an unmarked SUBJECT is skipped, not treated as a fail',
    judge(9, { a: 9, b: null }).eligible === true)
  check('marked subjects are counted', judge(9, { a: 9, b: 9 }).markedSubjects === 2)

  // §2 — honour is not "top N": a whole class can qualify, or none.
  const all = [9, 9.5, 8.2, 8].map(avg => judge(avg, { a: avg, b: avg }))
  check('a strong class can ALL be honoured — not capped at five',
    all.every(v => v.eligible))
  const none = [7, 6, 5].map(avg => judge(avg, { a: avg, b: avg }))
  check('a weak class honours NOBODY — unlike a top-N rule',
    none.every(v => !v.eligible))
}

// ---------------------------------------------------------------------------
console.log('\nhonor document (§21.9-12/§13)')
{
  const buf = await readFile('lib/reporting/templates/honor_v1.xlsx')
  const tpl = new ExcelJS.Workbook()
  await tpl.xlsx.load(buf as unknown as ArrayBuffer)
  const tplWs = tpl.worksheets[0]
  const SC = 4
  const HEADER_ROW = 8
  const FIRST_ROW = 9

  const payload = (subjectCount: number, honoured: number): ReportPayload => {
    const subs = Array.from({ length: subjectCount }, (_, i) => ({
      key: `k${i}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    }))
    return {
      scalars: {
        'school.name': 'សាលាតេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
        'period.label': 'ខែវិច្ឆិកា', 'honor.count': String(honoured),
        'honor.total': '៣២', 'honor.average': 8.8,
        'honor.criteria': 'មធ្យមភាគចាប់ពី 8 ឡើងទៅ និងគ្មានមុខវិជ្ជាណាធ្លាក់',
        'honor.provenance': 'លក្ខណៈវិនិច្ឆ័យបណ្ដោះអាសន្ន — មិនមែនផ្លូវការពីក្រសួងទេ',
        'teacher.name': 'គ្រូ ក', 'director.role': 'នាយកសាលា',
        'director.name': 'លោក ខ', 'province.date': 'ភ្នំពេញ',
      },
      subjects: subs,
      rows: Array.from({ length: honoured }, (_, i) => ({
        values: {
          'row.no': String(i + 1), 'row.name': `សិស្ស${i + 1}`, 'row.gender': 'ស្រី',
          'row.average': Number((9.5 - i * 0.1).toFixed(2)),
          'row.grade': 'ល្អណាស់', 'row.rank': String(i + 1),
        },
        subjectValues: subs.map(() => 9),
      })),
    }
  }

  // §13 — variable length: 20 honourees.
  const many = await fillXlsxTemplate(buf, payload(4, 20))
  const mw = new ExcelJS.Workbook(); await mw.xlsx.load(many as unknown as ArrayBuffer)
  const ws = mw.worksheets[0]

  check('twenty honoured pupils expand to twenty rows',
    ws.getRow(FIRST_ROW + 19).getCell(2).value === 'សិស្ស20',
    String(ws.getRow(FIRST_ROW + 19).getCell(2).value))
  check('four subject columns expand',
    ws.getRow(HEADER_ROW).getCell(SC + 3).value === 'មុខវិជ្ជា4')
  check('the tail shifted with the region',
    ws.getRow(HEADER_ROW).getCell(SC + 4).value === 'មធ្យមភាគ',
    String(ws.getRow(HEADER_ROW).getCell(SC + 4).value))
  check('the average is numeric', typeof ws.getRow(FIRST_ROW).getCell(SC + 4).value === 'number')

  // The disclaimer must reach the paper (§25).
  check('the criteria line is printed on the sheet',
    String(ws.getCell('A6').value).includes('មធ្យមភាគចាប់ពី'))
  check('and the non-official warning is printed too',
    String(ws.getCell('A7').value).includes('មិនមែនផ្លូវការ'),
    String(ws.getCell('A7').value))

  check('no token survives', (() => {
    let bad: string | null = null
    ws.eachRow({ includeEmpty: false }, r => r.eachCell({ includeEmpty: false }, c => {
      const v = typeof c.value === 'string' ? c.value : ''
      if (v.includes('{{')) bad = v
    }))
    return bad === null
  })())

  // §21.12 — formatting round trip. Portrait here, unlike the ranking sheets.
  check('page setup survived and is PORTRAIT', ws.pageSetup.orientation === 'portrait')
  check('fit-to-width survived', ws.pageSetup.fitToWidth === 1)
  check('print titles survived', ws.pageSetup.printTitlesRow === '8:8')
  check('the title merge widened with the table',
    (ws as unknown as { model?: { merges?: string[] } }).model?.merges?.some(
      m => m.startsWith('A4:') && m !== 'A4:G4') === true)
  check('header fill survived', ws.getRow(HEADER_ROW).getCell(1).fill?.type === 'pattern')
  check('cloned subject header keeps its rotation',
    ws.getRow(HEADER_ROW).getCell(SC + 2).alignment?.textRotation === 90)
  check('duplicated rows keep their borders',
    ws.getRow(FIRST_ROW + 19).getCell(2).border?.left?.style === 'thin')
  check('column widths kept', ws.getColumn(2).width === tplWs.getColumn(2).width)

  // §13 — nobody qualified. The sheet must still print, saying so.
  const empty = await fillXlsxTemplate(buf, { ...payload(3, 0), rows: [] })
  const ew = new ExcelJS.Workbook(); await ew.xlsx.load(empty as unknown as ArrayBuffer)
  check('zero honourees still yields a usable sheet',
    ew.worksheets[0].getRow(HEADER_ROW).getCell(SC).value === 'មុខវិជ្ជា1')
  check('and leaves no row marker behind',
    !String(ew.worksheets[0].getRow(FIRST_ROW).getCell(1).value ?? '').includes('#rows'))

  const one = await fillXlsxTemplate(buf, payload(1, 1))
  const ow = new ExcelJS.Workbook(); await ow.xlsx.load(one as unknown as ArrayBuffer)
  check('a single honouree with a single subject renders',
    ow.worksheets[0].getRow(FIRST_ROW).getCell(2).value === 'សិស្ស1')
}

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ report engine fills templates and preserves formatting.')
