/**
 * The acceptance test for `score_semester`.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-score-semester.mts
 *
 * `score_semester` and `ranking_semester` are the same class, the same exam
 * marks, the same coursework and the same averages — printed in opposite
 * orders. The whole risk in adding the second one is that it grows its own
 * arithmetic, so the claims under test are:
 *
 *   1. Both come out of ONE `resolveSemesterClass`, structurally — there is no
 *      second semester computation to drift.
 *   2. The marks grid reads in REGISTER order and the league table in RANK
 *      order; that is the only difference between them.
 *   3. The template fills, expands with the class's curriculum, keeps its
 *      formatting, and survives an empty class.
 */

import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import { hasToken, type ReportPayload } from '../lib/reporting/report-mapper.ts'
import { REPORT_DEFINITIONS } from '../lib/reporting/report-types.ts'
import { reportAvailability, activeTemplate } from '../lib/reporting/report-template.ts'
import { semesterAverage, monthlyComponent, semesterLabel } from '../lib/scores/semester.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const def = REPORT_DEFINITIONS.find((r) => r.type === 'score_semester')!

// ---------------------------------------------------------------------------
console.log('\nA. catalogue and availability (§26/§27)')
{
  check('score_semester is in the canonical catalogue', def !== undefined)
  check('it is a scores report on a semester period',
    def.category === 'scores' && def.period === 'semester')
  check('it declares a resolver and an XLSX output',
    def.resolver === true && def.formats.includes('xlsx'))
  check('the legacy /score/print route is preserved (§29)', def.legacyHref === '/score/print')

  const avail = reportAvailability(def)
  check('it is engine_ready', avail.status === 'engine_ready', avail.status)
  check('and offers បង្កើតរបាយការណ៍', avail.actionLabel === 'បង្កើតរបាយការណ៍')
  check('on a derived template (§31)',
    avail.template?.provenance === 'derived' && avail.template?.id === 'score_semester_v1')
  check('exactly one active template', activeTemplate('score_semester')?.version === 1)
}

