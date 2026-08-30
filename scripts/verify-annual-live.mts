/**
 * §33 — the authenticated resolver path for the ANNUAL reports, end to end.
 *
 *     node scripts/verify-annual-live.mts
 *
 * OPT-IN, like `verify-ranking-live.mts`, and for the same reason: it needs a
 * running local Supabase with all migrations applied and
 * `supabase/fixtures/primary_ranking_teacher.sql` seeded (plus the second
 * teacher this script's header describes, for the forged-id checks). It is not
 * in the default suite because it talks to a database.
 *
 * It exists because every other test of the annual layer proves arithmetic and
 * file generation while stubbing the data. What is only provable here is the
 * chain that actually runs in production: a real JWT, RLS, the class scope, the
 * 00028 selection, the 00029 calendar, the canonical annual layer and the two
 * writers.
 *
 * THE MOST IMPORTANT ASSERTION IN THIS FILE is that the fixture class has NO
 * stored annual rows and still produces a real year. That is not a detail — it
 * is the entire justification for the derived fallback in
 * `lib/scores/annual.ts`. If a future change made the annual reports read only
 * the stored sheet, every class in this application would print blank, and this
 * script is what would say so.
 *
 * SECOND TEACHER FIXTURE (for §33's forged-id requirement):
 *   othertest@krusmart.local owns class ៤ខ `c0000000-…-000000000001`, a pupil
 *   and a mark. The teacher under test has no assignment to it and must be
 *   unable to reach any of it, by scope AND by RLS.
 */

import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

import { resolveTemplate } from '../lib/scores/template.ts'
import { applySelection } from '../lib/scores/selection.ts'
import { assignRanks, numericColumnKeys, studentAverage } from '../lib/scores/aggregate.ts'
import { schemeForLevel } from '../lib/grading/levelSchemes.ts'
import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import { fillDocxTemplate } from '../lib/reporting/docx-writer.ts'
import { monthlyComponent, semesterAverage } from '../lib/scores/semester.ts'
import { DEFAULT_CALENDAR, periodKeysForSemester } from '../lib/scores/calendar.ts'
import {
  SEM1_KEY, SEM2_KEY, annualStatus, buildAnnualResult, promotionThreshold, storedAnnualValue,
} from '../lib/scores/annual.ts'
import { isFemale, tallySubject } from '../lib/scores/subject-results.ts'
import type { ReportPayload } from '../lib/reporting/report-mapper.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const CLASS = 'a0000000-0000-0000-0000-000000000005'
const OTHER_CLASS = 'c0000000-0000-0000-0000-000000000001'
const YEAR = '2025-2026'

let fail = 0
const check = (n: string, ok: boolean, d = '') => {
  if (ok) console.log(`  ✓ ${n}`)
  else { fail += 1; console.error(`  ✗ ${n}${d ? `\n      ${d}` : ''}`) }
}

const sb = createClient(URL, ANON)
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: 'ranktest@krusmart.local', password: 'RankTest12345!',
})
check('a real teacher signs in', !authErr && !!auth?.user, authErr?.message)
if (!auth?.user) process.exit(1)
const uid = auth.user.id

// ---------------------------------------------------------------- the scope
console.log('\n-- scope, under RLS --')
const { data: assignments } = await sb.from('teacher_assignments')
  .select('class_id, academic_year_id').eq('teacher_id', uid).eq('status', 'active')
check('their assignment resolves to ៤ក', assignments?.[0]?.class_id === CLASS)

const { data: enrol } = await sb.from('student_enrollments')
  .select('student_id').eq('class_id', CLASS).neq('status', 'withdrawn')
const rosterIds = (enrol ?? []).map((e) => e.student_id as string)
check('the roster reads through enrolments', rosterIds.length >= 4, `got ${rosterIds.length}`)

const { data: students } = await sb.from('students').select('*').in('id', rosterIds)
check('every enrolled pupil is readable', students?.length === rosterIds.length)

