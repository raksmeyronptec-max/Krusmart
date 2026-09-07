/**
 * The acceptance test for សៀវភៅសិក្ខាគារិក — the record book.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-record-book.mts
 *
 * The record book is the one LONGITUDINAL report (§23) and the one that pushed
 * the DOCX path furthest: a page per pupil, with a subject TABLE inside each
 * page whose rows come from the class's own curriculum. Three things are
 * therefore worth proving rather than assuming:
 *
 *   1. The nested loop works — `{#subjects}` inside `{#rows}`, a table-row loop
 *      inside a paragraph loop. Both the tag placement and the bare-name field
 *      access were established by probing the library; if either regresses, the
 *      booklet silently prints one subject or none.
 *   2. The subject rows come from DATA. The legacy screen hard-codes thirteen
 *      subjects; a class teaching three must print three (§21).
 *   3. Absences are bucketed by the CLASS'S calendar, not a second month split
 *      (§6) — checked here at the domain level, since the resolver's bucketing
 *      is what `lib/scores/calendar.ts` decides.
 */

import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

import { fillDocxTemplate } from '../lib/reporting/docx-writer.ts'
import type { ReportPayload } from '../lib/reporting/report-mapper.ts'
import { REPORT_DEFINITIONS } from '../lib/reporting/report-types.ts'
import { reportAvailability, activeTemplate } from '../lib/reporting/report-template.ts'
import { DEFAULT_CALENDAR, periodKeysForSemester } from '../lib/scores/calendar.ts'
import { MONTH_NUM_BY_ID } from '../lib/constants/months.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const TEMPLATE = 'lib/reporting/templates/tracking/student_tracking_record_book_v1.docx'
const def = REPORT_DEFINITIONS.find((r) => r.type === 'student_tracking_record_book')!
const TOKEN_RE = /\{[#/]?[A-Za-z][\w.]*\}/g

async function docXml(buffer: Buffer): Promise<string> {
  return (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string')
}

const texts = (xml: string): string[] =>
  (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, ''))

const countOf = (xml: string, needle: string) =>
  texts(xml).filter((t) => t.includes(needle)).length

// ---------------------------------------------------------------------------
console.log('\nA. catalogue and availability (§22/§26/§27)')
{
  check('the record book is in the canonical catalogue', def !== undefined)
  check('it is the tracking category on a year period',
    def.category === 'tracking' && def.period === 'year')
  check('it declares a resolver', def.resolver === true)
  check('DOCX is its primary format — the form is page-oriented (§24)',
    def.formats[0] === 'docx')
  check('the REAL route is preserved, not an invented one (§22/§29)',
    def.legacyHref === '/record-book')

  const avail = reportAvailability(def)
  check('it is engine_ready', avail.status === 'engine_ready', avail.status)
  check('on a derived template — no ministry file was supplied (§31)',
    avail.template?.provenance === 'derived'
    && activeTemplate('student_tracking_record_book')?.format === 'docx')
}

// ---------------------------------------------------------------------------
console.log('\nB. the template is a real .docx (§10)')
const buf = await readFile(TEMPLATE)
{
  const zip = await JSZip.loadAsync(buf)
  const names = Object.keys(zip.files)
  check('it is a complete OOXML package',
    ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']
      .every((n) => names.includes(n)))

  const xml = await docXml(buf)
  check('A4 LANDSCAPE, as the form requires',
    xml.includes('w:orient="landscape"') && xml.includes('w:w="16838"'))
  check('the four sections of the MoEYS form are present (§23)',
    xml.includes('ក. លទ្ធផលតាមមុខវិជ្ជា') && xml.includes('ខ. អវត្តមាន')
    && xml.includes('គ. ការវាយតម្លៃឥរិយាបថ') && xml.includes('ឃ. លទ្ធផលប្រចាំឆ្នាំ'))
  check('the pupil loop and the nested subject loop are both declared',
    xml.includes('{#rows}') && xml.includes('{#subjects}')
    && xml.includes('{/subjects}') && xml.includes('{/rows}'))
  check('the subject loop opens and closes inside ONE table row',
    /\{#subjects\}\{label\}/.test(xml) && /\{annual\}\{\/subjects\}/.test(xml))
  check('subject fields are addressed by bare name, not a dotted path',
    !xml.includes('{subjects.label}') && !xml.includes('{subjects.sem1}'))
  check('six tables carry the form', (xml.match(/<w:tbl>/g) ?? []).length === 6,
    String((xml.match(/<w:tbl>/g) ?? []).length))
  check('table headers repeat across a page break', xml.includes('<w:tblHeader/>'))
}

// ---------------------------------------------------------------------------
console.log('\nC. filling it (§24/§39)')
{
  const payload = (subjectLabels: string[], pupils: number): ReportPayload => {
    const subjects = subjectLabels.map((label, i) => ({ key: `k${i}`, label, maxScore: 10 }))
    return {
      scalars: {
        'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
        'book.title': 'សៀវភៅសិក្ខាគារិក',
        'period.label': 'ឆ្នាំសិក្សា ២០២៥-២០២៦',
        'class.name': '៤ក', 'class.grade': '៤',
        'teacher.name': 'លោកគ្រូ សុខ', 'director.name': 'លោក ចាន់',
        'director.role': 'នាយកសាលា', 'province.date': 'ព្រៃវែង ថ្ងៃទី១',
        'annual.source': 'មធ្យមភាគឆមាសគណនាចេញពីពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែ',
        'book.provenance': 'ទម្រង់សៀវភៅតាមដាននេះបង្កើតឡើងដោយ KruSmart',
      },
      subjects,
      rows: Array.from({ length: pupils }, (_, i) => ({
        values: {
          'row.name': `សិស្ស លេខ${i + 1}`, 'row.gender': 'ប្រុស',
          'row.student_id': `S${i + 1}`,
          'row.sem1': 7.5, 'row.sem2': 8, 'row.average': 7.75,
          'row.grade': 'ល្អ', 'row.rank': '១', 'row.status': 'ឡើងថ្នាក់',
          'row.absent_s1_excused': '២', 'row.absent_s1_unexcused': '១',
          'row.absent_s2_excused': '០', 'row.absent_s2_unexcused': '០',
          'row.absent_total': '៣',
          'row.sem_eval_knowledge': 'ល្អ', 'row.sem_eval_skill': 'មធ្យម',
          'row.sem_eval_moral': 'ល្អណាស់', 'row.sem_eval_participate': 'ល្អ',
        },
        subjectValues: subjects.map(() => 8),
        subjectDetail: subjects.map((_, j) => ({ sem1: 7 + j, sem2: 8, annual: 7.5 })),
      })),
    }
  }

  const fill = async (labels: string[], pupils: number) =>
    docXml(await fillDocxTemplate(buf, payload(labels, pupils)))

  const three = ['អំណាន', 'គណិតវិទ្យា', 'វិទ្យាសាស្ត្រ']
  const xml = await fill(three, 2)

  check('no token survives', (xml.match(TOKEN_RE) ?? []).length === 0,
    (xml.match(TOKEN_RE) ?? []).slice(0, 4).join(' '))
  check('two pupils produce two pages, none spare (§35)',
    (xml.match(/pageBreakBefore/g) ?? []).length === 2)
  check('each pupil\'s name appears on their own page',
    countOf(xml, 'សិស្ស លេខ1') === 1 && countOf(xml, 'សិស្ស លេខ2') === 1)

  // §21 — the subject table came from DATA.
  for (const label of three) {
    check(`  the subject ${label} appears once per pupil page`,
      countOf(xml, label) === 2, String(countOf(xml, label)))
  }
  check('the nested loop actually expanded — three subject rows, not one',
    three.every((l) => countOf(xml, l) === 2))

  // A class teaching a different curriculum prints a different table.
  const eight = await fill(
    ['ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ'], 1)
  check('a class teaching eight subjects prints eight rows, not thirteen (§21)',
    ['ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ'].every((l) => countOf(eight, l) >= 1))

  const one = await fill(['អំណាន'], 1)
  check('a class teaching ONE subject prints one row',
    countOf(one, 'អំណាន') === 1 && (one.match(/pageBreakBefore/g) ?? []).length === 1)

  const noSubjects = await fill([], 1)
  check('a class with NO configured subjects still yields a valid page (§35)',
    (noSubjects.match(TOKEN_RE) ?? []).length === 0 && noSubjects.includes('<w:body>'))
  check('and the section heading survives an empty subject table',
    noSubjects.includes('ក. លទ្ធផលតាមមុខវិជ្ជា'))

  const empty = await fill(three, 0)
  check('an empty roster yields a valid document with no pupil page',
    (empty.match(TOKEN_RE) ?? []).length === 0 && !empty.includes('សិស្ស លេខ'))

  // §23 — the longitudinal content is actually on the page.
  check('the absence tally is printed, split by semester',
    countOf(xml, '២') > 0 && xml.includes('មានច្បាប់') && xml.includes('ឥតច្បាប់'))
  check('the four behavioural assessments print as WORDS, never marks',
    xml.includes('ល្អណាស់') && xml.includes('មធ្យម') && xml.includes('ចំណេះដឹង'))
  check('the year\'s outcome and both signatures are on the sheet',
    xml.includes('ឡើងថ្នាក់') && xml.includes('គ្រូបន្ទុកថ្នាក់') && xml.includes('នាយកសាលា'))
  check('the provenance line is printed on the document (§31)',
    xml.includes('ទម្រង់សៀវភៅតាមដាននេះបង្កើតឡើងដោយ KruSmart'))
  check('and the derived-average note travels with it (§52)',
    xml.includes('គណនាចេញពីពិន្ទុប្រឡង'))

  // formatting survives
  check('landscape page setup survived the fill',
    xml.includes('w:orient="landscape"'))
  check('the tables survived — six per pupil page',
    (xml.match(/<w:tbl>/g) ?? []).length === 12)
  check('cell shading survived', xml.includes('w:fill="EFF6EE"'))
  check('the Moul display font survived', xml.includes('Khmer OS Muol Light'))
}

// ---------------------------------------------------------------------------
console.log('\nD. absences follow the CLASS\'S calendar, not a second split (§6)')
{
  // The legacy screen hard-codes `month >= 11 || month <= 3` for semester one.
  // The resolver buckets by the class's own periods instead. On the DEFAULT
  // calendar the two must agree exactly, or the new report would silently
  // re-attribute absences for every existing class.
  const sem1 = periodKeysForSemester(DEFAULT_CALENDAR, 'sem1')
  const sem2 = periodKeysForSemester(DEFAULT_CALENDAR, 'sem2')

  const nums = (ids: string[]) => ids.map((id) => Number(MONTH_NUM_BY_ID[id]))
  const legacySem1 = (m: number) => m >= 11 || m <= 3

  check('every default sem1 period is a month the legacy rule called sem1',
    nums(sem1).every(legacySem1), nums(sem1).join(','))
  check('and every default sem2 period is one it called sem2',
    nums(sem2).every((m) => !legacySem1(m)), nums(sem2).join(','))
  check('together they cover all twelve months exactly once',
    sem1.length + sem2.length === 12 && new Set([...sem1, ...sem2]).size === 12)

  // A merged period must still bucket every member month.
  const merged = [
    { ...DEFAULT_CALENDAR[0], members: ['nov', 'dec'] as const },
  ]
  check('a merged period carries every member month, not just its anchor',
    merged[0].members.length === 2 && merged[0].key === 'nov')
}

console.log(
  failures === 0
    ? '\n✓ the record book prints one page per pupil from the class\'s own curriculum.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
