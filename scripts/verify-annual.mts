/**
 * The acceptance test for the annual reporting layer.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-annual.mts
 *
 * Covers Phase 2 (`ranking_annual`) and the shared annual domain every Phase 4
 * report is built on. Three claims carry the change, and all three are testable
 * without a database:
 *
 *   1. THE THRESHOLD WAS NOT INVENTED. `/yearly-report` has always split the
 *      class at 5.00. `promotionThreshold` must reproduce that number exactly
 *      for primary — if it ever does not, a pupil's year changes because of a
 *      refactor, which is the one outcome this whole layer exists to prevent.
 *
 *   2. STORED BEATS DERIVED, PER SEMESTER. The fallback exists because nothing
 *      in this app writes a `score_type='annual'` row; it must never override a
 *      figure a teacher actually has.
 *
 *   3. A MISSING YEAR IS NOT A FAILED YEAR (§36). `incomplete` is a third
 *      state, and it belongs on neither promotion list.
 *
 * Plus the document: the template fills, expands and keeps its formatting, and
 * says on the paper which of the two sources it printed.
 */

import ExcelJS from 'exceljs'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import { hasToken, type ReportPayload } from '../lib/reporting/report-mapper.ts'
import { REPORT_DEFINITIONS } from '../lib/reporting/report-types.ts'
import { reportAvailability, activeTemplate } from '../lib/reporting/report-template.ts'
import { DEFAULT_SCHEME_CONFIG, SECONDARY_SCHEME_CONFIG } from '../lib/grading/scheme.ts'
import { assignRanks } from '../lib/scores/aggregate.ts'
import { semesterAverage, monthlyComponent } from '../lib/scores/semester.ts'
import {
  annualSourceNote, annualStatus, annualStatusLabel, buildAnnualResult,
  computeAnnualAverage, promotionThreshold, resolveSemesterValue, storedAnnualValue,
} from '../lib/scores/annual.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const def = REPORT_DEFINITIONS.find((r) => r.type === 'ranking_annual')!

// ---------------------------------------------------------------------------
console.log('\nA. catalogue (§26)')
{
  check('ranking_annual is in the canonical catalogue', def !== undefined)
  check('it is a ranking report', def.category === 'ranking')
  check('its period selector is the year', def.period === 'year')
  check('its output is XLSX through the engine', def.formats.includes('xlsx'))
  check('it declares a resolver', def.resolver === true)
  check('the legacy /ranking route is preserved (§29)', def.legacyHref === '/ranking')
  check('exactly one definition carries this type',
    REPORT_DEFINITIONS.filter((r) => r.type === 'ranking_annual').length === 1)
}

// ---------------------------------------------------------------------------
console.log('\nB. availability (§27)')
{
  const avail = reportAvailability(def)
  check('resolver + active template = engine_ready', avail.status === 'engine_ready', avail.status)
  check('the card offers generation, not the legacy screen', avail.action === 'generate')
  check('and says so in Khmer (§43)', avail.actionLabel === 'បង្កើតរបាយការណ៍')
  check('the template version is recorded (§44)',
    avail.template?.id === 'ranking_annual_v1' && avail.template?.version === 1)
  check('provenance is derived, never claimed official (§31)',
    avail.template?.provenance === 'derived')
  check('exactly one active template for the report',
    activeTemplate('ranking_annual')?.id === 'ranking_annual_v1')
}

// ---------------------------------------------------------------------------
console.log('\nC. the promotion threshold is the product\'s, not a new one (§17)')
{
  // The literal `/yearly-report` printed as ៥.០ for the whole life of the
  // feature. Pinned as a number here so a scheme edit cannot move it silently.
  check('primary promotion threshold is exactly 5.0, as /yearly-report shows',
    promotionThreshold(DEFAULT_SCHEME_CONFIG) === 5.0,
    String(promotionThreshold(DEFAULT_SCHEME_CONFIG)))
  check('it is the scheme\'s own pass mark, not a parallel constant',
    promotionThreshold(DEFAULT_SCHEME_CONFIG) === DEFAULT_SCHEME_CONFIG.passMark)
  // Scales rather than being restated — the abstraction §1 asks for, without
  // implementing any secondary-specific rule.
  check('secondary scales to 25/50 instead of a meaningless 5/50',
    promotionThreshold(SECONDARY_SCHEME_CONFIG) === 25,
    String(promotionThreshold(SECONDARY_SCHEME_CONFIG)))
}