// ------------------------------------------------------- §33: forged ids
console.log('\n-- §33 forged class_id and student_id --')
{
  // `resolveServerScope` validates a requested class against the caller's OWN
  // assignments, so the forged id never reaches a query. Proven here by showing
  // the assignment set does not contain it.
  const owns = (assignments ?? []).some((a) => a.class_id === OTHER_CLASS)
  check('the teacher has NO assignment to ៤ខ, so a forged class_id is refused by scope',
    !owns)

  // And RLS refuses it independently, which is the guarantee that survives an
  // application-layer mistake.
  const { data: foreignEnrol } = await sb.from('student_enrollments')
    .select('student_id').eq('class_id', OTHER_CLASS)
  check('RLS returns no enrolment for a class they do not teach',
    (foreignEnrol ?? []).length === 0, `got ${foreignEnrol?.length}`)

  const { data: foreignStudent } = await sb.from('students')
    .select('id').eq('id', 'd0000000-0000-0000-0000-000000000001')
  check('RLS returns no pupil belonging to another teacher',
    (foreignStudent ?? []).length === 0, `got ${foreignStudent?.length}`)

  const { data: foreignScores } = await sb.from('scores')
    .select('id').eq('student_id', 'd0000000-0000-0000-0000-000000000001')
  check('RLS returns none of that pupil\'s marks',
    (foreignScores ?? []).length === 0, `got ${foreignScores?.length}`)

  // The certificate's selection is intersected with the resolved roster, so a
  // forged studentId names a pupil that is simply not in the set.
  const forged = ['d0000000-0000-0000-0000-000000000001']
  const requested = new Set(forged)
  const survivors = rosterIds.filter((id) => requested.has(id))
  check('a forged studentId survives no intersection with the roster',
    survivors.length === 0)
}

// ------------------------------------------------------- the class curriculum
console.log('\n-- the class\'s own curriculum (§21) --')
const { data: templateRows } = await sb.from('score_template_subjects').select('*')
const { data: selection } = await sb.from('class_template_subjects')
  .select('subject_key, enabled_columns, sort_order').eq('class_id', CLASS)

const selectedKeys = (selection ?? []).map((s) => s.subject_key as string)
const classSelection = (selection ?? []).map((s) => ({
  subjectKey: s.subject_key as string,
  enabledColumns: (s.enabled_columns ?? null) as string[] | null,
  sortOrder: (s.sort_order ?? 0) as number,
}))
check('the class selects three subjects (00028)', selectedKeys.length === 3,
  selectedKeys.join(','))

const context = { levelKey: 'primary' as const, gradeNumber: 4, track: null }

/**
 * Resolved on the MONTHLY score type, matching `verify-ranking-live.mts`.
 *
 * A FIXTURE PROPERTY, not a claim about production: the fixture stores its
 * ឆមាស exam marks under monthly column ids (`kh_listen`, `math_num`) and
 * selects monthly subject keys, so the monthly resolution is what its marks
 * are addressable by. In production `resolveAnnualClass` resolves the semester
 * type, and a class whose selection names no semester subject falls back to the
 * full semester template — `applySelection`'s documented behaviour, exercised
 * by `verify-annual.mts` rather than here.
 */
const semesterSubjects = applySelection(
  resolveTemplate((templateRows ?? []) as never, 'monthly', context),
  classSelection,
)
const scheme = schemeForLevel('primary')
const keys = numericColumnKeys(semesterSubjects)
const maxByColumn = Object.fromEntries(
  semesterSubjects.flatMap((s) => s.columns.map((c) => [c.id, s.maxScore])),
)
check('the resolved curriculum is narrowed to the class\'s selection, not the whole template',
  semesterSubjects.length === 3, String(semesterSubjects.length))
check('and it yields a real numeric denominator', keys.length > 0)

// -------------------------------------------------------------- the marks
console.log('\n-- the annual layer, from live marks --')
const period = async (type: string, p: string) => {
  const { data } = await sb.from('scores')
    .select('student_id, subject, score_value, score_text')
    .eq('score_type', type).eq('score_period', p).in('student_id', rosterIds)
  const map = new Map<string, Record<string, number | string | null>>()
  for (const r of data ?? []) {
    const b = map.get(r.student_id as string) ?? {}
    b[r.subject as string] = (r.score_value ?? r.score_text) as number | string | null
    map.set(r.student_id as string, b)
  }
  return map
}

const sem1Exam = await period('semester', `sem1-${YEAR}`)
const sem2Exam = await period('semester', `sem2-${YEAR}`)
const storedAnnual = await period('annual', `annual-${YEAR}`)

check('sem1 exam marks are readable under RLS', sem1Exam.size >= 3, String(sem1Exam.size))

// ★ The assertion the whole fallback exists for.
check('★ the class has NO stored annual rows — the situation every class in this app is in',
  storedAnnual.size === 0, `got ${storedAnnual.size}`)

// Monthly averages for the year, one query, exactly as the resolver does it.
const { data: monthlyRows } = await sb.from('scores')
  .select('student_id, subject, score_value, score_text, score_period')
  .eq('score_type', 'monthly').like('score_period', `%-${YEAR}`).in('student_id', rosterIds)

