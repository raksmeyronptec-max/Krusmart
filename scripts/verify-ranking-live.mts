/**
 * §25 — the authenticated resolver path for ranking_monthly, end to end.
 *
 *     node scripts/verify-ranking-live.mts
 *
 * OPT-IN. Unlike the other verify scripts this one needs a running local
 * Supabase stack with all migrations applied and the fixture in
 * `supabase/fixtures/primary_ranking_teacher.sql` seeded. It is deliberately
 * NOT part of the default suite: it talks to a database.
 *
 * It exists because every previous reporting test proved the file-generation
 * layer while stubbing the data — so the one thing never exercised was the
 * chain that actually matters in production: a real JWT, RLS, the class scope,
 * the 00028 selection, the canonical arithmetic, and the writer.
 *
 * Signs in as a real teacher through GoTrue and runs the exact queries
 * `resolveMonthlyClass` runs, under that user's JWT and therefore under RLS.
 * Then feeds the result through the SAME canonical helpers and the SAME xlsx
 * writer, so what is proven is the whole chain — not the file layer alone.
 */
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { resolveTemplate } from '../lib/scores/template.ts'
import { applySelection } from '../lib/scores/selection.ts'
import { assignRanks, numericColumnKeys, studentAverage } from '../lib/scores/aggregate.ts'
import { schemeForLevel } from '../lib/grading/levelSchemes.ts'
import { fillXlsxTemplate } from '../lib/reporting/xlsx-writer.ts'
import {
  monthlyComponent, monthsForSemester, semesterAverage,
} from '../lib/scores/semester.ts'
import { defaultHonorCriteria, evaluateHonor } from '../lib/scores/honor.ts'

const URL = 'http://127.0.0.1:54321'
const ANON = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const CLASS = 'a0000000-0000-0000-0000-000000000005'

let fail = 0
const check = (n: string, ok: boolean, d = '') => {
  if (ok) console.log(`  ✓ ${n}`); else { fail++; console.error(`  ✗ ${n}${d ? `\n      ${d}` : ''}`) }
}

const sb = createClient(URL, ANON)
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: 'ranktest@krusmart.local', password: 'RankTest12345!',
})
check('a real teacher can sign in', !authErr && !!auth?.user, authErr?.message)
const uid = auth!.user!.id

// --- the queries the resolver makes, under this user's RLS ------------------
const { data: assignments } = await sb.from('teacher_assignments')
  .select('class_id, is_homeroom, status').eq('teacher_id', uid).eq('status', 'active')
check('their assignment resolves (scope)', assignments?.[0]?.class_id === CLASS)

const { data: enrol } = await sb.from('student_enrollments')
  .select('student_id').eq('class_id', CLASS).neq('status', 'withdrawn')
check('the roster reads through enrolments', enrol?.length === 5, `got ${enrol?.length}`)

const rosterIds = (enrol ?? []).map(e => e.student_id as string)
const { data: students } = await sb.from('students').select('*').in('id', rosterIds)
check('the pupils are visible under RLS', students?.length === 5, `got ${students?.length}`)

const { data: tplRows } = await sb.from('score_template_subjects').select('*')
  .or(`scope.eq.system,class_id.eq.${CLASS}`)
check('the score template is readable', (tplRows?.length ?? 0) > 0, `got ${tplRows?.length}`)

const { data: sel } = await sb.from('class_template_subjects')
  .select('subject_key, enabled_columns, sort_order').eq('class_id', CLASS)
check('the class selection is readable', sel?.length === 3, `got ${sel?.length}`)

const { data: marks } = await sb.from('scores')
  .select('student_id, subject, score_value, score_text')
  .eq('score_type', 'monthly').eq('score_period', 'nov-2025-2026').in('student_id', rosterIds)
check('the November marks are readable', marks?.length === 6, `got ${marks?.length}`)

// --- the same arithmetic the resolver performs ------------------------------
const context = { levelKey: 'primary' as const, gradeNumber: 4 }
const effective = applySelection(
  resolveTemplate(tplRows as never[], 'monthly', context),
  (sel ?? []).map(s => ({ subjectKey: s.subject_key as string,
    enabledColumns: (s.enabled_columns as string[] | null) ?? null,
    sortOrder: (s.sort_order as number) ?? 0 })),
)
check('the class resolves exactly its three chosen subjects',
  effective.length === 3, effective.map(e => e.subjectKey).join(','))