// ---------------------------------------------------------------------------
console.log('\nD. stored beats derived, per semester (§5/§36)')
{
  const stored = resolveSemesterValue(7.5, 6.0)
  check('a stored figure wins over a derived one', stored.value === 7.5 && stored.source === 'stored')
  check('and the losing candidate is kept, not discarded', stored.derived === 6.0)

  const derived = resolveSemesterValue(null, 6.25)
  check('with no stored figure the derived one is used',
    derived.value === 6.25 && derived.source === 'derived')

  const neither = resolveSemesterValue(null, null)
  check('with neither, the semester is absent — never 0 (§35/§36)',
    neither.value === null && neither.source === 'none')

  // The stored sheet writes 0 for "not yet marked"; treating it as a mark would
  // drag a pupil's year to zero. Transcribed rule, pinned.
  check('a stored 0 means "not marked", not a mark of zero',
    storedAnnualValue(0) === null && storedAnnualValue('') === null)
  check('a real stored mark still reads through', storedAnnualValue('7.25') === 7.25)
}

// ---------------------------------------------------------------------------
console.log('\nE. the annual average is /score/total\'s, quirk included')
{
  check('two semesters average normally', computeAnnualAverage(8, 6) === 7)
  // The quirk that must survive: one semester averages to ITSELF, not to half.
  check('one semester averages to itself, not to half of it (§36)',
    computeAnnualAverage(8, null) === 8 && computeAnnualAverage(null, 6) === 6)
  check('no semester at all is null, never 0.00', computeAnnualAverage(null, null) === null)
}

// ---------------------------------------------------------------------------
console.log('\nF. three statuses, and a missing year is not a failed year (§36)')
{
  const t = promotionThreshold(DEFAULT_SCHEME_CONFIG)
  check('above the line is promoted', annualStatus(7, t) === 'promoted')
  check('exactly on the line is promoted (boundary)', annualStatus(5.0, t) === 'promoted')
  check('a hair below the line repeats (boundary)', annualStatus(4.99, t) === 'repeated')
  check('no annual result is incomplete, NOT repeated', annualStatus(null, t) === 'incomplete')
  check('the three labels are Khmer (§43)',
    annualStatusLabel('promoted') === 'ឡើងថ្នាក់'
    && annualStatusLabel('repeated') === 'ត្រួតថ្នាក់'
    && annualStatusLabel('incomplete') === 'មិនទាន់គ្រប់')

  // The two lists must partition the class with no pupil on both and no
  // unmarked pupil on either — the property PromotionListClient guards by hand.
  const cohort = [8.0, 5.0, 4.99, null, 2.0].map((a) => annualStatus(a, t))
  check('promoted and repeated are complementary and exclude the incomplete (§18)',
    cohort.filter((s) => s === 'promoted').length === 2
    && cohort.filter((s) => s === 'repeated').length === 2
    && cohort.filter((s) => s === 'incomplete').length === 1)
}

// ---------------------------------------------------------------------------
console.log('\nG. provenance travels with the figure (§31/§52)')
{
  const t = promotionThreshold(DEFAULT_SCHEME_CONFIG)

  const allStored = buildAnnualResult(
    { sem1Stored: 8, sem2Stored: 6, sem1Derived: 1, sem2Derived: 1 }, t)
  check('both halves stored -> the year is stored', allStored.source === 'stored')
  check('and the stored figures are the ones averaged', allStored.average === 7)

  const mixed = buildAnnualResult(
    { sem1Stored: 8, sem2Stored: null, sem1Derived: null, sem2Derived: 6 }, t)
  check('one derived half makes the whole year derived — never overclaim',
    mixed.source === 'derived')
  check('and it still averages both halves', mixed.average === 7)

  const empty = buildAnnualResult(
    { sem1Stored: null, sem2Stored: null, sem1Derived: null, sem2Derived: null }, t)
  check('nothing anywhere is source "none" and status incomplete',
    empty.source === 'none' && empty.status === 'incomplete' && empty.average === null)

  check('each source has a Khmer sentence for the sheet',
    annualSourceNote('stored').length > 0
    && annualSourceNote('derived').length > 0
    && annualSourceNote('none').length > 0)
}