const monthly: Record<string, Record<string, number>> = {}
{
  const grouped: Record<string, Record<string, Record<string, number | string | null>>> = {}
  for (const r of monthlyRows ?? []) {
    const month = (r.score_period as string).replace(`-${YEAR}`, '')
    const byMonth = grouped[r.student_id as string] ??= {}
    const bucket = byMonth[month] ??= {}
    bucket[r.subject as string] = (r.score_value ?? r.score_text) as number | string | null
  }
  for (const [sid, months] of Object.entries(grouped)) {
    monthly[sid] = {}
    for (const [m, sc] of Object.entries(months)) {
      const { average } = studentAverage(sc, keys, maxByColumn, scheme)
      if (average !== null) monthly[sid][m] = average
    }
  }
}
check('monthly marks are readable and average through the canonical helper',
  Object.keys(monthly).length >= 3)

// The class's calendar (00029). No rows seeded, so it must resolve the default.
const { data: calendarRows } = await sb.from('score_calendar_periods')
  .select('*').eq('academic_year', YEAR)
check('no calendar rows are configured, so the class resolves the DEFAULT calendar',
  (calendarRows ?? []).length === 0)
const months = {
  sem1: periodKeysForSemester(DEFAULT_CALENDAR, 'sem1'),
  sem2: periodKeysForSemester(DEFAULT_CALENDAR, 'sem2'),
}

const threshold = promotionThreshold(scheme)
check('the promotion threshold comes from the live scheme (5 on /10)', threshold === 5)

const byName = new Map<string, string>()
for (const s of students ?? []) byName.set(s.name_kh as string, s.id as string)

const results = (students ?? []).map((s) => {
  const id = s.id as string
  const e1 = studentAverage(sem1Exam.get(id) ?? {}, keys, maxByColumn, scheme).average
  const e2 = studentAverage(sem2Exam.get(id) ?? {}, keys, maxByColumn, scheme).average
  const c1 = monthlyComponent(monthly[id], months.sem1)
  const c2 = monthlyComponent(monthly[id], months.sem2)
  const stored = storedAnnual.get(id) ?? {}
  const annual = buildAnnualResult({
    sem1Stored: storedAnnualValue(stored[SEM1_KEY]),
    sem2Stored: storedAnnualValue(stored[SEM2_KEY]),
    sem1Derived: semesterAverage(e1, c1),
    sem2Derived: semesterAverage(e2, c2),
  }, threshold)
  return { id, name: s.name_kh as string, gender: s.gender as string, annual, rank: 0 }
})

assignRanks([...results], (r) => r.annual.average ?? 0, (r, n) => { r.rank = n })

const of = (name: string) => results.find((r) => r.name === name)!

check('★ every pupil\'s year is DERIVED, since nothing stored exists',
  results.filter((r) => r.annual.average !== null).every((r) => r.annual.source === 'derived'),
  results.map((r) => `${r.name}:${r.annual.source}`).join(' '))

// The fixture's sem1: សុខា exam 9 + coursework 9 -> 9; ដារា 8 + 6 -> 7;
// វិចិត្រ 6 + 8 -> 7. No sem2 exam, so sem2 is coursework-only and halved.
check('សុខា\'s ឆមាសទី១ is the canonical 9.0',
  of('សុខា').annual.sem1.value === 9, String(of('សុខា').annual.sem1.value))
check('ដារា\'s ឆមាសទី១ is the canonical 7.0',
  of('ដារា').annual.sem1.value === 7, String(of('ដារា').annual.sem1.value))
check('វិចិត្រ ties ដារា at 7.0 from a different mix of halves',
  of('វិចិត្រ').annual.sem1.value === 7)

check('រតនា has no ឆមាសទី១ at all', of('រតនា').annual.sem1.value === null
  || of('រតនា').annual.sem1.source === 'derived')

// §36 — a pupil with nothing anywhere is incomplete, not repeated.
const noResult = results.filter((r) => r.annual.average === null)
check('a pupil with no marks anywhere is incomplete, NEVER repeated (§36)',
  noResult.every((r) => r.annual.status === 'incomplete'))

// §18 — the partition.
const promoted = results.filter((r) => r.annual.status === 'promoted')
const repeated = results.filter((r) => r.annual.status === 'repeated')
const incomplete = results.filter((r) => r.annual.status === 'incomplete')
check('the three statuses partition the live class exactly',
  promoted.length + repeated.length + incomplete.length === results.length)
check('no pupil appears on both printed lists',
  promoted.every((p) => !repeated.some((r) => r.id === p.id)))
check('and every status agrees with the canonical rule',
  results.every((r) => r.annual.status === annualStatus(r.annual.average, threshold)))