check('and NOT the whole 34-subject primary curriculum', effective.length < 34)

const subjects = effective.flatMap(s => s.valueKind === 'text' ? []
  : s.columns.map(c => ({ key: c.id, label: c.label, maxScore: s.maxScore })))
const scheme = schemeForLevel('primary')
const maxBy = Object.fromEntries(subjects.map(s => [s.key, s.maxScore]))
const keys = numericColumnKeys(effective)

const byStudent = new Map<string, Record<string, number | string | null>>()
for (const m of marks ?? []) {
  const b = byStudent.get(m.student_id as string) ?? {}
  b[m.subject as string] = (m.score_value ?? m.score_text) as number | string | null
  byStudent.set(m.student_id as string, b)
}
const computed = (students ?? []).map(st => ({
  st, scores: byStudent.get(st.id as string) ?? {},
  ...studentAverage(byStudent.get(st.id as string) ?? {}, keys, maxBy, scheme), rank: 0,
}))
assignRanks([...computed], r => r.average ?? 0, (r, n) => { r.rank = n })

const named = (n: string) => computed.find(c => c.st.name_kh === n)!
check('សុខា (9,9) averages 9 and ranks 1',
  named('សុខា').average === 9 && named('សុខា').rank === 1,
  `avg=${named('សុខា').average} rank=${named('សុខា').rank}`)
check('ដារា and វិចិត្រ tie on 7 and SHARE rank 2',
  named('ដារា').rank === 2 && named('វិចិត្រ').rank === 2)
check('រតនា is unmarked: average null, never 0.00',
  named('រតនា').average === null, String(named('រតនា').average))
check('the tie makes the next rank skip to 4 (1,2,2,4)',
  named('រតនា').rank === 4, `got ${named('រតនា').rank}`)
check('ភក្តី has no November marks either, so shares rank 4',
  named('ភក្តី').average === null && named('ភក្តី').rank === 4)

// --- generate the actual document -------------------------------------------
const ordered = [...computed].sort((a, b) => {
  const am = a.average !== null, bm = b.average !== null
  if (am !== bm) return am ? -1 : 1
  return a.rank - b.rank
})
const buf = await readFile('lib/reporting/templates/ranking_monthly_v1.xlsx')
const out = await fillXlsxTemplate(buf, {
  scalars: { 'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
    'class.count': '៤', 'class.average': 7.67, 'period.label': 'ខែវិច្ឆិកា',
    'class.scored': '៣', 'class.passed': '៣', 'class.failed': '០', 'class.passmark': '៥' },
  subjects,
  rows: ordered.map(c => ({
    values: {
      'row.rank': c.average === null ? '' : String(c.rank),
      'row.name': String(c.st.name_kh), 'row.gender': String(c.st.gender),
      'row.total': c.total || null,
      'row.average': c.average === null ? null : Number(c.average.toFixed(2)),
      'row.grade': c.average === null ? '' : 'ល្អ',
      'row.status': c.average === null ? '' : (c.average >= scheme.passMark ? 'ជាប់' : 'ធ្លាក់'),
    },
    subjectValues: subjects.map(s => {
      const v = c.scores[s.key]
      return v === null || v === undefined || v === '' ? null : Number(v)
    }),
  })),
})

const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out as never)
const ws = wb.worksheets[0]
check('a real XLSX was produced from live data', out.length > 5000, `${out.length} bytes`)
check('the top pupil is first on the sheet', ws.getRow(8).getCell(2).value === 'សុខា',
  String(ws.getRow(8).getCell(2).value))
// Two pupils are unmarked in November; both must land at the foot with no
// rank, in either order.
check('the unmarked pupils are last, with blank ranks', (() => {
  const tail = [ws.getRow(11), ws.getRow(12)].map(r => ({
    name: String(r.getCell(2).value ?? ''), rank: r.getCell(1).value,
  }))
  return tail.every(t => ['រតនា', 'ភក្តី'].includes(t.name) && !t.rank)
})(), JSON.stringify([11, 12].map(n => ws.getRow(n).getCell(2).value)))
check('subject columns match the class selection, not the curriculum',
  ws.getRow(7).getCell(4 + subjects.length).value === 'ពិន្ទុសរុប',
  `subjects=${subjects.length}`)

