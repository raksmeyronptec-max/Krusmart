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
} from '../lib/attendance/register.ts'

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

const HANDWRITTEN = /status\s*(?:===|!==)\s*['"](?:P|L|A|AP)['"]/g

for (const rel of COUNTERS) {
  const src = code(readFileSync(join(root, rel), 'utf8'))
  const hits = (src.match(HANDWRITTEN) ?? []).length
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
  const hits = (src.match(HANDWRITTEN) ?? []).length
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
console.log(failures === 0 ? '\n✓ one register, one vocabulary.\n' : `\n✗ ${failures} failure(s)\n`)
process.exit(failures === 0 ? 0 : 1)