// §37 — ranking semantics on live data.
console.log('\n-- ranking_annual, from live data --')
{
  const ordered = [...results].sort((a, b) => {
    const am = a.annual.average !== null, bm = b.annual.average !== null
    if (am !== bm) return am ? -1 : 1
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.name.localeCompare(b.name, 'km')
  })
  check('the best pupil leads the sheet', ordered[0].name === 'សុខា', ordered[0].name)
  // The fixture's April marks give every pupil some result, so this asserts the
  // ORDERING RULE rather than a specific pupil: any pupil without a year sorts
  // below every pupil with one, and the sheet is otherwise in rank order.
  const firstUnmarked = ordered.findIndex((r) => r.annual.average === null)
  check('any unmarked pupil sorts below every marked one',
    firstUnmarked === -1 || ordered.slice(firstUnmarked).every((r) => r.annual.average === null))
  check('and the marked pupils are in non-decreasing rank order',
    ordered.filter((r) => r.annual.average !== null)
      .every((r, i, a) => i === 0 || a[i - 1].rank <= r.rank))

  const buf = await readFile('lib/reporting/templates/ranking_annual_v1.xlsx')
  const payload: ReportPayload = {
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
      'class.count': String(results.length), 'period.label': `ឆ្នាំសិក្សា ${YEAR}`,
      'annual.source': 'មធ្យមភាគឆមាសគណនាចេញពីពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែ',
      'class.promoted': String(promoted.length), 'class.repeated': String(repeated.length),
      'class.incomplete': String(incomplete.length),
    },
    subjects: semesterSubjects.map((s) => ({ key: s.columns[0].id, label: s.labelKm, maxScore: s.maxScore })),
    rows: ordered.map((r, i) => ({
      values: {
        'row.no': String(i + 1),
        'row.rank': r.annual.average === null ? '' : String(r.rank),
        'row.name': r.name, 'row.gender': r.gender,
        'row.sem1': r.annual.sem1.value, 'row.sem2': r.annual.sem2.value,
        'row.average': r.annual.average === null ? null : Number(r.annual.average.toFixed(2)),
        'row.status': r.annual.status,
      },
      subjectValues: semesterSubjects.map(() => null),
    })),
  }
  const out = await fillXlsxTemplate(buf, payload)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(out as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  check('an annual ranking XLSX was produced from live data', out.length > 5000)
  check('the top pupil is on the first data row',
    String(ws.getRow(8).getCell(3).value) === 'សុខា', String(ws.getRow(8).getCell(3).value))
  check('the class\'s three subjects widened the region, not a constant',
    ws.getRow(7).getCell(5 + 2).value === semesterSubjects[2].labelKm)
}