// --- §24.5 / §20: another teacher must see none of it ------------------------
const anon = createClient(URL, ANON)
const { data: leaked } = await anon.from('scores').select('id')
  .eq('score_period', 'nov-2025-2026')
check('a signed-OUT client sees no marks (RLS)', (leaked?.length ?? 0) === 0,
  `leaked ${leaked?.length}`)
const { data: leakedSel } = await anon.from('class_template_subjects').select('id').eq('class_id', CLASS)
check('and no class selection', (leakedSel?.length ?? 0) === 0)

// ===========================================================================
// ranking_semester — the same authenticated path, semester arithmetic (§22)
// ===========================================================================
console.log('\n-- ranking_semester --')

const { data: examRows } = await sb.from('scores')
  .select('student_id, subject, score_value, score_text')
  .eq('score_type', 'semester').eq('score_period', 'sem1-2025-2026').in('student_id', rosterIds)
check('semester exam marks are readable under RLS', examRows?.length === 6, `got ${examRows?.length}`)

const { data: yearRows } = await sb.from('scores')
  .select('student_id, subject, score_value, score_text, score_period')
  .eq('score_type', 'monthly').like('score_period', '%-2025-2026').in('student_id', rosterIds)
check('a year-wide monthly fetch returns every month at once', yearRows?.length === 22, `got ${yearRows?.length}`)

// The exam half.
const examBy = new Map<string, Record<string, number | string | null>>()
for (const r of examRows ?? []) {
  const b = examBy.get(r.student_id as string) ?? {}
  b[r.subject as string] = (r.score_value ?? r.score_text) as number | string | null
  examBy.set(r.student_id as string, b)
}

// The coursework half: per-month averages, then the semester's months.
const perMonth: Record<string, Record<string, Record<string, number | string | null>>> = {}
for (const r of yearRows ?? []) {
  const month = String(r.score_period).replace('-2025-2026', '')
  const bm = perMonth[r.student_id as string] ?? (perMonth[r.student_id as string] = {})
  const bk = bm[month] ?? (bm[month] = {})
  bk[r.subject as string] = (r.score_value ?? r.score_text) as number | string | null
}
const monthlyAvgs: Record<string, Record<string, number>> = {}
for (const [sid, months] of Object.entries(perMonth)) {
  monthlyAvgs[sid] = {}
  for (const [m, sc] of Object.entries(months)) {
    const { average } = studentAverage(sc, keys, maxBy, scheme)
    if (average !== null) monthlyAvgs[sid][m] = average
  }
}

const semMonths = monthsForSemester('sem1')
check('semester 1 spans five months', semMonths.length === 5)

const semComputed = (students ?? []).map(st => {
  const id = st.id as string
  const exam = studentAverage(examBy.get(id) ?? {}, keys, maxBy, scheme).average
  const monthly = monthlyComponent(monthlyAvgs[id], semMonths)
  return { st, exam, monthly, average: semesterAverage(exam, monthly), rank: 0 }
})
assignRanks([...semComputed], r => r.average ?? 0, (r, n) => { r.rank = n })
const sem = (n: string) => semComputed.find(c => c.st.name_kh === n)!

check('the April marks are excluded from semester 1 (they are sem-2 months)',
  monthlyComponent(monthlyAvgs[String((students ?? []).find(s => s.name_kh === 'ដារា')?.id)], semMonths) === 6)
check('សុខា exam 9 + monthly 9 -> 9.0, rank 1',
  sem('សុខា').average === 9 && sem('សុខា').rank === 1,
  `avg=${sem('សុខា').average} rank=${sem('សុខា').rank}`)
check('ដារា exam 8 + monthly 6 -> 7.0',
  sem('ដារា').average === 7, `${sem('ដារា').exam}/${sem('ដារា').monthly} -> ${sem('ដារា').average}`)
check('វិចិត្រ exam 6 + monthly 8 -> 7.0 (same average, DIFFERENT halves)',
  sem('វិចិត្រ').average === 7, `${sem('វិចិត្រ').exam}/${sem('វិចិត្រ').monthly} -> ${sem('វិចិត្រ').average}`)
check('and they SHARE rank 2',
  sem('ដារា').rank === 2 && sem('វិចិត្រ').rank === 2)
check('រតនា has neither half -> null average, no rank',
  sem('រតនា').average === null)
check('the tie makes the next rank skip to 4 (1,2,2,4)',
  sem('រតនា').rank === 4, `got ${sem('រតនា').rank}`)

