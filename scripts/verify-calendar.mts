/**
 * The acceptance test for `lib/scores/calendar.ts`.
 *
 *     node scripts/verify-calendar.mts
 *
 * Two claims carry the phase:
 *
 *   1. INV-2 — zero configuration reproduces today exactly. `DEFAULT_CALENDAR`
 *      must equal what `monthsForSemester` has always answered, because every
 *      existing account resolves it.
 *
 *   2. INV-1 — merging months moves labels and membership, never keys. A merged
 *      មីនា-មេសា period stores under the anchor `'mar'`; `'apr'` stops being a
 *      key (its cell disappears) but no `'mar_apr'` key can ever exist.
 *
 * Plus the deliberate consequence the design doc flags: a merge shrinks the
 * semester's period count, which is the denominator of `monthlyComponent` —
 * every pupil's semester average genuinely changes. That is the re-grade the
 * P4 form must warn about, so this file asserts it really happens.
 */

import {
  DEFAULT_CALENDAR, deriveLabel, periodForDate, periodKeysForSemester,
  periodsForSemester, resolveCalendar, validateCalendar,
  type ScoreCalendarPeriodRow, type ScorePeriod,
} from '../lib/scores/calendar.ts'
import { monthlyComponent, monthsForSemester } from '../lib/scores/semester.ts'
import { ACADEMIC_MONTH_IDS } from '../lib/constants/months.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}
const eq = (a: readonly unknown[], b: readonly unknown[]) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// INV-2: the default calendar IS today's behaviour.
// ---------------------------------------------------------------------------
console.log('DEFAULT_CALENDAR reproduces today exactly:')

const SEM1 = ['nov', 'dec', 'jan', 'feb', 'mar']
const SEM2 = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct']

check("sem1 keys are ['nov','dec','jan','feb','mar']",
  eq(periodKeysForSemester(DEFAULT_CALENDAR, 'sem1'), SEM1),
  JSON.stringify(periodKeysForSemester(DEFAULT_CALENDAR, 'sem1')))
check('sem2 keys are the remaining seven months',
  eq(periodKeysForSemester(DEFAULT_CALENDAR, 'sem2'), SEM2),
  JSON.stringify(periodKeysForSemester(DEFAULT_CALENDAR, 'sem2')))
check('twelve periods, one member each, key === member',
  DEFAULT_CALENDAR.length === 12 &&
  DEFAULT_CALENDAR.every((p) => p.members.length === 1 && p.members[0] === p.key))
check('periods follow academic-year order',
  eq(DEFAULT_CALENDAR.map((p) => p.key), ACADEMIC_MONTH_IDS))
check('monthsForSemester delegates to the same answer (back-compat)',
  eq(monthsForSemester('sem1'), SEM1) && eq(monthsForSemester('sem2'), SEM2))
check('the default calendar validates clean',
  validateCalendar([...DEFAULT_CALENDAR]).length === 0)
check('resolveCalendar with zero rows resolves the default',
  eq(resolveCalendar([], { academicYear: '2025-2026' }), DEFAULT_CALENDAR))

// ---------------------------------------------------------------------------
// INV-1: merging មីនា+មេសា — anchor stays 'mar', 'apr' stops being a key.
// ---------------------------------------------------------------------------
console.log('\nmerging mar+apr (semester boundary moved past មេសា):')

/** The default, with apr absorbed into mar's period inside sem1. */
const merged: ScorePeriod[] = DEFAULT_CALENDAR
  .filter((p) => p.key !== 'apr')
  .map((p) => p.key === 'mar'
    ? { ...p, members: ['mar', 'apr'], labelKm: deriveLabel(['mar', 'apr']) }
    : p)

check('the merged calendar validates clean', validateCalendar(merged).length === 0)
check("'apr' is no longer a key anywhere",
  merged.every((p) => p.key !== 'apr'))
check("the anchor is 'mar' — an existing MonthId, no invented key",
  merged.some((p) => p.key === 'mar' && eq(p.members, ['mar', 'apr'])))
check("deriveLabel(['mar','apr']) === 'មីនា-មេសា'",
  deriveLabel(['mar', 'apr']) === 'មីនា-មេសា', `got '${deriveLabel(['mar', 'apr'])}'`)
check('deriveLabel of a single month is just its name',
  deriveLabel(['nov']) === 'វិច្ឆិកា', `got '${deriveLabel(['nov'])}'`)

// ---------------------------------------------------------------------------
// The merge genuinely re-grades: the semester period count — the denominator
// of monthlyComponent — shrinks.
// ---------------------------------------------------------------------------
console.log('\na merge changes the monthlyComponent denominator:')

check('default sem2 has 7 periods; merged sem2 has 6',
  periodsForSemester(DEFAULT_CALENDAR, 'sem2').length === 7 &&
  periodsForSemester(merged, 'sem2').length === 6)