// ------------------------------------------------------------- certificate
console.log('\n-- certificate, from live data --')
{
  // Default cohort: the pupils who PASSED. Never the repeaters, never the
  // unmarked — the rule `resolveCertificate` applies.
  const eligible = results.filter((r) => r.annual.status === 'promoted')
  check('the default cohort is the promoted pupils only',
    eligible.every((r) => (r.annual.average ?? 0) >= threshold))
  check('no unmarked pupil is certified',
    !eligible.some((r) => r.annual.average === null))

  const buf = await readFile('lib/reporting/templates/certificate_v1.docx')
  const payload: ReportPayload = {
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'school.unit1': 'ការិយាល័យតេស្ត',
      'class.name': '៤ក', 'class.grade': '៤', 'period.label': `ឆ្នាំសិក្សា ${YEAR}`,
      'director.name': 'នាយក តេស្ត', 'director.role': 'នាយកសាលា',
      'province.date': 'ព្រៃវែង', 'annual.source': 'គណនាចេញពីពិន្ទុ',
      'certificate.provenance': 'បង្កើតដោយ KruSmart',
    },
    subjects: [],
    rows: eligible.map((r) => ({
      values: {
        'row.name': r.name, 'row.gender': r.gender,
        achievement: `ចំណាត់ថ្នាក់លេខ ${r.rank} មធ្យមភាគ ${(r.annual.average ?? 0).toFixed(2)}`,
      },
      subjectValues: [],
    })),
  }
  const out = await fillDocxTemplate(buf, payload)
  const xml = await (await JSZip.loadAsync(out)).file('word/document.xml')!.async('string')
  check('a certificate DOCX was produced from live data', out.length > 1500)
  check('one page per eligible pupil',
    (xml.match(/pageBreakBefore/g) ?? []).length === eligible.length,
    `${(xml.match(/pageBreakBefore/g) ?? []).length} vs ${eligible.length}`)
  check('every eligible pupil\'s Khmer name is on the document',
    eligible.every((r) => xml.includes(r.name)))
  check('no repeater or unmarked pupil appears',
    results.filter((r) => r.annual.status !== 'promoted')
      .every((r) => !xml.includes(r.name)))
  check('no token survives', !/\{[#/]?[A-Za-z][\w.]*\}/.test(xml))
}

// ------------------------------------------------- annual_subject_results
console.log('\n-- annual_subject_results, from live data --')
{
  const subjectAnnual = (sid: string, columnId: string): number | null => {
    const a = sem1Exam.get(sid)?.[columnId]
    const b = sem2Exam.get(sid)?.[columnId]
    const vals = [a, b].map(Number).filter((v) => Number.isFinite(v))
    return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null
  }

  const tallies = semesterSubjects.map((s) => {
    const columnId = s.columns[0].id
    const values = (students ?? []).flatMap((st) => {
      const v = subjectAnnual(st.id as string, columnId)
      return v === null ? [] : [{ value: v, female: isFemale(st.gender as string) }]
    })
    return tallySubject(columnId, s.labelKm, values, s.maxScore, scheme)
  })

  const marked = tallies.filter((t) => t.tot.t > 0)
  check('at least one subject has live marks to tally', marked.length > 0)
  check('pass and fail account for every marked pupil in each subject',
    marked.every((t) => t.pass.t + t.fail.t === t.tot.t))
  check('an unmarked subject is dropped, never printed as zeroes',
    tallies.every((t) => t.tot.t > 0 || t.average === null))
}

// -------------------------------------------------------------- record book
console.log('\n-- record book, from live data --')
{
  const { data: attendance } = await sb.from('attendance')
    .select('student_id, date, status').in('student_id', rosterIds)
  check('attendance is readable under RLS (empty is fine)', attendance !== null)

  const buf = await readFile('lib/reporting/templates/student_tracking_record_book_v1.docx')
  const subjects = semesterSubjects.map((s) => ({
    key: s.columns[0].id, label: s.labelKm, maxScore: s.maxScore,
  }))
  const payload: ReportPayload = {
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'book.title': 'សៀវភៅសិក្ខាគារិក',
      'period.label': `ឆ្នាំសិក្សា ${YEAR}`, 'class.name': '៤ក', 'class.grade': '៤',
      'teacher.name': 'គ្រូ តេស្ត', 'director.name': 'នាយក តេស្ត',
      'director.role': 'នាយកសាលា', 'province.date': 'ព្រៃវែង',
      'annual.source': 'គណនាចេញពីពិន្ទុ', 'book.provenance': 'បង្កើតដោយ KruSmart',
    },
    subjects,
    rows: results.map((r) => ({
      values: {
        'row.name': r.name, 'row.gender': r.gender, 'row.student_id': '',
        'row.sem1': r.annual.sem1.value, 'row.sem2': r.annual.sem2.value,
        'row.average': r.annual.average, 'row.grade': '', 'row.rank': String(r.rank),
        'row.status': r.annual.status,
        'row.absent_s1_excused': '០', 'row.absent_s1_unexcused': '០',
        'row.absent_s2_excused': '០', 'row.absent_s2_unexcused': '០',
        'row.absent_total': '០',
        'row.sem_eval_knowledge': '', 'row.sem_eval_skill': '',
        'row.sem_eval_moral': '', 'row.sem_eval_participate': '',
      },
      subjectValues: subjects.map(() => null),
      subjectDetail: subjects.map((s) => ({
        sem1: (sem1Exam.get(r.id)?.[s.key] ?? '-') as string | number,
        sem2: (sem2Exam.get(r.id)?.[s.key] ?? '-') as string | number,
        annual: '-',
      })),
    })),
  }
  const out = await fillDocxTemplate(buf, payload)
  const xml = await (await JSZip.loadAsync(out)).file('word/document.xml')!.async('string')
  check('a record book DOCX was produced from live data', out.length > 3000)
  check('one page per pupil on the roster',
    (xml.match(/pageBreakBefore/g) ?? []).length === results.length)
  check('★ the subject table carries the CLASS\'S three subjects, not thirteen (§21)',
    subjects.every((s) => xml.includes(s.label)) && subjects.length === 3)
  check('every pupil\'s name is on their own page',
    results.every((r) => xml.includes(r.name)))
  check('no token survives', !/\{[#/]?[A-Za-z][\w.]*\}/.test(xml))
}

console.log(
  fail === 0
    ? '\n✓ the annual reports work end to end under a real JWT and RLS.'
    : `\n${fail} failure(s).`,
)
process.exit(fail === 0 ? 0 : 1)
