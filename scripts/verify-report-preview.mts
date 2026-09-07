/**
 * The acceptance test for the pre-download sheet preview.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-report-preview.mts
 *
 * The property under test is the one the feature exists for: **the picture must
 * not be able to disagree with the file.** The preview is built by filling the
 * real template with the real payload and reading the resulting buffer back, so
 * what this checks is that reading back loses nothing that matters — the merged
 * letterhead still spans the sheet, the class's own subject columns are still
 * there in order, the rotated headers are still rotated, the ruled grid is still
 * ruled, and no `{{token}}` survives into something a teacher would take as the
 * finished document.
 *
 * It runs over EVERY active spreadsheet template, because thirteen reports share
 * one form and a preview that works for one and not another is a preview nobody
 * can trust.
 */

import { readFile } from 'node:fs/promises'

import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import { previewWorkbook } from '../lib/reporting/xlsx-preview.ts'
import type { PreviewCell, SheetPreview } from '../lib/reporting/xlsx-preview.ts'
import { TEMPLATE_REGISTRY, activeTemplate } from '../lib/reporting/report-template.ts'
import type { ReportPayload } from '../lib/reporting/report-mapper.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

/** Every cell of a preview, flattened — most assertions are "is this anywhere". */
function cells(sheet: SheetPreview): PreviewCell[] {
  return sheet.rows.flatMap((r) => r.cells)
}

function text(sheet: SheetPreview): string {
  return cells(sheet).map((c) => c.text).join('\n')
}

const SCALARS = {
  'school.name': 'សាលាបឋមសិក្សា កគោ',
  'school.unit1': 'មន្ទីរអប់រំ ខេត្តព្រៃវែង',
  'school.unit2': 'ការិយាល័យអប់រំ ស្រុកព្រះស្តេច',
  'class.name': 'ក', 'class.grade': '១', 'class.count': '៥២', 'class.female': '១៩',
  'period.label': 'ខែមេសា', 'period.semester': 'ឆមាសទី១', 'period.year': '2025-2026',
  'class.passmark': '៥', 'class.average': 7.4, 'class.months': '៥',
  'class.subjects': '២២', 'class.scored': '៥០',
  'class.roll_tally': '៥២ នាក់ ស្រី ១៩ នាក់',
  'class.passed_tally': '៤៨ នាក់ ស្រី ១៧ នាក់',
  'class.failed_tally': '២ នាក់ ស្រី ១ នាក់',
  'class.unmarked_tally': '២ នាក់ ស្រី ១ នាក់',
  'class.promoted_tally': '៤៨ នាក់ ស្រី ១៧ នាក់',
  'class.repeated_tally': '២ នាក់ ស្រី ១ នាក់',
  'class.incomplete_tally': '២ នាក់ ស្រី ១ នាក់',
  'class.grade_a': '៥ នាក់', 'class.grade_b': '១២ នាក់', 'class.grade_c': '១៨ នាក់',
  'class.grade_d': '១០ នាក់', 'class.grade_e': '៣ នាក់', 'class.grade_f': '២ នាក់',
  'honor.count': '៥', 'honor.total': '៥២', 'honor.average': 9.1,
  'honor.criteria': 'មធ្យមភាគ ≥ ៨', 'honor.provenance': 'លក្ខណៈវិនិច្ឆ័យបណ្ដោះអាសន្ន',
  'list.rule': 'ម.ភាគប្រចាំឆ្នាំ ≥ ៥', 'list.count': '៤៨',
  'list.female': '១៧', 'list.average': 7.9,
  'annual.source': 'គណនាដោយប្រព័ន្ធ',
  'date.lunar': 'ថ្ងៃអាទិត្យ ៩រោច ខែស្រាពណ៍', 'date.today': 'ថ្ងៃទី ០៦ ខែ កញ្ញា ឆ្នាំ ២០២៦',
  'province.date': 'ព្រៃវែង',
  'teacher.name': 'រុន រស្មី', 'director.name': 'ស៊ុន សុភា', 'director.role': 'នាយិកា',
}

