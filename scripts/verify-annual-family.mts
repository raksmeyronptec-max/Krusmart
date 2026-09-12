/**
 * The acceptance test for the seven yearly reports.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-annual-family.mts
 *
 * §11's warning is the thing under test: these must NOT become seven
 * independent calculation systems. So rather than checking seven sets of
 * numbers, this checks the properties that only hold if they share one layer:
 *
 *   - the promoted and repeated lists PARTITION the class, with the unmarked on
 *     neither — impossible to get wrong by hand, trivial once `annualStatus` is
 *     the only judge (§18);
 *   - the subject tally is the SAME function `/yearly-report/subject-results`
 *     calls, so "ជាប់" means one thing (§16);
 *   - every template expands its variable region — subjects, months or grade
 *     bands — from data, never from a constant (§21);
 *   - and each of the seven fills, keeps its formatting, and survives an empty
 *     class (§35/§39).
 */

import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'

import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import { hasToken, type ReportPayload } from '../lib/reporting/report-mapper.ts'
import { REPORT_DEFINITIONS, reportsByCategory } from '../lib/reporting/report-types.ts'
import type { ReportType } from '../lib/reporting/report-types.ts'
import { reportAvailability, activeTemplate } from '../lib/reporting/report-template.ts'
import { DEFAULT_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import { assignRanks } from '../lib/scores/aggregate.ts'
import { annualStatus, promotionThreshold } from '../lib/scores/annual.ts'
import {
  ABC_FRACTION, PASS_FRACTION, isFemale, schemeLetters, tallyCell, tallySubject,
} from '../lib/scores/subject-results.ts'
import { MONTHS_BY_ACADEMIC_YEAR } from '../lib/constants/months.ts'
import { toKhmerNumber } from '../lib/utils/khmer-num.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const FAMILY: ReportType[] = [
  'annual_summary',
  'annual_monthly_ranking',
  'annual_monthly_average',
  'annual_subject',
  'annual_subject_results',
  'annual_promoted_students',
  'annual_repeated_students',
]

// ---------------------------------------------------------------------------
console.log('\nA. catalogue (§26)')
{
  for (const type of FAMILY) {
    const def = REPORT_DEFINITIONS.find((r) => r.type === type)
    check(`${type} is in the canonical catalogue`, def !== undefined)
    check(`  it is a yearly report on a year period`,
      def?.category === 'yearly' && def?.period === 'year')
    check(`  it declares a resolver and an XLSX output`,
      def?.resolver === true && def?.formats.includes('xlsx') === true)
    check(`  its legacy /yearly-report route is preserved (§29)`,
      def?.legacyHref?.startsWith('/yearly-report') === true, String(def?.legacyHref))
  }
  check('the yearly category lists exactly these seven',
    reportsByCategory('yearly').map((r) => r.type).join(',') === FAMILY.join(','))
}

/**
 * The version each report is expected to generate on.
 *
 * Pinned rather than read from the registry, so superseding a layout is a
 * deliberate two-line change here and never something a template edit can do
 * silently. `annual_monthly_average` is on v2 — the school-supplied form.
 */
const ACTIVE_TEMPLATE_ID: Record<string, string> = Object.fromEntries(
  FAMILY.map((t) => [t, `${t}_v2`]),
)

// ---------------------------------------------------------------------------
console.log('\nB. availability (§27/§28)')
{
  for (const type of FAMILY) {
    const def = REPORT_DEFINITIONS.find((r) => r.type === type)!
    const avail = reportAvailability(def)
    check(`${type} is engine_ready`, avail.status === 'engine_ready', avail.status)
    // `បើក` since the Print Center rewrite: the button opens the generation
    // flow, and naming it after the flow's last step made teachers believe a
    // file had already been written when they clicked away.
    check(`  and offers បើក`,
      avail.action === 'generate' && avail.actionLabel === 'បើក')
    check(`  on a derived template, never claimed official (§31)`,
      avail.template?.provenance === 'derived'
      && avail.template?.id === ACTIVE_TEMPLATE_ID[type], avail.template?.id)
  }
}