// ---------------------------------------------------------------------------
console.log('\nB. one semester layer, two documents (§5/§9)')
{
  // Structural: the resolvers live in a server-only module this harness cannot
  // import. What matters is that neither grew a private copy of the rule.
  const src = readFileSync('lib/reporting/report-data.ts', 'utf8')

  check('a single resolveSemesterClass exists',
    (src.match(/async function resolveSemesterClass\(/g) ?? []).length === 1)
  check('the marks grid consumes it',
    /resolveScoreSemester[\s\S]{0,400}resolveSemesterClass\(request\)/.test(src))
  check('the league table consumes it too',
    /resolveRankingSemester[\s\S]{0,400}resolveSemesterClass\(request\)/.test(src))
  // NOT "one call site in the file": `resolveAnnualClass` legitimately calls
  // `semesterAverage` twice more, once per semester, to derive a year with no
  // stored sheet. What must hold is that neither semester REPORT computes one —
  // both take the figure `resolveSemesterClass` already produced.
  const bodyOf = (name: string) => {
    const at = src.indexOf(`export async function ${name}(`)
    if (at === -1) return ''
    const next = src.indexOf('\nexport ', at + 10)
    return src.slice(at, next === -1 ? undefined : next)
  }
  check('the marks grid computes no semester average of its own',
    !bodyOf('resolveScoreSemester').includes('semesterAverage('))
  check('nor does the league table',
    !bodyOf('resolveRankingSemester').includes('semesterAverage('))
  check('the shared layer computes it exactly once',
    (src.slice(src.indexOf('async function resolveSemesterClass('),
      src.indexOf('/** Header tokens both semester documents share. */'))
      .match(/semesterAverage\(/g) ?? []).length === 1)
  check('and the month split is taken from the class calendar, once',
    (src.match(/periodKeysForSemester\(calendar, semester\)/g) ?? []).length === 1)
  check('both documents share one header-token builder',
    (src.match(/function semesterScalars\(/g) ?? []).length === 1
    && (src.match(/semesterScalars\(data, request\.academicYear\)/g) ?? []).length === 2)
  check('and one row-token builder',
    (src.match(/function semesterRowValues\(/g) ?? []).length === 1
    && (src.match(/semesterRowValues\(c, i, data\.base\.scheme\)/g) ?? []).length === 2)

  // The ONE difference: the league table sorts, the marks grid does not.
  check('the league table sorts by rank, the marks grid keeps register order',
    /resolveRankingSemester[\s\S]{0,900}\[\.\.\.data\.students\]\.sort\(/.test(src)
    && !/resolveScoreSemester[\s\S]{0,500}\.sort\(/.test(src))
}

// ---------------------------------------------------------------------------
console.log('\nC. the arithmetic it inherits (§6/§8)')
{
  check('a semester is half exam, half coursework', semesterAverage(9, 7) === 8)
  check('a missing half counts as zero — the product\'s existing definition',
    semesterAverage(8, null) === 4 && semesterAverage(null, 6) === 3)
  check('both halves missing is null, never 0.00', semesterAverage(null, null) === null)
  check('coursework skips unmarked months rather than zeroing them',
    monthlyComponent({ nov: 8, dec: 6, jan: 7 }, ['nov', 'dec', 'jan', 'feb', 'mar']) === 7)
  check('a pupil with no monthly marks has a null coursework half',
    monthlyComponent({}, ['nov', 'dec']) === null)
  check('the Khmer semester labels are the shared ones',
    semesterLabel('sem1') === 'ឆមាសទី១' && semesterLabel('sem2') === 'ឆមាសទី២')
}

// ---------------------------------------------------------------------------
console.log('\nD. the document (§39)')
{
  const TEMPLATE = 'lib/reporting/templates/score_semester_v1.xlsx'
  const buf = await readFile(TEMPLATE)

  const HEADER = 6          // five letterhead rows, then the header
  const LEAD = 4
  const SUBJECT_COL = LEAD + 1
  const TAIL = 6

  const payload = (subjects: number, pupils: number): ReportPayload => ({
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
      'class.name': '៤ក', 'class.grade': '៤', 'class.count': String(pupils),
      'class.average': 7.5, 'class.scored': String(pupils),
      'class.passed': String(pupils), 'class.failed': '០',
      'class.passmark': '៥', 'class.months': '៥',
      'period.label': 'ឆមាសទី១ ឆ្នាំសិក្សា ២០២៥-២០២៦',
      'period.semester': 'ឆមាសទី១',
      'teacher.name': 'លោកគ្រូ សុខ', 'director.name': 'លោក ចាន់',
      'director.role': 'នាយកសាលា', 'province.date': 'ភ្នំពេញ ថ្ងៃទី១',
    },
    subjects: Array.from({ length: subjects }, (_, i) => ({
      key: `k${i}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    })),
    rows: Array.from({ length: pupils }, (_, i) => ({
      values: {
        'row.no': String(i + 1), 'row.student_id': `S${i + 1}`,
        'row.name': `សិស្ស ${i + 1}`, 'row.gender': 'ប្រុស',
        'row.exam': 8, 'row.monthly': 7, 'row.average': 7.5,
        'row.grade': 'ល្អ', 'row.rank': String(i + 1), 'row.status': 'ជាប់',
      },
      subjectValues: Array.from({ length: subjects }, () => 8),
    })),
  })

  const gen = async (subjects: number, pupils: number) => {
    const out = await fillXlsxTemplate(buf, payload(subjects, pupils))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(out as unknown as ArrayBuffer)
    return wb.worksheets[0]
  }

  const ws = await gen(5, 10)
  const first = HEADER + 1

  check('ten pupils expand to ten rows',
    String(ws.getRow(first + 9).getCell(3).value) === 'សិស្ស 10',
    String(ws.getRow(first + 9).getCell(3).value))
  check('five subject columns expand from the single marked one (§21)',
    ws.getRow(HEADER).getCell(SUBJECT_COL + 4).value === 'មុខវិជ្ជា5')
  check('the tail shifted right with the region',
    ws.getRow(HEADER).getCell(SUBJECT_COL + 5).value === 'ម.ភាគប្រឡង'
    && ws.getRow(HEADER).getCell(SUBJECT_COL + 5 + TAIL - 1).value === 'លទ្ធផល')

  // The two halves are printed SEPARATELY — the whole point of the layout.
  check('the exam and coursework halves are separate, numeric columns',
    typeof ws.getRow(first).getCell(SUBJECT_COL + 5).value === 'number'
    && typeof ws.getRow(first).getCell(SUBJECT_COL + 6).value === 'number')
  check('and the combined semester average is numeric too',
    typeof ws.getRow(first).getCell(SUBJECT_COL + 7).value === 'number')

  let leftover = ''
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t && hasToken(t)) leftover = t
    })
  })
  check('no {{token}} survives', leftover === '', leftover)

  check('A4 landscape page setup survived',
    ws.pageSetup.orientation === 'landscape' && ws.pageSetup.paperSize === 9)
  check('fit-to-width and print titles survived',
    ws.pageSetup.fitToWidth === 1 && ws.pageSetup.printTitlesRow === `${HEADER}:${HEADER}`)
  check('header fill survived the column clone',
    (ws.getRow(HEADER).getCell(SUBJECT_COL + 2).fill as ExcelJS.FillPattern)?.fgColor?.argb
      === 'FFEAF2FB')
  check('the cloned subject header keeps its rotation',
    ws.getRow(HEADER).getCell(SUBJECT_COL + 2).alignment?.textRotation === 90)
  check('duplicated rows keep their borders',
    ws.getRow(first + 6).getCell(1).border?.top?.style === 'thin')
  check('the formula is stated on the sheet, not just in code',
    (() => {
      let found = false
      ws.eachRow({ includeEmpty: false }, (r) => r.eachCell({ includeEmpty: false }, (c) => {
        const t = typeof c.value === 'string' ? c.value : ''
        if (t.includes('ម.ភាគឆមាស = (ម.ភាគប្រឡង + ម.ភាគប្រចាំខែ) ÷ ២')) found = true
      }))
      return found
    })())
  check('and so is the derived-provenance warning (§31)',
    (() => {
      let found = false
      ws.eachRow({ includeEmpty: false }, (r) => r.eachCell({ includeEmpty: false }, (c) => {
        const t = typeof c.value === 'string' ? c.value : ''
        if (t.includes('មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការ')) found = true
      }))
      return found
    })())

  // §35 edge cases
  const empty = await gen(0, 0)
  let emptyLeftover = ''
  empty.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t && hasToken(t)) emptyLeftover = t
    })
  })
  check('zero pupils and zero subjects still yields a usable sheet',
    emptyLeftover === '' && empty.getRow(HEADER).getCell(1).value === 'ល.រ', emptyLeftover)

  const one = await gen(1, 1)
  check('a single pupil with a single subject renders',
    String(one.getRow(HEADER + 1).getCell(3).value) === 'សិស្ស 1'
    && one.getRow(HEADER).getCell(SUBJECT_COL).value === 'មុខវិជ្ជា1')

  const wide = await gen(13, 2)
  check('thirteen subjects expand without disturbing the lead columns',
    wide.getRow(HEADER).getCell(LEAD).value === 'ភេទ'
    && wide.getRow(HEADER).getCell(SUBJECT_COL + 12).value === 'មុខវិជ្ជា13')
}

console.log(
  failures === 0
    ? '\n✓ score_semester shares the semester layer and prints in register order.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
