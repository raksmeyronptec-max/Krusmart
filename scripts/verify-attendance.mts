/**
 * One register, one vocabulary.
 *
 *     node scripts/verify-attendance.mts
 *
 * ── What this exists to stop ──────────────────────────────────────────────
 *
 * `attendance.status` is free TEXT with four values in play and nothing
 * declaring what they mean, so eleven surfaces each decided for themselves:
 *
 *   · the entry screen's own button says ច្បាប់ for `L` — absent WITH
 *     permission — and `/students/[id]`, the monthly register, the yearly
 *     sheet, the printed parent report and the reporting engine all agree.
 *     **The parent portal read it as "late" and counted it as attending**, so
 *     the printed report handed to a parent and the portal that parent signs
 *     into stated different attendance rates for the same pupil.
 *   · `AP` is declared by the type, written by nobody, counted as an absence
 *     by five readers and dropped silently by five others.
 *
 * `lib/attendance/status.ts` is the declaration those eleven surfaces were
 * missing, and this file is the half that fails the build. It runs the module
 * (it is pure and node-loadable) rather than asserting on its source, then
 * checks that no surface has grown a private copy of the rule.
 *
 * ── The rules ─────────────────────────────────────────────────────────────
 *
 *   A1  the vocabulary is complete, and `inClass` is true for exactly one mark
 *   A2  the tally is the arithmetic, and it agrees with itself
 *   A3  an unrecognised status is counted as unknown, never as something else
 *   A4  a teacher is offered three marks, not four
 *   A5  no surface re-derives the rule with its own status comparisons
 *   A6  the entry screen's labels come from the module
 *
 * Exits non-zero on any failure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'
import {
  ATTENDANCE_MARKS,
  ENTRY_MARKS,
  isAbsence,
  isEnterableStatus,
  markFor,
  tallyAttendance,
} from '../lib/attendance/status.ts'
import {
  ROSTER_FILTERS,
  filterCounts,
  nextMarkInCycle,
  registerSummary,
  searchRoster,
  visibleRoster,
  periodSummary,
} from '../lib/attendance/register.ts'
import { ATTENDANCE_VIEWS, otherAttendanceViews } from '../lib/attendance/views.ts'

const root = fileURLToPath(new URL('../', import.meta.url))

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const code = (s: string) =>
  s
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

// ---------------------------------------------------------------------------
// A1 · the vocabulary
// ---------------------------------------------------------------------------
console.log('\nA1 · the vocabulary')

check('four marks are declared', ATTENDANCE_MARKS.length === 4,
  ATTENDANCE_MARKS.map((m) => m.code).join(', '))

check(
  'exactly one of them is being in class',
  ATTENDANCE_MARKS.filter((m) => m.inClass).length === 1,
  'a rate divides by "was the pupil here"; two answers to that is the bug',
)

check(
  'and it is P',
  markFor('P')?.inClass === true && markFor('L')?.inClass === false,
)

check(
  'ច្បាប់ is an ABSENCE, not attendance',
  markFor('L')?.inClass === false && markFor('L')?.excused === true,
  'permission excuses an absence; it does not undo it',
)

check(
  'AP means what L means',
  markFor('AP')?.inClass === markFor('L')?.inClass &&
    markFor('AP')?.excused === markFor('L')?.excused,
  'the five readers that dropped AP were dropping an absence',
)

check('every mark carries a Khmer label and a register character',
  ATTENDANCE_MARKS.every((m) => m.label.length > 0 && m.short.length > 0))

check('isAbsence agrees with the marks',
  !isAbsence('P') && isAbsence('L') && isAbsence('A') && isAbsence('AP') && !isAbsence('X'))

// ---------------------------------------------------------------------------
// A2 · the arithmetic
// ---------------------------------------------------------------------------
console.log('\nA2 · one tally')

const rows = [
  { status: 'P' }, { status: 'P' }, { status: 'P' }, { status: 'P' },
  { status: 'L' }, { status: 'AP' },
  { status: 'A' }, { status: 'A' },
]
const t = tallyAttendance(rows)

check('present counts only days in class', t.present === 4, String(t.present))
check('excused folds L and AP together', t.excused === 2, String(t.excused))
check('unexcused is A alone', t.unexcused === 2, String(t.unexcused))
check('absent is the sum of both kinds', t.absent === t.excused + t.unexcused)
check('marked is present + absent', t.marked === t.present + t.absent && t.marked === 8)

/*
 * The number the two parent-facing surfaces disagreed about. Four in class out
 * of eight recorded days is 50% — the portal's old formula counted the ច្បាប់
 * day as attending and reported 62.5%.
 */