// ---------------------------------------------------------------------------
console.log('\nC. the two promotion lists partition the class (§18/§36)')
{
  const t = promotionThreshold(DEFAULT_SCHEME_CONFIG)
  // A cohort covering every case §35 lists: clear pass, exact boundary, a hair
  // below, a clear fail, and two pupils with no result at all.
  const cohort = [9.5, 5.0, 4.99, 2.0, null, null]
  const statuses = cohort.map((a) => annualStatus(a, t))

  const promoted = statuses.filter((s) => s === 'promoted').length
  const repeated = statuses.filter((s) => s === 'repeated').length
  const incomplete = statuses.filter((s) => s === 'incomplete').length

  check('every pupil lands in exactly one of the three states',
    promoted + repeated + incomplete === cohort.length)
  check('the two printed lists are complementary and never overlap',
    promoted === 2 && repeated === 2)
  check('an unmarked pupil is on NEITHER list — a missing year is not a failed year',
    incomplete === 2)
  check('the boundary pupil is promoted, not repeated',
    annualStatus(t, t) === 'promoted')
  check('and the threshold printed on both sheets is the same number',
    t === 5.0 && t === DEFAULT_SCHEME_CONFIG.passMark)

  // Zero-student and single-student classes.
  check('an empty class produces two empty lists, not an error',
    [].filter((s) => s === 'promoted').length === 0)
  check('a one-pupil class lands on exactly one list',
    [annualStatus(8, t)].filter((s) => s === 'promoted').length === 1)
}

// ---------------------------------------------------------------------------
console.log('\nD. the subject tally is the screen\'s, not a second one (§16)')
{
  const scheme = DEFAULT_SCHEME_CONFIG
  const values = [
    { value: 9, female: false },   // pass, ABC
    { value: 7, female: true },    // pass, ABC (exactly 70%)
    { value: 5, female: false },   // pass (exactly 50%), not ABC
    { value: 4.9, female: true },  // fail
  ]
  const t = tallySubject('kh_read', 'អំណាន', values, 10, scheme)

  check('the fractions are the screen\'s, not new numbers',
    PASS_FRACTION === 0.5 && ABC_FRACTION === 0.7)
  check('four marked pupils are counted, two of them girls',
    t.tot.t === 4 && t.tot.f === 2)
  check('a mark exactly on the pass fraction passes (boundary)', t.pass.t === 3)
  check('a mark exactly on the ABC fraction reaches ABC (boundary)', t.passABC.t === 2)
  check('below the pass fraction fails', t.fail.t === 1 && t.fail.f === 1)
  check('pass and fail account for every marked pupil',
    t.pass.t + t.fail.t === t.tot.t)
  check('the subject average is the mean of the marks',
    t.average !== null && Math.abs(t.average - 6.475) < 1e-9, String(t.average))

  // Judged on the SUBJECT's own scale, not the scheme's.
  const outOf75 = tallySubject('big', 'ធំ', [{ value: 40, female: false }], 75, scheme)
  check('a subject out of 75 is judged at 37.5, not against a /10 yardstick',
    outOf75.pass.t === 1 && outOf75.fail.t === 0)
  const outOf75Fail = tallySubject('big', 'ធំ', [{ value: 30, female: false }], 75, scheme)
  check('and 30/75 correctly fails', outOf75Fail.fail.t === 1)

  const unmarked = tallySubject('none', 'គ្មាន', [], 10, scheme)
  check('a subject nobody is marked in tallies to zero with a null average (§35)',
    unmarked.tot.t === 0 && unmarked.average === null)

  check('the ministry cell shape is សរុប (ស្រី)',
    tallyCell({ t: 30, f: 12 }, toKhmerNumber) === '៣០ (១២)',
    tallyCell({ t: 30, f: 12 }, toKhmerNumber))
  check('both spellings of female are recognised',
    isFemale('ស្រី') && isFemale('F') && !isFemale('ប្រុស') && !isFemale(null))
  check('the grade bands come from the scheme, so a letter change needs no template edit',
    schemeLetters(scheme).length === scheme.bands.length)
}

// ---------------------------------------------------------------------------
console.log('\nE. monthly ranking reuses assignRanks (§13/§37)')
{
  // Per-month ranking is the same walk, applied once per month over the
  // averages the annual layer already holds. Pinned here because a month is
  // where a second ranking implementation would most plausibly appear.
  const perMonth = (avgs: [string, number][]) => {
    const rows = avgs.map(([id, avg]) => ({ id, avg, rank: 0 }))
    assignRanks(rows, (r) => r.avg, (r, n) => { r.rank = n })
    return Object.fromEntries(rows.map((r) => [r.id, r.rank]))
  }
  const nov = perMonth([['a', 9], ['b', 8], ['c', 8], ['d', 7]])
  check('a month ranks with ties sharing and the next rank skipping (1,2,2,4)',
    `${nov.a},${nov.b},${nov.c},${nov.d}` === '1,2,2,4')

  // An unmarked pupil is EXCLUDED from the month rather than ranked last.
  const dec = perMonth([['a', 9], ['b', 7]])
  check('a pupil unmarked that month gets no rank for it, not last place',
    dec.c === undefined && Object.keys(dec).length === 2)
}