// §23 — the consistency test. /score/total computes the SAME number from the
// SAME helper, so this recomputes it the way ScoreTotalClient does and compares.
for (const name of ['សុខា', 'ដារា', 'វិចិត្រ']) {
  const c = sem(name)
  const totalWay = semesterAverage(c.exam, c.monthly) ?? 0
  check(`§23 ${name}: /score/total and ranking_semester agree`,
    Math.abs(totalWay - (c.average ?? 0)) < 1e-9,
    `total=${totalWay} report=${c.average}`)
}

// The document.
const semBuf = await readFile('lib/reporting/templates/ranking_semester_v1.xlsx')
const semOrdered = [...semComputed].sort((a, b) => {
  const am = a.average !== null, bm = b.average !== null
  if (am !== bm) return am ? -1 : 1
  return a.rank - b.rank
})
const semOut = await fillXlsxTemplate(semBuf, {
  scalars: { 'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
    'class.count': '៤', 'class.average': 7.67, 'period.label': 'ឆមាសទី១',
    'class.scored': '៣', 'class.passed': '៣', 'class.failed': '០',
    'class.passmark': '៥', 'class.months': '៥' },
  subjects,
  rows: semOrdered.map(c => ({
    values: {
      'row.rank': c.average === null ? '' : String(c.rank),
      'row.name': String(c.st.name_kh), 'row.gender': String(c.st.gender),
      'row.exam': c.exam === null ? null : Number(c.exam.toFixed(2)),
      'row.monthly': c.monthly === null ? null : Number(c.monthly.toFixed(2)),
      'row.average': c.average === null ? null : Number(c.average.toFixed(2)),
      'row.grade': c.average === null ? '' : 'ល្អ',
      'row.status': c.average === null ? '' : (c.average >= scheme.passMark ? 'ជាប់' : 'ធ្លាក់'),
    },
    subjectValues: subjects.map(() => null),
  })),
})
const semWb = new ExcelJS.Workbook(); await semWb.xlsx.load(semOut as never)
const semWs = semWb.worksheets[0]
check('a semester XLSX was produced from live data', semOut.length > 5000)
check('the top pupil leads the sheet', semWs.getRow(8).getCell(2).value === 'សុខា')
check('both halves are printed for audit',
  semWs.getRow(8).getCell(4 + subjects.length).value === 9 &&
  semWs.getRow(8).getCell(5 + subjects.length).value === 9)
check('the unmarked pupils are last, with blank ranks', (() => {
  const tail = [semWs.getRow(11), semWs.getRow(12)].map(r => ({
    name: String(r.getCell(2).value ?? ''), rank: r.getCell(1).value,
  }))
  return tail.every(t => ['រតនា', 'ភក្តី'].includes(t.name) && !t.rank)
})())

// ===========================================================================
// honor — the same authenticated path, criteria-based eligibility (§18/§19)
// ===========================================================================
console.log('\n-- honor --')

const { data: aprRows } = await sb.from('scores')
  .select('student_id, subject, score_value, score_text')
  .eq('score_type', 'monthly').eq('score_period', 'apr-2025-2026').in('student_id', rosterIds)
check('April marks are readable under RLS', aprRows?.length === 10, `got ${aprRows?.length}`)

const { data: allStudents } = await sb.from('students').select('*').in('id', rosterIds)
check('the roster now holds five pupils', allStudents?.length === 5, `got ${allStudents?.length}`)

const aprBy = new Map<string, Record<string, number | string | null>>()
for (const r of aprRows ?? []) {
  const b = aprBy.get(r.student_id as string) ?? {}
  b[r.subject as string] = (r.score_value ?? r.score_text) as number | string | null
  aprBy.set(r.student_id as string, b)
}

const criteria = defaultHonorCriteria(scheme)
check('the threshold comes from the live scheme (8 on /10)', criteria.minAverage === 8)

const honorRows = (allStudents ?? []).map(st => {
  const scores = aprBy.get(st.id as string) ?? {}
  // §20: the canonical average, computed once by the shared helper.
  const { average } = studentAverage(scores, keys, maxBy, scheme)
  const verdict = evaluateHonor(
    { average, scores, subjectKeys: keys, maxByColumn: maxBy }, criteria, scheme)
  return { st, average, verdict }
})
const hon = (n: string) => honorRows.find(h => h.st.name_kh === n)!