// ---------------------------------------------------------------------------
console.log('\nH. the derived half is the canonical semester layer (§6)')
{
  // Not a re-implementation: the derived semester figure this layer consumes is
  // literally `semesterAverage(exam, monthlyComponent(...))`. Pinned so the
  // annual reports cannot drift from ranking_semester and /score/total.
  const monthly = { nov: 8, dec: 6, jan: 7 }
  const coursework = monthlyComponent(monthly, ['nov', 'dec', 'jan', 'feb', 'mar'])
  check('coursework skips unmarked months rather than zeroing them',
    coursework === 7, String(coursework))

  check('a semester is half exam, half coursework', semesterAverage(9, 7) === 8)
  // The deliberate asymmetry, preserved: a missing HALF counts as zero.
  check('a missing half counts as zero — the product\'s existing definition',
    semesterAverage(8, null) === 4)
  check('both halves missing is null', semesterAverage(null, null) === null)

  // End to end through the annual layer with no stored sheet at all — the
  // situation EVERY class created in this app is actually in.
  const t = promotionThreshold(DEFAULT_SCHEME_CONFIG)
  const year = buildAnnualResult({
    sem1Stored: null, sem2Stored: null,
    sem1Derived: semesterAverage(9, 7),
    sem2Derived: semesterAverage(8, 6),
  }, t)
  check('a class with no stored annual sheet still gets a real year',
    year.average === 7.5 && year.source === 'derived' && year.status === 'promoted',
    `${year.average} / ${year.source} / ${year.status}`)
}

// ---------------------------------------------------------------------------
console.log('\nI. ranking semantics are the canonical ones (§37)')
{
  type R = { id: string; avg: number; rank: number }
  const rank = (avgs: [string, number][]): R[] => {
    const rows: R[] = avgs.map(([id, avg]) => ({ id, avg, rank: 0 }))
    assignRanks([...rows], (r) => r.avg, (r, n) => { r.rank = n })
    return rows
  }
  const tied = rank([['a', 9], ['b', 8], ['c', 8], ['d', 7]])
  check('competition ranking: ties share, the next rank skips (1,2,2,4)',
    tied.map((r) => r.rank).join(',') === '1,2,2,4')
  check('never dense ranking (1,2,2,3)', tied.map((r) => r.rank).join(',') !== '1,2,2,3')
  check('a whole class tied all share rank 1',
    rank([['a', 8], ['b', 8], ['c', 8]]).every((r) => r.rank === 1))
}