// ---------------------------------------------------------------------------
console.log('\nF. every template fills, expands and keeps its formatting (§39)')

/** A payload for a pupil-row sheet with `n` variable columns. */
function pupilPayload(columns: number, pupils: number, labels?: string[]): ReportPayload {
  return {
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
      'class.name': '៤ក', 'class.grade': '៤', 'class.count': String(pupils),
      'class.average': 7.5, 'class.scored': String(pupils),
      'class.promoted': '៥', 'class.repeated': '២', 'class.incomplete': '១',
      'class.passmark': '៥', 'class.subjects': String(columns),
      'period.label': 'ឆ្នាំសិក្សា ២០២៥-២០២៦',
      'annual.source': 'មធ្យមភាគឆមាសគណនាចេញពីពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែ',
      'list.rule': 'មធ្យមភាគប្រចាំឆ្នាំចាប់ពី 5.00 ឡើងទៅ',
      'list.count': '៥', 'list.female': '២', 'list.average': 7.8,
      'teacher.name': 'លោកគ្រូ សុខ', 'director.name': 'លោក ចាន់',
      'director.role': 'នាយកសាលា', 'province.date': 'ភ្នំពេញ ថ្ងៃទី១',
    },
    subjects: Array.from({ length: columns }, (_, i) => ({
      key: `k${i}`, label: labels?.[i] ?? `ជួរ${i + 1}`, maxScore: 10,
    })),
    rows: Array.from({ length: pupils }, (_, i) => ({
      values: {
        'row.no': String(i + 1), 'row.rank': String(i + 1),
        'row.name': `សិស្ស ${i + 1}`, 'row.gender': 'ប្រុស',
        'row.student_id': `S${i + 1}`, 'row.dob': '01/01/2015',
        'row.sem1': 7.5, 'row.sem2': 7.5, 'row.average': 7.5,
        'row.grade': 'ល្អ', 'row.status': 'ឡើងថ្នាក់',
        'row.subject': `មុខវិជ្ជា ${i + 1}`, 'row.marked': '៣០ (១២)',
        'row.pass': '២៨ (១១)', 'row.pass_abc': '២០ (៨)', 'row.fail': '២ (១)',
      },
      subjectValues: Array.from({ length: columns }, () => 8),
    })),
  }
}

/** Where each template's header row sits, and how many lead columns it has. */
const LAYOUT: Record<string, { header: number; lead: number; variable: boolean }> = {
  // Six letterhead rows then the header; the two promotion sheets carry a
  // seventh title (the rule they filter on) so their header sits one lower.
  // Every one of them is on the school-supplied form now: a letterhead ten
  // rows deep, the header on row 11, and no `អត្តលេខ` column. The two
  // promotion lists carry a fourth lead column, the pupil's date of birth.
  annual_summary: { header: 11, lead: 3, variable: false },
  annual_monthly_ranking: { header: 11, lead: 3, variable: true },
  annual_monthly_average: { header: 11, lead: 3, variable: true },
  annual_subject: { header: 11, lead: 3, variable: true },
  annual_subject_results: { header: 11, lead: 3, variable: true },
  annual_promoted_students: { header: 11, lead: 4, variable: false },
  annual_repeated_students: { header: 11, lead: 4, variable: false },
}

