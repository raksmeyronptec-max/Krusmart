/**
 * The /classroom rollout's structural invariants.
 *
 *     node scripts/verify-classroom.mts
 *
 * Most of what can go wrong here is not a wrong value but a wrong *shape*: a
 * route quietly relocated under `/classroom/`, a second subject-configuration
 * screen, a second class-creation path that forgets the enrolment backfill, or
 * a `DELETE` where an archive belongs. None of those is visible from a page
 * that renders — they are visible from which files exist and what they call.
 *
 * So this reads the rollout's own source. It needs no database and no browser,
 * which is the point: these are the rules that must hold on every checkout.
 *
 * Exits non-zero on any failure.
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildClassList,
  countEnrolments,
  type ClassAssignmentRow,
  type EnrolmentCountRow,
} from '../lib/classroom/classes.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const root = new URL('../', import.meta.url)
const path = (p: string) => fileURLToPath(new URL(p, root))
const has = (p: string) => existsSync(path(p))
const read = (p: string) => (has(p) ? readFileSync(path(p), 'utf8') : '')

const HUB = 'app/(main)/classroom/page.tsx'

// --- 1. where the routes live -----------------------------------------------------
console.log('\nthe rollout adds two routes and no others:')

check('the hub exists', has(HUB))
check(
  'under app/(main)/, so it inherits the shell, the parent redirect and proxy.ts',
  has(HUB) && !has('app/classroom/page.tsx'),
)
check('it does not render its own <TopNav /> — the layout owns it',
  !read(HUB).includes('<TopNav'))

// ★ The rule the whole design rests on: the hub *links*, it does not absorb.
console.log('\nnothing was relocated under /classroom:')
for (const forbidden of [
  'app/(main)/classroom/students',
  'app/(main)/classroom/enrollment',
  'app/(main)/classroom/subjects',
  'app/(main)/classroom/student-list',
]) {
  check(`no ${forbidden.replace('app/(main)', '')}`, !has(forbidden))
}

console.log('\nthe screens it links to are still where they were:')
for (const kept of [
  'app/(main)/student-list/page.tsx',
  'app/(main)/students/[id]/page.tsx',
  'app/(main)/enrollment/page.tsx',
  'app/(main)/score/subjects/page.tsx',
]) {
  check(kept.replace('app/(main)', ''), has(kept))
}

// --- 2. the hub's four destinations ------------------------------------------------
console.log('\nthe hub offers exactly the four cards, pointing outward:')
const hub = read(HUB)
for (const [label, href] of [
  ['ថ្នាក់របស់ខ្ញុំ', '/classroom/classes'],
  ['សិស្សក្នុងថ្នាក់', '/student-list'],
  ['បញ្ចូលសិស្សថ្មី', '/enrollment'],
  ['មុខវិជ្ជា', '/score/subjects'],
] as const) {
  check(`${label} → ${href}`, hub.includes(`'${href}'`) && hub.includes(label))
}
check(
  'it reads no marks, no roster and no template — it is a discovery layer',
  !/from\('scores'\)|from\('students'\)|from\('student_enrollments'\)|from\('score_template_subjects'\)/.test(hub),
)
check(
  'it carries the class forward as ?class=, the existing mechanism',
  hub.includes('class=') && hub.includes('resolveServerScope'),
)

// --- 3. one subject-configuration screen -------------------------------------------
// `/score/template` is already a redirect to `/score/subjects` precisely because
// two screens editing one template is how they end up disagreeing.
console.log('\nthere is still exactly one subject-configuration screen:')
check(
  'the hub links to /score/subjects rather than reimplementing it',
  hub.includes('/score/subjects') &&
    !/score_template_subjects|class_template_subjects|addClassSubject/.test(hub),
)
check('/score/template is still a redirect, not a second one',
  read('app/(main)/score/template/page.tsx').includes('redirect'))

// --- 4. the class list a teacher sees ---------------------------------------------
// `buildClassList` is where the read rules live, and every one of them fails
// silently: a stale archived class, a head count that disagrees with
// /student-list, two cards for one class.

function assignment(
  over: Partial<ClassAssignmentRow> & { id: string; class_id: string },
): ClassAssignmentRow {
  return {
    academic_year_id: 'y-2026',
    is_homeroom: true,
    status: 'active',
    created_at: '2026-09-01T00:00:00Z',
    classes: {
      id: over.class_id,
      name: 'ក',
      grades: { name: 'ថ្នាក់ទី៥', sort_order: 5, education_levels: { name: 'បឋមសិក្សា' } },
    },
    academic_years: { name: '2026-2027' },
    ...over,
  }
}

const enrol = (classId: string, studentId: string, status = 'active'): EnrolmentCountRow => ({
  class_id: classId,
  student_id: studentId,
  status,
})

console.log('\nonly active assignments are listed:')
{
  const list = buildClassList(
    [
      assignment({ id: 'a-1', class_id: 'c-live' }),
      assignment({ id: 'a-2', class_id: 'c-archived', status: 'inactive' }),
    ],
    [],
  )
  check('one card, not two', list.length === 1, `got ${list.length}`)
  check('the archived one is gone', list[0]?.classId === 'c-live', `got ${list[0]?.classId}`)
}
check(
  'a row whose class RLS withheld is dropped rather than rendered blank',
  buildClassList([assignment({ id: 'a-3', class_id: 'c-x', classes: null })], []).length === 0,
)

console.log('\none card per class, not per assignment:')
{
  const list = buildClassList(
    [
      assignment({ id: 'a-sub', class_id: 'c-1', is_homeroom: false, subject_key: 'hs_physics',
        created_at: '2026-09-01T00:00:00Z' }),
      assignment({ id: 'a-home', class_id: 'c-1', is_homeroom: true,
        created_at: '2026-10-01T00:00:00Z' }),
    ],
    [],
  )
  check('two assignments on one class → one card', list.length === 1, `got ${list.length}`)
  check('the card reports homeroom', list[0]?.isHomeroom === true)
  check('selecting it selects the homeroom assignment, as resolveServerScope would',
    list[0]?.assignmentId === 'a-home', `got ${list[0]?.assignmentId}`)
  check('but archiving knows about both rows',
    list[0]?.assignmentIds.length === 2 &&
      list[0].assignmentIds.includes('a-sub') && list[0].assignmentIds.includes('a-home'))
}
check(
  'a subject-only teacher is not marked as form master',
  buildClassList(
    [assignment({ id: 'a-s', class_id: 'c-2', is_homeroom: false, subject_key: 'hs_math' })],
    [],
  )[0]?.isHomeroom === false,
)

console.log('\nthe head count follows the roster rule (.neq withdrawn), not `= active`:')
{
  const counted = countEnrolments([
    enrol('c-1', 's-1', 'active'),
    // Past years stamp these; counting only `active` would empty every
    // historical class, which is why no roster read in this codebase does that.
    enrol('c-1', 's-2', 'promoted'),
    enrol('c-1', 's-3', 'transferred'),
    enrol('c-1', 's-4', 'withdrawn'),
  ])
  check('promoted and transferred pupils count', counted.get('c-1') === 3, `got ${counted.get('c-1')}`)
  check('withdrawn pupils do not', counted.get('c-1') !== 4)
}
check(
  'a duplicated enrolment row counts the pupil once',
  countEnrolments([enrol('c-1', 's-1'), enrol('c-1', 's-1')]).get('c-1') === 1,
)
check(
  'counts do not leak between classes',
  (() => {
    const c = countEnrolments([enrol('c-1', 's-1'), enrol('c-2', 's-2'), enrol('c-2', 's-3')])
    return c.get('c-1') === 1 && c.get('c-2') === 2
  })(),
)
check(
  'a class with no enrolments reads zero, not blank',
  buildClassList([assignment({ id: 'a-1', class_id: 'c-empty' })], [])[0]?.studentCount === 0,
)
check(
  'the count reaches the card it belongs to',
  buildClassList(
    [assignment({ id: 'a-1', class_id: 'c-1' }), assignment({ id: 'a-2', class_id: 'c-2' })],
    [enrol('c-2', 's-1'), enrol('c-2', 's-2'), enrol('c-1', 's-3')],
  ).find((c) => c.classId === 'c-2')?.studentCount === 2,
)

console.log('\nthe card carries the class, grade, level and year:')
{
  const [card] = buildClassList([assignment({ id: 'a-1', class_id: 'c-1' })], [])
  check('class name', card?.className === 'ក')
  check('grade name', card?.gradeName === 'ថ្នាក់ទី៥')
  check('grade number, from sort_order', card?.gradeNumber === 5)
  check('education level', card?.levelName === 'បឋមសិក្សា')
  check('academic year', card?.academicYearName === '2026-2027')
}
check(
  'a school with unrecognised level names still renders, without a stray separator',
  (() => {
    const [card] = buildClassList(
      [assignment({ id: 'a-1', class_id: 'c-1',
        classes: { id: 'c-1', name: 'ខ', grades: null } })],
      [],
    )
    return card?.className === 'ខ' && card.gradeName === '' && card.gradeNumber === null
  })(),
)

console.log('\nthe list reads newest year first — the reverse of the default-class rule:')
{
  const list = buildClassList(
    [
      assignment({ id: 'a-old', class_id: 'c-old', academic_year_id: 'y-2025',
        academic_years: { name: '2025-2026' } }),
      assignment({ id: 'a-new', class_id: 'c-new', academic_years: { name: '2026-2027' } }),
    ],
    [],
  )
  check('current year leads the list', list[0]?.classId === 'c-new', `got ${list[0]?.classId}`)
}

console.log('\nthe active-class control is the existing one:')
const client = read('app/(main)/classroom/classes/ClassesClient.tsx')
check('it selects through useSelectActiveClass', client.includes('useSelectActiveClass'))
check('it owns no selection state of its own',
  !/useState<[^>]*>\(\s*(activeClassId|null)/.test(client) && !client.includes('setActiveClassId'))
check('ClassContextSwitcher writes through the same hook',
  read('components/ClassContextSwitcher.tsx').includes('useSelectActiveClass'))
check('there is no second switcher component',
  !existsSync(path('components/ClassSwitcher2.tsx')) &&
    !existsSync(path('app/(main)/classroom/classes/ClassSwitcher.tsx')))
// The client *mentions* the wizard, in a comment saying why it does not send
// anyone there. What must not exist is a navigation to it.
check('the empty state does not bounce the teacher back into the wizard',
  !/(router\.(push|replace)|redirect\(|href=)[^\n]*\/onboarding\/class/.test(client))

console.log('\nthe page reads in bulk, never per card:')
const page = read('app/(main)/classroom/classes/page.tsx')
check('head counts come from one in() read', page.includes(".in('class_id'"))

// Sliced, because the two queries want opposite things: assignments *are*
// filtered to `active` (that is what archiving turns off), enrolments must
// never be, or every past year's class reads as empty.
const enrolQuery = page.slice(
  page.indexOf("from('student_enrollments')"),
  page.indexOf('const classes ='),
)
check('the enrolment read excludes only withdrawn', enrolQuery.includes(".neq('status', 'withdrawn')"))
check('the enrolment read never narrows to `active`', !enrolQuery.includes(".eq('status', 'active')"))
check('the assignment read does filter to active — that is what archiving writes',
  page.slice(0, page.indexOf("from('student_enrollments')")).includes(".eq('status', 'active')"))
check('it scopes assignments to the caller', page.includes(".eq('teacher_id', user.id)"))
check('it resolves the active class through resolveServerScope, not its own rule',
  page.includes('resolveServerScope'))

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ /classroom groups the existing screens, lists only live classes, and counts the real roster.')