function payload(columns: number, pupils: number): ReportPayload {
  return {
    scalars: SCALARS,
    subjects: Array.from({ length: columns }, (_, i) => ({
      key: `s${i + 1}`, label: `មុខវិជ្ជា${i + 1}`, maxScore: 10,
    })),
    rows: Array.from({ length: pupils }, (_, i) => ({
      values: {
        'row.no': String(i + 1), 'row.name': `សិស្ស${i + 1}`, 'row.gender': 'ស',
        'row.dob': '01/01/2015', 'row.total': 180 - i, 'row.average': 8.2,
        'row.rank': String(i + 1), 'row.grade': 'ល្អ', 'row.status': 'ជាប់',
        'row.exam': 8, 'row.monthly': 8.4, 'row.sem1': 7.9, 'row.sem2': 8.5,
        'row.subject': `មុខវិជ្ជា${i + 1}`, 'row.subjects': '២២', 'row.marked': '៣០ (១២)',
        'row.pass': '២៨ (១១)', 'row.pass_abc': '២០ (៨)', 'row.fail': '២ (១)',
      },
      subjectValues: Array.from({ length: columns }, () => 8),
    })),
  }
}

/** Fill a template and read it straight back, exactly as the action does. */
async function preview(file: string, columns: number, pupils: number, omitted = 0) {
  const buf = await readFile(`lib/reporting/templates/${file}`)
  const filled = await fillXlsxTemplate(buf, payload(columns, pupils))
  return previewWorkbook(filled, { omittedRows: omitted })
}

const XLSX = TEMPLATE_REGISTRY.filter((t) => t.isActive && t.format === 'xlsx')
/** Which reports carry a variable region — the rest print a fixed table. */
const NO_REGION = new Set([
  'annual_summary', 'annual_promoted_students', 'annual_repeated_students',
])

/**
 * The two attendance sheets head their region with a day number or a month
 * name, upright, over a second line — not with a rotated subject name. Rotation
 * is a property of the layout, so it is asserted per report rather than
 * demanded of all of them.
 */
const UPRIGHT_REGION = new Set(['attendance_monthly', 'attendance_yearly'])

// ---------------------------------------------------------------------------
console.log('\nA. every spreadsheet report previews')
{
  check('every active spreadsheet template is previewable',
    XLSX.length === 15, String(XLSX.length))

  for (const tpl of XLSX) {
    const variable = !NO_REGION.has(tpl.reportType)
    const columns = variable ? 22 : 0
    const sheet = await preview(tpl.file, columns, 9)
    const all = cells(sheet)
    const body = text(sheet)

    console.log(`\n  ${tpl.reportType}`)

    check('    the letterhead survives as ONE spanned cell, not a repeated one',
      all.some((c) => c.text === 'ព្រះរាជាណាចក្រកម្ពុជា' && (c.colSpan ?? 1) > 1)
      && all.filter((c) => c.text === 'ព្រះរាជាណាចក្រកម្ពុជា').length === 1,
      `${all.filter((c) => c.text === 'ព្រះរាជាណាចក្រកម្ពុជា').length} copies`)

    check('    the school and class lines are filled from the payload',
      body.includes('សាលាបឋមសិក្សា កគោ') && body.includes('ថ្នាក់ទី ១'))

    // `annual_subject_results` is the one sheet whose ROWS are subjects, not
    // pupils (§22) — so what proves the repeating block expanded differs there.
    const rowLabel = tpl.reportType === 'annual_subject_results' ? 'មុខវិជ្ជា' : 'សិស្ស'
    check('    the repeating block expanded, first row to ninth',
      body.includes(`${rowLabel}1`) && body.includes(`${rowLabel}9`), rowLabel)

    if (variable) {
      check('    the class\'s own subject columns are there, first to last',
        body.includes('មុខវិជ្ជា1') && body.includes('មុខវិជ្ជា22'))
      if (UPRIGHT_REGION.has(tpl.reportType)) {
        check('    its upright region header survives unrotated',
          all.some((c) => c.text === 'មុខវិជ្ជា1' && !c.rotate))
      } else {
        check('    a rotated header is still marked rotated',
          all.some((c) => c.rotate === true))
      }
    }

    check('    the ruled grid survives — a preview of an unruled sheet is a lie',
      all.some((c) => c.border?.top && c.border?.left))
    check('    the header band keeps its fill',
      all.some((c) => c.fill === '#eff6ff'),
      [...new Set(all.map((c) => c.fill).filter(Boolean))].join(' '))
    check('    the provenance line reaches the picture too (§31)',
      body.includes('មិនមែនចម្លងផ្ទាល់ពីឯកសារផ្លូវការ'))

    check('    NO {{token}} survives into the preview',
      !body.includes('{{'),
      all.map((c) => c.text).find((t) => t.includes('{{')) ?? '')

    check('    every column reports a width, so the drawn table keeps its shape',
      sheet.columnWidths.length > 0
      && sheet.columnWidths.every((w) => w === undefined || w > 0))
  }
}