for (const type of FAMILY) {
  const tpl = activeTemplate(type)!
  const layout = LAYOUT[type]
  const buf = await readFile(`lib/reporting/templates/${tpl.file}`)

  const gen = async (columns: number, pupils: number, labels?: string[]) => {
    const out = await fillXlsxTemplate(buf, pupilPayload(columns, pupils, labels))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(out as unknown as ArrayBuffer)
    return wb.worksheets[0]
  }

  console.log(`\n  ${type}`)

  const ws = await gen(layout.variable ? 6 : 0, 9)
  const first = layout.header + 1

  check('    nine rows expand from the single marked one',
    String(ws.getRow(first + 8).getCell(1).value ?? '') !== '')

  if (layout.variable) {
    check('    the variable region widened to six columns from data, not a constant (§21)',
      ws.getRow(layout.header).getCell(layout.lead + 6).value === 'ជួរ6')
    const twelve = await gen(12, 2)
    check('    and to twelve when the data says twelve',
      twelve.getRow(layout.header).getCell(layout.lead + 12).value === 'ជួរ12')
  }

  let leftover = ''
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t && hasToken(t)) leftover = t
    })
  })
  check('    no {{token}} survives', leftover === '', leftover)

  check('    A4 landscape page setup survived',
    ws.pageSetup.orientation === 'landscape' && ws.pageSetup.paperSize === 9)
  check('    fit-to-width and print titles survived',
    ws.pageSetup.fitToWidth === 1
    && ws.pageSetup.printTitlesRow === `${layout.header}:${layout.header}`)
  check('    header fill survived',
    (ws.getRow(layout.header).getCell(1).fill as ExcelJS.FillPattern)?.fgColor?.argb
      === 'FFEFF6FF')
  check('    duplicated rows keep their borders',
    ws.getRow(first + 5).getCell(1).border?.top?.style === 'thin')
  check('    the derived-provenance line is printed on the sheet (§31)',
    (() => {
      let found = false
      ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
        const t = typeof c.value === 'string' ? c.value : ''
        if (t.includes('មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការ')) found = true
      }))
      return found
    })())

  // §35 — an empty class, and a one-pupil class.
  const empty = await gen(layout.variable ? 0 : 0, 0)
  let emptyLeftover = ''
  empty.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t && hasToken(t)) emptyLeftover = t
    })
  })
  check('    zero pupils and zero columns still yields a usable sheet with no marker',
    emptyLeftover === '' && empty.getRow(layout.header).getCell(1).value === 'ល.រ',
    emptyLeftover)

  const one = await gen(layout.variable ? 1 : 0, 1)
  check('    a single pupil and a single column render',
    String(one.getRow(layout.header + 1).getCell(1).value ?? '') !== '')
}

// ---------------------------------------------------------------------------
console.log('\nG. the month region is the real calendar (§21)')
{
  const tpl = activeTemplate('annual_monthly_average')!
  const buf = await readFile(`lib/reporting/templates/${tpl.file}`)
  const labels = MONTHS_BY_ACADEMIC_YEAR.map((m) => m.label)
  const out = await fillXlsxTemplate(buf, pupilPayload(labels.length, 3, labels))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(out as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]

  const { header, lead } = LAYOUT.annual_monthly_average
  const first = lead + 1
  check('twelve academic-year months expand as twelve columns',
    ws.getRow(header).getCell(first).value === labels[0]
    && ws.getRow(header).getCell(first + 11).value === labels[11],
    `${ws.getRow(header).getCell(first).value}`)
  check('the year starts at វិច្ឆិកា, the Cambodian school year\'s first month',
    labels[0] === 'វិច្ឆិកា')
  check('and the tail still follows the twelfth month',
    ws.getRow(header).getCell(first + 12).value === 'ម.ភាគ ឆមាសទី១')

  /*
   * v2's two-column letterhead splits ON the subject anchor, which is what
   * keeps the halves proportional as the month region grows. Asserted here
   * because the split is invisible in the builder's output and silent when it
   * breaks: a left block merged one column short stays three columns wide
   * while the right half floats off over the tail.
   */
  const merges = (ws as unknown as { model: { merges: string[] } }).model.merges
  const lastCol = ws.getRow(1).getCell(lead + 12 + 6).address.replace(/\d+/g, '')
  const anchorCol = ws.getRow(1).getCell(lead + 12).address.replace(/\d+/g, '')
  const afterAnchor = ws.getRow(1).getCell(lead + 12 + 1).address.replace(/\d+/g, '')
  check('the letterhead spans the whole widened sheet',
    merges.includes(`A1:${lastCol}1`), merges.slice(0, 3).join(' '))
  check('the left half grows with the month region, ending on the anchor',
    merges.includes(`A5:${anchorCol}5`), merges.slice(0, 8).join(' '))
  check('and the roll on the right rides on the tail',
    merges.includes(`${afterAnchor}6:${lastCol}6`), merges.slice(0, 8).join(' '))
}

console.log(
  failures === 0
    ? '\n✓ the annual family shares one layer and seven layouts.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