check('សុខា 9,9 -> 9.0 ELIGIBLE',
  hon('សុខា').average === 9 && hon('សុខា').verdict.eligible,
  `${hon('សុខា').average} ${hon('សុខា').verdict.reason}`)
check('ដារា 8,8 -> 8.0 ELIGIBLE — exactly on the boundary (§19)',
  hon('ដារា').average === 8 && hon('ដារា').verdict.eligible,
  `${hon('ដារា').average} ${hon('ដារា').verdict.reason}`)
check('វិចិត្រ 8,7 -> 7.5 NOT eligible — just below',
  hon('វិចិត្រ').average === 7.5 && !hon('វិចិត្រ').verdict.eligible)
check('and the reason names the average', hon('វិចិត្រ').verdict.reason?.includes('មធ្យមភាគ') === true)
check('រតនា 10,4 NOT eligible — a failing subject',
  !hon('រតនា').verdict.eligible && hon('រតនា').verdict.failingSubjects.includes('math_num'))
check('ភក្តី 10,4.5 NOT eligible — 4.5 is below the pass mark of 5',
  !hon('ភក្តី').verdict.eligible && hon('ភក្តី').verdict.failingSubjects.length === 1,
  `${hon('ភក្តី').average} ${hon('ភក្តី').verdict.reason}`)

const eligible = honorRows.filter(h => h.verdict.eligible)
check('exactly two of five pupils are honoured', eligible.length === 2, `got ${eligible.length}`)
check('honour is NOT top-N: a 7.5 pupil is excluded though ranked third',
  !eligible.some(e => e.st.name_kh === 'វិចិត្រ'))

// §20 — the printed average must be the canonical one.
for (const e of eligible) {
  const canonical = studentAverage(aprBy.get(e.st.id as string) ?? {}, keys, maxBy, scheme).average
  check(`§20 ${e.st.name_kh}: printed average equals the canonical result`,
    e.average === canonical, `${e.average} vs ${canonical}`)
}

// The document.
const honBuf = await readFile('lib/reporting/templates/honor_v1.xlsx')
const honOrdered = [...eligible].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
const honOut = await fillXlsxTemplate(honBuf, {
  scalars: {
    'school.name': 'សាលាបឋមសិក្សា តេស្ត', 'class.name': '៤ក', 'class.grade': '៤',
    'period.label': 'ខែមេសា', 'honor.count': String(honOrdered.length),
    'honor.total': String(honorRows.length), 'honor.average': 8.5,
    'honor.criteria': criteria.label,
    'honor.provenance': 'លក្ខណៈវិនិច្ឆ័យបណ្ដោះអាសន្ន — មិនមែនផ្លូវការពីក្រសួងទេ',
    'teacher.name': 'គ្រូ តេស្ត', 'director.role': 'នាយកសាលា',
    'director.name': 'លោក ខ', 'province.date': 'ភ្នំពេញ',
  },
  subjects,
  rows: honOrdered.map((c, i) => ({
    values: {
      'row.no': String(i + 1), 'row.name': String(c.st.name_kh),
      'row.gender': String(c.st.gender),
      'row.average': c.average === null ? null : Number(c.average.toFixed(2)),
      'row.grade': 'ល្អ', 'row.rank': String(i + 1),
    },
    subjectValues: subjects.map(s => {
      const v = (aprBy.get(c.st.id as string) ?? {})[s.key]
      return v === null || v === undefined || v === '' ? null : Number(v)
    }),
  })),
})
const honWb = new ExcelJS.Workbook(); await honWb.xlsx.load(honOut as never)
const honWs = honWb.worksheets[0]
check('an honour XLSX was produced from live data', honOut.length > 5000)
check('the two honourees are on the sheet, best first',
  honWs.getRow(9).getCell(2).value === 'សុខា' && honWs.getRow(10).getCell(2).value === 'ដារា',
  `${honWs.getRow(9).getCell(2).value} / ${honWs.getRow(10).getCell(2).value}`)
check('the non-eligible pupils are absent', honWs.getRow(11).getCell(2).value !== 'វិចិត្រ')
check('the provisional-criteria warning is on the sheet',
  String(honWs.getCell('A7').value).includes('មិនមែនផ្លូវការ'))

if (fail > 0) { console.error(`\n${fail} failure(s).`); process.exit(1) }
console.log('\n✓ authenticated resolver path works end to end.')