// ---------------------------------------------------------------------------
console.log('\nJ. the document (§39)')
{
  const TEMPLATE = 'lib/reporting/templates/ranking_annual_v1.xlsx'
  const buf = await readFile(TEMPLATE)
  const HEADER_ROW = 7          // six letterhead rows, then the header
  const SUBJECT_COL = 5         // ល.រ · ចំណាត់ថ្នាក់ · នាម · ភេទ · {{#subjects}}
  const LEAD = 4
  const TAIL = 5

  const payload = (subjectCount: number, pupils: number): ReportPayload => ({
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
      'class.name': '៤ក', 'class.grade': '៤', 'class.count': String(pupils),
      'class.average': 7.5, 'class.scored': String(pupils),
      'class.promoted': String(pupils), 'class.repeated': '០', 'class.incomplete': '០',
      'class.passmark': '៥',
      'period.label': 'ឆ្នាំសិក្សា ២០២៥-២០២៦',
      'annual.source': annualSourceNote('derived'),
      'teacher.name': 'លោកគ្រូ សុខ', 'director.name': 'លោក ចាន់',
      'director.role': 'នាយកសាលា', 'province.date': 'ភ្នំពេញ, ថ្ងៃទី១',
    },
    subjects: Array.from({ length: subjectCount }, (_, i) => ({
      key: `k${i}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    })),
    rows: Array.from({ length: pupils }, (_, i) => ({
      values: {
        'row.no': String(i + 1), 'row.rank': String(i + 1),
        'row.name': `សិស្ស ${i + 1}`, 'row.gender': 'ប្រុស',
        'row.sem1': 7.5, 'row.sem2': 7.5, 'row.average': 7.5,
        'row.grade': 'ល្អ', 'row.status': 'ឡើងថ្នាក់',
      },
      subjectValues: Array.from({ length: subjectCount }, () => 8),
    })),
  })

  const generate = async (subjectCount: number, pupils: number) => {
    const out = await fillXlsxTemplate(buf, payload(subjectCount, pupils))
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(out as unknown as ArrayBuffer)
    return wb.worksheets[0]
  }

  // -- dynamic expansion, in both directions at once
  const ws = await generate(6, 12)
  const firstRow = HEADER_ROW + 1
  check('twelve pupils expand to twelve rows (§35)',
    String(ws.getRow(firstRow + 11).getCell(3).value) === 'សិស្ស 12')
  check('six subject columns expand from the single marked one (§21)',
    ws.getRow(HEADER_ROW).getCell(SUBJECT_COL + 5).value === 'មុខវិជ្ជា6')
  check('the tail shifted right with the region, not over it',
    ws.getRow(HEADER_ROW).getCell(SUBJECT_COL + 6).value === 'ម.ភាគ ឆមាសទី១'
    && ws.getRow(HEADER_ROW).getCell(SUBJECT_COL + 6 + TAIL - 1).value === 'លទ្ធផល')

  // -- typed values, so the sheet stays summable
  check('the annual average lands as a number, not text',
    typeof ws.getRow(firstRow).getCell(SUBJECT_COL + 6 + 2).value === 'number')
  check('and so do the two semester averages',
    typeof ws.getRow(firstRow).getCell(SUBJECT_COL + 6).value === 'number'
    && typeof ws.getRow(firstRow).getCell(SUBJECT_COL + 7).value === 'number')

  // -- no token survives anywhere
  let leftover = ''
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value
      const text = typeof v === 'string' ? v : ''
      if (text && hasToken(text)) leftover = text
    })
  })
  check('no {{token}} survives into the generated sheet', leftover === '', leftover)

  // -- the provenance line is on the PAPER, not in metadata
  let printedProvenance = false
  let printedDerivedWarning = false
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t.includes('គណនាចេញពីពិន្ទុប្រឡង')) printedProvenance = true
      if (t.includes('មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការ')) printedDerivedWarning = true
    })
  })
  check('the sheet states which source the semester figures came from (§31)',
    printedProvenance)
  check('and states that the layout is not an official ministry file (§31)',
    printedDerivedWarning)

  // -- formatting survives the round trip (§39)
  check('page setup survived and is LANDSCAPE',
    ws.pageSetup.orientation === 'landscape', String(ws.pageSetup.orientation))
  check('fit-to-width survived', ws.pageSetup.fitToWidth === 1)
  check('print titles survived', ws.pageSetup.printTitlesRow === `${HEADER_ROW}:${HEADER_ROW}`,
    String(ws.pageSetup.printTitlesRow))
  check('A4 survived', ws.pageSetup.paperSize === 9)
  check('the frozen header pane survived',
    ws.views?.[0]?.state === 'frozen')
  check('header fill survived the column clone',
    (ws.getRow(HEADER_ROW).getCell(SUBJECT_COL + 3).fill as ExcelJS.FillPattern)?.fgColor?.argb
      === 'FFE7F0FA')
  check('the cloned subject header keeps its rotation',
    ws.getRow(HEADER_ROW).getCell(SUBJECT_COL + 3).alignment?.textRotation === 90)
  check('duplicated pupil rows keep their borders',
    ws.getRow(firstRow + 7).getCell(2).border?.top?.style === 'thin')
  check('column widths kept', ws.getColumn(3).width === 30, String(ws.getColumn(3).width))
  check('the letterhead merge widened with the table',
    (ws as unknown as { model: { merges: string[] } }).model.merges
      .some((m) => m.startsWith('A1:') && !m.endsWith('1:I1')))

  // -- edge cases (§35)
  const empty = await generate(0, 0)
  check('a class with zero pupils and zero subjects still yields a usable sheet',
    empty.getRow(HEADER_ROW).getCell(1).value === 'ល.រ')
  let emptyLeftover = ''
  empty.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const t = typeof cell.value === 'string' ? cell.value : ''
      if (t && hasToken(t)) emptyLeftover = t
    })
  })
  check('and leaves no row marker behind', emptyLeftover === '', emptyLeftover)

  const one = await generate(1, 1)
  check('a single pupil with a single subject renders',
    String(one.getRow(HEADER_ROW + 1).getCell(3).value) === 'សិស្ស 1'
    && one.getRow(HEADER_ROW).getCell(SUBJECT_COL).value === 'មុខវិជ្ជា1')
  check('with the tail immediately after the one subject column',
    one.getRow(HEADER_ROW).getCell(SUBJECT_COL + 1).value === 'ម.ភាគ ឆមាសទី១')

  const wide = await generate(14, 1)
  check('fourteen subjects expand without disturbing the lead columns',
    wide.getRow(HEADER_ROW).getCell(LEAD).value === 'ភេទ'
    && wide.getRow(HEADER_ROW).getCell(SUBJECT_COL + 13).value === 'មុខវិជ្ជា14')
}

// ---------------------------------------------------------------------------
console.log('\nK. the screen and the report share ONE annual definition (§9)')
{
  // §9 requires `/score/total`'s ឆ្នាំ tab and `ranking_annual` to AGREE, and
  // says a disagreement must be fixed in the shared layer rather than patched
  // into the report. They now agree because both call `buildAnnualResult` —
  // there is no second arithmetic to drift.
  //
  // Asserted STRUCTURALLY, by reading both sources, because the screen's
  // `computeRows` lives in a .tsx client component that this node harness
  // cannot import. A numeric test would only prove one function equals itself;
  // what actually needs guarding is that neither file grows a private copy of
  // the rule again, which is exactly what these checks catch.
  const client = readFileSync('app/(main)/score/total/ScoreTotalClient.tsx', 'utf8')
  const resolver = readFileSync('lib/reporting/report-data.ts', 'utf8')

  check('the screen resolves the year through the shared layer',
    client.includes('buildAnnualResult('))
  check('the report resolves the year through the same function',
    resolver.includes('buildAnnualResult('))

  // The exact shape of the old private arithmetic: two `parseFloat`s off the
  // stored keys, a hand-counted divisor, and a `/ 2`.
  check('the screen no longer parses the stored keys itself',
    !/parseFloat\(String\(scores\['sem[12]_avg'\]/.test(client))
  check('and no longer divides by a hand-counted divisor',
    !/annualTotal \/ 2/.test(client))

  // Both read the stored sheet through the same guard, so "0 means unmarked"
  // cannot be true on one side and false on the other.
  check('both read a stored value through storedAnnualValue',
    client.includes('storedAnnualValue(') && resolver.includes('storedAnnualValue('))
  check('and both address the stored keys by the shared constants, never a literal',
    client.includes('SEM1_KEY') && resolver.includes('SEM1_KEY')
    && !client.includes("'sem1_avg'"))

  // The derived half must be the canonical semester layer on BOTH sides.
  check('the screen derives its semesters with semesterAverage',
    client.includes('semesterAverage('))
  check('and takes its month split from the class calendar, not a literal list',
    client.includes('periodKeysForSemester('))
  check('the report does the same',
    resolver.includes('semesterAverage(') && resolver.includes('periodKeysForSemester('))

  // Provenance is shown on both surfaces, not just the paper.
  check('the screen states which source the year came from',
    client.includes('annualSourceNote('))
  check('and so does the printed sheet',
    resolver.includes('annualSourceNote('))

  // One definition of the threshold, on both sides.
  check('neither side hard-codes the promotion threshold',
    !/>=\s*5\.0\b/.test(resolver) && !/>=\s*5\.0\b/.test(client))
}

console.log(
  failures === 0
    ? '\n✓ the annual layer behaves as specified.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