check('the rate divides days in class by days recorded', t.rate === 50, String(t.rate))
check(
  'and the old portal formula is NOT what it computes',
  t.rate !== Math.round(((t.present + t.excused) / t.marked) * 1000) / 10,
)

check('an empty register has no rate, not a zero one', tallyAttendance([]).rate === null,
  'a class nobody has marked yet has not achieved 0% attendance')

// ---------------------------------------------------------------------------
// A3 · unknown statuses
// ---------------------------------------------------------------------------
console.log('\nA3 · a value we do not know')

const odd = tallyAttendance([{ status: 'P' }, { status: 'ZZ' }, { status: '' }, {}])
check('unrecognised rows are counted separately', odd.unknown === 3, String(odd.unknown))
check('...and stay out of the denominator', odd.marked === 1 && odd.rate === 100)
check('markFor tolerates anything', markFor('ZZ') === null && markFor(null) === null)

// ---------------------------------------------------------------------------
// A4 · what a teacher is offered
// ---------------------------------------------------------------------------
console.log('\nA4 · three marks, not four')

check('AP is not offered for entry', ENTRY_MARKS.every((m) => m.code !== 'AP'))
check('the other three are', ENTRY_MARKS.length === 3,
  ENTRY_MARKS.map((m) => m.code).join(', '))

// ---------------------------------------------------------------------------
// A5 · nobody keeps a private copy
// ---------------------------------------------------------------------------
console.log('\nA5 · one source for the rule')

/*
 * A status comparison written by hand is how the eleven readings happened. The
 * ban is on *deriving meaning* from the code — `status === 'A'` to decide
 * "absent", `=== 'L'` to decide "late". Rendering a mark is different: a screen
 * may still ask which mark it is holding in order to pick a colour or a glyph.
 * So the check is scoped to the files that COUNT, and the module itself and the
 * badge map are the two declared homes.
 */
const COUNTERS = [
  'app/(main)/dashboard/queries.ts',
  'app/(main)/students/[id]/queries.ts',
  'app/(main)/attendance/yearly/YearlyAbsenceClient.tsx',
  'app/(main)/attendance/layout/RosterCheckIn.tsx',
  'app/(main)/score-analyse/ScoreAnalyseClient.tsx',
  'app/(main)/parent-report/ParentReportClient.tsx',
  'app/(main)/record-book/RecordBookClient.tsx',
  'app/parent/queries.ts',
  'lib/reporting/report-data.ts',
]

/*
 * ANY identifier compared against a status literal, not just one spelled
 * `status` (Phase 17 D2).
 *
 * The old pattern was `/status\s*(?:===|!==)…/`, which enforced the rule only
 * where the variable happened to be called `status`. `ThreeClassroom.tsx`
 * counted the whole 3D room with
 *
 *     if (st === 'P') p++; else if (st === 'L') l++; else a++;
 *
 * — folding `AP` and every unrecognised value into "absent" — and passed this
 * scan for years because its variable was named `st`. A rule enforced by a
 * regex that matches one variable name is not enforced.
 *
 * The identifier is CAPTURED so two other domains that share these letters can
 * be told apart from an attendance mark — see `NOT_ATTENDANCE` below.
 */