{
  // A pupil averaging 8 every month of sem2 except a 2 in apr. On the default
  // calendar apr's 2 drags the mean down; merged, apr is no longer a sem2 key
  // and the mean is a flat 8 over six periods.
  const averages: Record<string, number> = { apr: 2, may: 8, jun: 8, jul: 8, aug: 8, sep: 8, oct: 8 }
  const before = monthlyComponent(averages, periodKeysForSemester(DEFAULT_CALENDAR, 'sem2'))
  const after = monthlyComponent(averages, periodKeysForSemester(merged, 'sem2'))
  check('the same marks average differently once merged',
    before !== null && after !== null &&
    Math.abs(before - 50 / 7) < 1e-9 && Math.abs(after - 8) < 1e-9,
    `before ${before}, after ${after}`)
}

// ---------------------------------------------------------------------------
// validateCalendar catches what Postgres cannot.
// ---------------------------------------------------------------------------
console.log('\nvalidateCalendar:')

const period = (over: Partial<ScorePeriod> & { key: ScorePeriod['key'] }): ScorePeriod => ({
  labelKm: '', members: [over.key], semester: 'sem1',
  startsOn: null, endsOn: null, locked: false, sortOrder: 0, ...over,
})

check('a month in two periods is an overlap',
  validateCalendar([
    period({ key: 'mar', members: ['mar', 'apr'] }),
    period({ key: 'apr' }),
  ]).some((p) => p.code === 'overlap'))
check('an anchor outside its members is caught',
  validateCalendar([period({ key: 'mar', members: ['apr'] })])
    .some((p) => p.code === 'anchor_not_member'))
check('a sem1 period after a sem2 period is caught',
  validateCalendar([
    period({ key: 'nov', semester: 'sem1' }),
    period({ key: 'dec', semester: 'sem2' }),
    period({ key: 'jan', semester: 'sem1' }),
  ]).some((p) => p.code === 'semester_not_contiguous'))
check('a month id that is not a month is caught',
  validateCalendar([period({ key: 'mar', members: ['mar', 'xyz' as never] })])
    .some((p) => p.code === 'invalid_month'))
check('a month in NO period is not a problem (a month with no collection)',
  validateCalendar(DEFAULT_CALENDAR.filter((p) => p.key !== 'oct')).length === 0)
check('every problem message is Khmer',
  validateCalendar([
    period({ key: 'mar', members: ['apr'] }),
    period({ key: 'apr' }),
  ]).every((p) => /[ក-៿]/.test(p.messageKm)))

// ---------------------------------------------------------------------------
// resolveCalendar layering: class rows → school rows → default, whole set.
// ---------------------------------------------------------------------------
console.log('\nresolveCalendar layering (INV-3, whole set):')

const row = (over: Partial<ScoreCalendarPeriodRow>): ScoreCalendarPeriodRow => ({
  id: 'r', scope: 'class', school_id: null, class_id: 'c1',
  academic_year: '2025-2026', month_key: 'nov', member_months: ['nov'],
  label_km: null, semester: 'sem1', starts_on: null, ends_on: null,
  locked_at: null, locked_by: null, sort_order: 0, ...over,
})

{
  const rows = [
    row({ id: 'school-nov', scope: 'school', school_id: 's1', class_id: null }),
    row({ id: 'class-mar', month_key: 'mar', member_months: ['mar', 'apr'], semester: 'sem1', sort_order: 4 }),
  ]
  const cal = resolveCalendar(rows, { classId: 'c1', academicYear: '2025-2026' })
  check('class rows win outright — the school row does not leak in',
    cal.length === 1 && cal[0].key === 'mar')
  check('a merged row derives its label',
    cal[0].labelKm === 'មីនា-មេសា', `got '${cal[0].labelKm}'`)
  check('another class resolves the school layer instead',
    resolveCalendar(rows, { classId: 'c2', academicYear: '2025-2026' })[0]?.key === 'nov')
  check("a different year resolves the default",
    eq(resolveCalendar(rows, { classId: 'c1', academicYear: '2024-2025' }), DEFAULT_CALENDAR))
  check('a locked_at timestamp resolves as locked',
    resolveCalendar([row({ locked_at: '2026-01-01T00:00:00Z' })],
      { classId: 'c1', academicYear: '2025-2026' })[0].locked === true)
}

// ---------------------------------------------------------------------------
// periodForDate: explicit windows win; members answer for the rest.
// ---------------------------------------------------------------------------
console.log('\nperiodForDate:')

check('a March date lands in the mar period',
  periodForDate(DEFAULT_CALENDAR, new Date(2026, 2, 15))?.key === 'mar')
check('an April date on the merged calendar lands in the mar anchor period',
  periodForDate(merged, new Date(2026, 3, 10))?.key === 'mar')
check('an explicit collection window beats month membership',
  periodForDate([
    { ...period({ key: 'nov' }), startsOn: '2026-03-01', endsOn: '2026-03-31' },
    period({ key: 'mar' }),
  ], new Date(2026, 2, 15))?.key === 'nov')
check("a month in no period defaults to null",
  periodForDate(DEFAULT_CALENDAR.filter((p) => p.key !== 'oct'), new Date(2026, 9, 5)) === null)

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ the calendar behaves as specified.')