// ---------------------------------------------------------------------------
console.log('\nB. the row cap is honest about itself')
{
  const tpl = activeTemplate('score_monthly')!

  // The action slices the payload and reports what it dropped; this mirrors it.
  const LIMIT = 12
  const full = 40
  const sheet = await preview(tpl.file, 6, LIMIT, full - LIMIT)

  check('the cap is carried on the model, not left for the UI to guess',
    sheet.omittedRows === 28, String(sheet.omittedRows))
  check('exactly the capped number of pupils is drawn',
    text(sheet).includes(`សិស្ស${LIMIT}`) && !text(sheet).includes(`សិស្ស${LIMIT + 1}`))
  check('and the summary block still describes the WHOLE class, not the twelve',
    text(sheet).includes('៥២ នាក់ ស្រី ១៩ នាក់'))

  const uncapped = await preview(tpl.file, 6, 9)
  check('an uncapped preview says nothing was omitted', uncapped.omittedRows === 0)
}

// ---------------------------------------------------------------------------
console.log('\nC. the degenerate classes still draw (§35)')
{
  const tpl = activeTemplate('score_monthly')!

  const empty = await preview(tpl.file, 0, 0)
  check('a class with no pupils and no subjects yields a sheet, not a throw',
    empty.rows.length > 0)
  check('and leaves no marker behind for a teacher to read as data',
    !text(empty).includes('{{') && !text(empty).includes('#rows'))

  const one = await preview(tpl.file, 1, 1)
  check('a single pupil with a single subject draws',
    text(one).includes('សិស្ស1') && text(one).includes('មុខវិជ្ជា1'))
}

// ---------------------------------------------------------------------------
console.log('\nD. merges are spans, never repeated text')
{
  const tpl = activeTemplate('score_monthly')!
  const sheet = await preview(tpl.file, 22, 3)

  // The form's letterhead splits on the subject anchor: the left block ends at
  // the anchor and the right rides on the tail. Both are single spanned cells.
  const spanned = cells(sheet).filter((c) => (c.colSpan ?? 1) > 1)
  check('the letterhead is drawn as spans', spanned.length >= 6, String(spanned.length))

  const school = cells(sheet).filter((c) => c.text.includes('សាលាបឋមសិក្សា កគោ'))
  check('the school name appears exactly once, spanning its half',
    school.length === 1 && (school[0]?.colSpan ?? 1) > 1,
    `${school.length} copies, span ${school[0]?.colSpan}`)

  const roll = cells(sheet).filter((c) => c.text.includes('សិស្សសរុប'))
  check('and the roll on the right is one spanned cell too',
    roll.length === 1 && (roll[0]?.colSpan ?? 1) > 1,
    `${roll.length} copies`)
}

// ---------------------------------------------------------------------------
console.log('\nE. Word reports have no sheet to draw')
{
  const docx = TEMPLATE_REGISTRY.filter((t) => t.isActive && t.format === 'docx')
  check('the two Word reports are still registered and active', docx.length === 2,
    docx.map((t) => t.id).join(','))
  check('and neither is a spreadsheet the preview could have drawn',
    docx.every((t) => t.file.endsWith('.docx')))
}

console.log(
  failures === 0
    ? '\n✓ the preview draws the document that would download.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