const HANDWRITTEN = /\b([A-Za-z_$][\w$]*(?:\.[\w$]+|\[[^\]]*\])*)\s*(?:===|!==)\s*['"](?:P|L|A|AP)['"]/g

/**
 * Identifiers that are not a stored attendance status, matched on the LAST
 * path segment so `stu.grade` and `grade` are both caught.
 *
 *   grade / niddesc / letter / band  the A-F letter grade — a different axis
 *                                    that happens to share the letter `A`.
 *   kind                             the return of `absenceKind()`, which has
 *                                    already been through `markFor`. Comparing
 *                                    a value the module produced is reading the
 *                                    rule, not re-deriving it.
 */
const NOT_ATTENDANCE = /(?:^|\.)(?:grade|niddesc|letter|band|kind)\w*$/i

function handwrittenHits(src: string): number {
  let hits = 0
  for (const m of src.matchAll(HANDWRITTEN)) {
    if (!NOT_ATTENDANCE.test(m[1])) hits += 1
  }
  return hits
}

for (const rel of COUNTERS) {
  const src = code(readFileSync(join(root, rel), 'utf8'))
  const hits = handwrittenHits(src)
  check(`${rel} does not re-derive the rule`, hits === 0, `${hits} hand-written comparison(s)`)
}

check(
  'every counting surface imports the module',
  COUNTERS.every((rel) => /attendance\/status/.test(readFileSync(join(root, rel), 'utf8'))),
  COUNTERS.filter((rel) => !/attendance\/status/.test(readFileSync(join(root, rel), 'utf8'))).join(', '),
)

/* The whole tree, so a new screen cannot quietly become the twelfth reading. */
const strays: string[] = []
for (const f of [...walk(join(root, 'app')), ...walk(join(root, 'lib')), ...walk(join(root, 'components'))]) {
  if (!/\.tsx?$/.test(f)) continue
  const rel = relative(root, f)
  if (rel.startsWith('lib/attendance/')) continue
  // The badge map is the declared home for how a mark LOOKS.
  if (rel === 'components/ui/feedback/Badge.tsx') continue
  const src = code(readFileSync(f, 'utf8'))
  // Only files that actually read the attendance table or its rows.
  if (!/attendance|AttendanceRecord/i.test(src)) continue
  const hits = handwrittenHits(src)
  if (hits > 0 && !COUNTERS.includes(rel)) strays.push(`${rel} (${hits})`)
}
check('no other attendance surface compares statuses by hand', strays.length === 0,
  strays.join('\n      '))

// ---------------------------------------------------------------------------
// A6 · the entry screen
// ---------------------------------------------------------------------------
console.log('\nA6 · the register is entered in the declared vocabulary')

const roster = readFileSync(join(root, 'app', '(main)', 'attendance', 'layout', 'RosterCheckIn.tsx'), 'utf8')
check('RosterCheckIn builds its buttons from ENTRY_MARKS',
  /ENTRY_MARKS/.test(roster),
  'the only writer must not name the codes itself')

/*
 * The completion strip lived inside the LIST view, so the seating plan and the
 * 3D room — the two a desk user is most likely to pick — never said how many
 * pupils were still unmarked. It belongs to the screen, not to one of its
 * views, and it has to run the shared arithmetic or "៤ មិនទាន់" and the printed
 * absence columns can describe different days.
 */
const tallyStrip = readFileSync(join(root, 'app', '(main)', 'attendance', 'layout', 'RegisterTally.tsx'), 'utf8')
check('the completion strip runs tallyAttendance', /tallyAttendance/.test(tallyStrip))

const layout = readFileSync(join(root, 'app', '(main)', 'attendance', 'layout', 'AttendanceLayoutClient.tsx'), 'utf8')
check('...and the screen renders it, not one of its views',
  /<RegisterTally/.test(layout) && !/<RegisterTally/.test(roster),
  'all three views must answer "have I finished?"')

// ---------------------------------------------------------------------------
// A7 · the daily register's own derivations
// ---------------------------------------------------------------------------
console.log('\nA7 · the daily flow: everyone here, then the exceptions')

/*
 * `/attendance/layout` filters, searches and counts the roster through
 * `lib/attendance/register.ts` rather than inline, so the list view, the
 * summary strip and the completion panel cannot disagree about what "done"
 * means. Run it, and pin the three properties the daily flow depends on.
 */
const pupils = [
  { id: 's1', name_kh: 'សុខា', name_en: 'Sokha', student_id: 'A001' },
  { id: 's2', name_kh: 'ដារា', name_en: 'Dara', student_id: 'A002' },
  { id: 's3', name_kh: 'វិចិត្រ', name_en: null, student_id: 'B003' },
  { id: 's4', name_kh: 'រតនា', name_en: null, student_id: null },
]
const day = {
  s1: { status: 'P', note: '' },
  s2: { status: 'AP', note: 'ឈឺ' },
  s3: { status: 'ZZ', note: '' },
}

const summary = registerSummary(pupils, day)
check('the summary counts through tallyAttendance', summary.present === 1 && summary.excused === 1 && summary.unexcused === 0)
check('an unknown status is unmarked, not present', summary.unmarked === 2, String(summary.unmarked))
check('...so the register is not complete', summary.complete === false)
check('an empty roster is never "complete"', registerSummary([], {}).complete === false,
  'a class with nobody in it has not taken attendance')
check('everyone marked is complete',
  registerSummary(pupils, { s1: { status: 'P', note: '' }, s2: { status: 'L', note: '' }, s3: { status: 'A', note: '' }, s4: { status: 'P', note: '' } }).complete === true)

check('the filter chips are the entry marks plus all and unmarked',
  ROSTER_FILTERS.map((f) => f.id).join(',') === 'all,P,L,A,unmarked',
  ROSTER_FILTERS.map((f) => f.id).join(','))
check('the L chip shows the legacy spelling too', visibleRoster(pupils, day, 'L').map((s) => s.id).join() === 's2')
check('the unmarked chip shows the unknown status and the missing row',
  visibleRoster(pupils, day, 'unmarked').map((s) => s.id).join() === 's3,s4')
check('the A chip is empty when nobody is absent', visibleRoster(pupils, day, 'A').length === 0)
const counts = filterCounts(pupils, day)
check('chip counts agree with the chips', counts.all === 4 && counts.P === 1 && counts.L === 1 && counts.A === 0 && counts.unmarked === 2)

check('search matches a Khmer name', searchRoster(pupils, 'សុខ').map((s) => s.id).join() === 's1')
check('search matches a code, ignoring case and spaces', searchRoster(pupils, ' a00 ').map((s) => s.id).join() === 's1,s2')
check('search matches a Latin name', searchRoster(pupils, 'dara').map((s) => s.id).join() === 's2')
check('an empty query is the whole roster', searchRoster(pupils, '  ').length === 4)

check('the seat cycle starts an unmarked pupil at present', nextMarkInCycle(undefined) === 'P')
check('...and goes present → ច្បាប់ → absent → present',
  nextMarkInCycle('P') === 'L' && nextMarkInCycle('L') === 'A' && nextMarkInCycle('A') === 'P')
check('...treating the legacy spelling as ច្បាប់', nextMarkInCycle('AP') === 'A')
check('...and never writes AP', ['P', 'L', 'A', 'AP', undefined].every((s) => nextMarkInCycle(s) !== 'AP'))

/*
 * The screen must reach these through the module. A private `filter(...)`
 * over statuses in the list view is the twelfth reading waiting to happen.
 */
check('RosterCheckIn reads the roster through the register module',
  /attendance\/register/.test(roster) && /visibleRoster|ROSTER_FILTERS/.test(roster))
check('the summary strip counts through registerSummary', /registerSummary/.test(tallyStrip))
check('the screen offers the primary action in the entry vocabulary',
  /មកទាំងអស់/.test(roster), 'the "everyone is here" button is the daily flow')

// ---------------------------------------------------------------------------
// A8 · three screens, one job  (Phase 16)
// ---------------------------------------------------------------------------
console.log('\nA8 · mark the day, read the month, read the year')

/*
 * Taking a register, reviewing the month and reviewing the year are three views
 * of one record, and they were wired as a two-node loop with the daily action
 * outside it: monthly ⇄ yearly, and `/attendance/layout` named by neither and
 * naming neither. A teacher reading the month was, in the brief's words,
 * trapped inside a report.
 */
check('the three views are declared once',
  ATTENDANCE_VIEWS.map((v) => v.id).join(',') === 'register,monthly,yearly',
  ATTENDANCE_VIEWS.map((v) => v.id).join(','))
check('the register is first — it is the only one that WRITES',
  ATTENDANCE_VIEWS[0].href === '/attendance/layout')
check('every view carries a Khmer label and the question it answers',
  ATTENDANCE_VIEWS.every((v) => v.label.length > 0 && v.purpose.length > 0 && v.href.startsWith('/attendance/')))
check('a screen never links to itself',
  ATTENDANCE_VIEWS.every((v) => !otherAttendanceViews(v.id).some((o) => o.id === v.id)),
  'a control that looks live and does nothing reads as a lost tap')
check('...and offers the other two',
  ATTENDANCE_VIEWS.every((v) => otherAttendanceViews(v.id).length === ATTENDANCE_VIEWS.length - 1))

const monthlyScreen = readFileSync(join(root, 'app', '(main)', 'attendance', 'monthly', 'MonthlyAttendanceClient.tsx'), 'utf8')
const yearlyScreen = readFileSync(join(root, 'app', '(main)', 'attendance', 'yearly', 'YearlyAbsenceClient.tsx'), 'utf8')
const viewNav = readFileSync(join(root, 'components', 'attendance', 'AttendanceViewNav.tsx'), 'utf8')

for (const [name, src, id] of [
  ['the register', layout, 'register'],
  ['the monthly sheet', monthlyScreen, 'monthly'],
  ['the yearly sheet', yearlyScreen, 'yearly'],
] as const) {
  check(`${name} renders the shared join`,
    new RegExp(`<AttendanceViewNav[^>]*current="${id}"`).test(code(src)),
    'a per-screen list of where it links to is how the register fell out of the loop')
}
check('the join carries the class',
  /useClassHref/.test(viewNav) && /classHref\(view\.href\)/.test(code(viewNav)),
  'without ?class= the month opens on the default class while the chip says another')
check('...and no screen keeps a hand-rolled attendance link',
  !/href=\{classHref\("\/attendance/.test(code(monthlyScreen) + code(yearlyScreen)),
  'the two sheets each owned a private copy of the other half of the loop')

/*
 * The month is counted through `tallyAttendance`, like the day is. A private
 * loop here would be a second arithmetic for the same marks, one rendered above
 * the other on the same screen.
 */
const monthMarks = {
  '2026-09-01': { s1: { status: 'P' }, s2: { status: 'L' }, s3: { status: 'A' } },
  '2026-09-02': { s1: { status: 'P' }, s2: { status: 'P' }, s9: { status: 'A' } },
  '2026-09-03': { s9: { status: 'A' } },
}
const month = periodSummary(pupils, monthMarks)
check('the period counts only the roster', month.present === 3 && month.unexcused === 1,
  'both attendance reads are teacher-scoped, so another class\'s pupils arrive in the same payload')
check('...excused and unexcused stay apart', month.excused === 1 && month.absences === 2)
check('days recorded counts days MARKED, not days in the month', month.daysRecorded === 2,
  'the third day holds only a pupil who is not on this roster')
check('the rate is tallyAttendance\'s, over marks recorded', month.rate === 60,
  String(month.rate))
check('an unmarked month has no rate, not a zero one',
  periodSummary(pupils, {}).rate === null && periodSummary(pupils, {}).daysRecorded === 0)
check('the monthly screen counts through the shared module',
  /periodSummary/.test(code(monthlyScreen)),
  'the sheet\'s per-pupil totals and the strip above it must be one arithmetic')

/*
 * The date input claims `max={initialDate}`. That paints the control invalid
 * and does not stop `onChange` firing, so the handler has to honour it or the
 * claim is markup only.
 */
check('the register refuses a future date in the handler, not just in the markup',
  /newDate > initialDate/.test(code(layout)),
  'a register for tomorrow is a register for a day nobody has attended')

/*
 * The sheet derived its own academic year from `month >= 8` — a SEPTEMBER
 * boundary, in a product whose school year runs November → October. On
 * 11 September 2026 it printed ២០២៦-២០២៧ directly beneath a class bar reading
 * ២០២៥-២០២៦. Three private academic-year rules is two too many.
 */
check('the monthly sheet reads the product\'s academic-year rule',
  /getCurrentAcademicYear\(/.test(code(monthlyScreen)) && !/month >= 8/.test(code(monthlyScreen)),
  'a September boundary disagreed with the class bar on the same screen')
check('...and the .xlsx carries no hard-coded year',
  !/ឆ្នាំសិក្សា ២០២៤-២០២៥/.test(code(monthlyScreen)),
  'every export said 2024-2025 whatever month it was taken from')
check('...and names the class rather than a row of dots',
  /ថ្នាក់៖ \$\{documentClass/.test(code(monthlyScreen)))

/* The monthly sheet used to render a blank white area for an empty class. */
check('an empty class is explained, not left blank',
  /<EmptyState/.test(code(monthlyScreen)))
check('...and the row-count control cannot blank the preview',
  /Number\.isNaN/.test(code(monthlyScreen)),
  "parseInt('') is NaN, and `while (current <= NaN)` renders nothing at all")

// ---------------------------------------------------------------------------
// A9 · one status, one meaning, one word  (Phase 17)
// ---------------------------------------------------------------------------
console.log('\nA9 · a mark means one thing, and is called one thing')

/*
 * The column is free TEXT with no CHECK constraint, and `saveAttendance` used
 * to put its `status: string` parameter straight into the upsert. Demonstrated
 * against the live stack: an authenticated teacher PATCHed a row to
 * `status: "late123"`, the database accepted it, and /students/[id] printed
 * **late123** verbatim as that pupil's mark for the day.
 */
check('the three entry marks are enterable',
  ENTRY_MARKS.every((m) => isEnterableStatus(m.code)))
check('AP is NOT enterable — it is readable legacy only',
  !isEnterableStatus('AP'),
  'offering it would be offering a second spelling of ច្បាប់')
check('garbage is refused', ['late123', '', 'undefined', 'p', ' P', 'T'].every((v) => !isEnterableStatus(v)))
check('...and so is anything that is not a string',
  [null, undefined, 42, {}, ['P']].every((v) => !isEnterableStatus(v)))

const actions = code(readFileSync(join(root, 'app', '(main)', 'attendance', 'layout', 'actions.ts'), 'utf8'))
check('both server writers validate before they write',
  (actions.match(/isEnterableStatus\(status\)/g) ?? []).length === 2,
  'a bulk call must not be the way round the single-write guard')
check('...and the guard runs before the scope is resolved',
  // The first CALL, not the import line at the top of the file.
  actions.indexOf('isEnterableStatus(status)') < actions.indexOf('resolveServerScope(user.id'),
  'an invalid mark is refused whatever class it names')

/*
 * One declared fact must not carry two Khmer words. `AP` is a legacy spelling
 * of `L` — identical `inClass`, `excused` and `short` — and it used to carry
 * its own label (សុំច្បាប់) and its own badge colour, so the same permitted
 * absence rendered two ways depending on which spelling was stored.
 */
const l = markFor('L')!, ap = markFor('AP')!
check('AP is L in every respect, including its label',
  ap.label === l.label && ap.short === l.short && ap.inClass === l.inClass && ap.excused === l.excused,
  `${ap.label} vs ${l.label}`)

const badge = code(readFileSync(join(root, 'components', 'ui', 'feedback', 'Badge.tsx'), 'utf8'))
check('the badge map is DERIVED from the vocabulary, not typed out',
  /ATTENDANCE_MARKS\.map/.test(badge) && /ATTENDANCE_MARKS/.test(badge),
  'a second copy of the labels is a second thing to drift')
check('...and no longer spells the Khmer labels itself',
  !/label:\s*"[^"]*\u1780[^"]*"/.test(badge),
  'only the tone is decided there — a colour is a property of the badge, not of the mark')

const typesFile = code(readFileSync(join(root, 'lib', 'types.ts'), 'utf8'))
check('lib/types.ts does not declare its own status union',
  !/export type AttendanceStatus\s*=/.test(typesFile),
  "it declared one above a comment reading 'present / late / …', so the file every row type is looked up in called L lateness")
check('...it re-exports the single declaration instead',
  /export type \{ AttendanceStatus \}/.test(typesFile) && /attendance\/status/.test(typesFile))

/*
 * The parent portal counted `L` as attending and labelled it មកយឺត. The
 * reading was fixed; the translation key stayed behind with no consumer, which
 * is how the same mistake gets wired up a second time.
 */
const i18n = readFileSync(join(root, 'app', 'parent', 'i18n.ts'), 'utf8')
check('the portal has no late translation key left to wire up',
  !/^\s*late:\s*'/m.test(code(i18n)),
  'nothing in this product records lateness')
const portal = code(readFileSync(join(root, 'app', 'parent', '(portal)', 'attendance', 'AttendanceClient.tsx'), 'utf8'))
check('the portal maps L and AP to the SAME tile',
  /L:\s*\{[^}]*key:\s*'permission'/.test(portal) && /AP:\s*\{[^}]*key:\s*'permission'/.test(portal),
  'they are one mark; two tiles would be two answers to one question')
check('...and counts through the shared tally',
  /tallyAttendance/.test(code(readFileSync(join(root, 'app', 'parent', 'queries.ts'), 'utf8'))))

/*
 * The 3D room defaulted an unmarked pupil to 'P' — colouring and counting them
 * as present — and folded AP and every unknown value into "absent".
 */
const three = code(readFileSync(join(root, 'app', '(main)', 'attendance', 'layout', 'ThreeClassroom.tsx'), 'utf8'))
check('the 3D room counts through tallyAttendance',
  /tallyAttendance\(/.test(three),
  'it kept a private p/l/a loop that no other surface agreed with')
check('...and no longer calls an unmarked pupil present',
  !/\|\|\s*'P'/.test(three),
  "getStatus3 ended `|| 'P'`, so a class nobody had marked read as fully present")
check('...and resolves its colours through markFor',
  /markFor\(/.test(three) && /seatTone3/.test(three))

// ---------------------------------------------------------------------------
console.log(failures === 0 ? '\n✓ one register, one vocabulary.\n' : `\n✗ ${failures} failure(s)\n`)
process.exit(failures === 0 ? 0 : 1)
