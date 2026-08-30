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
// Narrowed in C5. This read `!/useState<[^>]*>\(\s*(activeClassId|null)/`,
// which forbade *any* nullable state in the file — so the manage dialog's
// `useState<ClassroomClass | null>(null)` tripped it. That is ordinary UI
// state and never was the thing at risk. What must not exist is a second
// opinion about which class is ACTIVE, so the check now names that instead of
// pattern-matching on nullability.
check('it owns no selection state of its own',
  !/const \[\s*\w*[Aa]ctive\w*\s*,\s*set\w+\s*\]\s*=\s*useState/.test(client) &&
    !client.includes('setActiveClassId'))
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

// --- 5. one class-creation path ----------------------------------------------------
// ★ The rule with the sharpest failure mode. `createClassAndAssign` runs the
// enrolment backfill immediately after inserting the assignment, and rolls the
// assignment *and* the class back if it fails. Neither is visible from a call
// site, so a second creation path is a path that silently omits both.
console.log('\ncreating a class goes through the one existing action:')

const dialog = read('app/(main)/classroom/classes/CreateClassDialog.tsx')
check('the dialog calls createClassAndAssign', dialog.includes('createClassAndAssign'))
check('imported from the onboarding actions, not re-declared',
  /from '@\/app\/onboarding\/actions'/.test(dialog))

// The classroom feature must not write these tables itself.
const feature = ['app/(main)/classroom/classes/page.tsx',
  'app/(main)/classroom/classes/ClassesClient.tsx',
  'app/(main)/classroom/classes/CreateClassDialog.tsx'].map(read).join('\n')
check('the classroom feature never inserts a class itself',
  !/from\('classes'\)[\s\S]{0,80}\.insert/.test(feature))
check('nor an assignment', !/from\('teacher_assignments'\)[\s\S]{0,80}\.insert/.test(feature))
// The dialog *names* the RPC, in the comment explaining why it does not call
// it. What must not exist is an invocation.
check('nor calls the backfill RPC on its own',
  !/\.rpc\(\s*'backfill_teacher_enrolments'/.test(feature))

const actions = read('app/onboarding/actions.ts')
check('the action still backfills right after the assignment',
  actions.includes("rpc(\n    'backfill_teacher_enrolments'") ||
    actions.includes("'backfill_teacher_enrolments'"))
check('and still rolls the class back when the backfill fails',
  /backfillErr\)?\s*\{[\s\S]{0,900}rollbackClass/.test(actions))
check('and when the assignment itself fails',
  /assignErr\)\s*\{[\s\S]{0,600}rollbackClass/.test(actions))
check('the caller does not swallow the failure',
  dialog.includes('result?.error') && dialog.includes('setError'))
check('nothing is closed or refreshed before the server confirms',
  dialog.indexOf('return') < dialog.indexOf('router.refresh()'))

// `origin` decides where the browser goes next, so it must be a closed union
// and never a path supplied by the caller.
check('the redirect target is a closed union, not a URL from the client',
  actions.includes("export type ClassCreationOrigin = 'onboarding' | 'classroom'") &&
    !/redirect\(\s*input\.(redirectTo|origin)/.test(actions))
check('the wizard still continues to /onboarding/students',
  actions.includes('redirect(`/onboarding/students?class=${cls.id}`)'))

// --- 5b. who is the form master, and what that costs -------------------------
// `is_homeroom` is not a label. `student_enrollments_write_assigned_or_admin`
// (00003) permits an enrolment write ONLY to a class's homeroom teacher or a
// school admin, and 00018 resolves the backfill's target class through the
// caller's homeroom assignments — so the flag decides both whether the teacher
// can ever add a pupil and whether the create call survives at all.
console.log('\nthe homeroom choice tells the truth about what it costs:')

check('the enrolment write policy still keys on is_homeroom',
  /student_enrollments_write_assigned_or_admin[\s\S]{0,400}ta\.is_homeroom/
    .test(read('supabase/migrations/00003_enterprise_v2_foundation.sql')),
  'if this stops being true, the warning below is telling teachers a lie')

check('the wizard is unchanged: homeroom unless a caller says otherwise',
  /input\.isHomeroom\s*\?\?\s*true/.test(actions))
check('the assignment carries the resolved flag, not a literal',
  /is_homeroom:\s*isHomeroom/.test(actions) && !/is_homeroom:\s*true/.test(actions))

// The sharp one. Calling the RPC for a non-homeroom class raises inside the
// function, which lands in the rollback and deletes a class the teacher
// legitimately asked for.
check('the backfill is skipped when the caller is not the form master',
  /isHomeroom\s*\n?\s*\?\s*await supabase\.rpc\(\s*'backfill_teacher_enrolments'/.test(actions),
  'it resolves p_class_id through homeroom assignments and raises otherwise')

check('the dialog offers the choice', /setIsHomeroom/.test(dialog))
check('ticked by default, because unticking is the unusual case',
  /useState\(true\)/.test(dialog))
check('and the flag reaches the action', /isHomeroom,/.test(dialog))
check('unticking says what it costs, rather than failing later',
  /!isHomeroom\s*&&/.test(dialog) && dialog.includes('មិនអាចបញ្ចូលសិស្សដោយខ្លួនឯង'),
  'the consequence belongs at the moment of choice, not on an empty roster')

console.log('\nthe context is refreshed, because the new assignment is not in it:')
check('TeacherContext is reloaded after a successful create', dialog.includes('teacher?.refresh()'))
check('and the server component re-runs', dialog.includes('router.refresh()'))

// --- 6. the backfill's idempotency, at the source ----------------------------------
// `scripts/verify-classroom-live.mts` proves this against a real database. This
// asserts the *reason* it holds, so an edit to the migration that would break a
// second class fails here rather than in production.
console.log("\n00019's predicate is what makes a second class safe:")
const mig = read('supabase/migrations/00019_backfill_never_enrolled_only.sql')
const insertBlock = mig.slice(mig.indexOf('INSERT INTO public.student_enrollments'),
  mig.indexOf('GET DIAGNOSTICS'))
// Cut at ON CONFLICT: the conflict target legitimately names
// academic_year_id, and including it would hide a year-scoped guard.
const notExists = insertBlock.slice(
  insertBlock.indexOf('NOT EXISTS'),
  insertBlock.indexOf('ON CONFLICT'),
)
check('it skips a pupil with ANY enrolment row', notExists.includes('se.student_id = s.id'))
check('unqualified by year — that is the whole property',
  !notExists.includes('academic_year_id'),
  'a year-scoped guard is 00018\'s defect: it re-enrols last year\'s roster')
check('unqualified by class', !/se\.class_id/.test(notExists))
check('unqualified by status', !/se\.status/.test(notExists))
check('and ON CONFLICT DO NOTHING is still the concurrency belt',
  insertBlock.includes('ON CONFLICT') && insertBlock.includes('DO NOTHING'))

// --- 7. renaming and archiving (C5) ------------------------------------------
// The rule with the most expensive failure mode in the whole feature: a
// `classes` row has scores, attendance and enrolments behind it, all
// ON DELETE CASCADE. Archiving must never become deleting.
console.log('\nrenaming and archiving never destroy anything:')

const classActions = read('app/(main)/classroom/classes/actions.ts')
const manage = read('app/(main)/classroom/classes/ManageClassDialog.tsx')

check('nothing in the feature deletes a class',
  !/from\('classes'\)[\s\S]{0,120}\.delete\(/.test(classActions + manage + client),
  'a classes row cascades to scores, attendance and enrolments')
check('nor deletes an assignment',
  !/from\('teacher_assignments'\)[\s\S]{0,120}\.delete\(/.test(classActions + manage + client))
check('archiving moves the status instead',
  /from\('teacher_assignments'\)[\s\S]{0,200}\.update\(\{\s*status:\s*'archived'/.test(classActions))
check('and archives every active row the teacher holds on the class',
  /\.eq\('teacher_id'[\s\S]{0,160}\.eq\('class_id'[\s\S]{0,160}\.eq\('status',\s*'active'\)/
    .test(classActions),
  'a teacher can hold a homeroom row AND a subject row on one class (00025)')

check('archiving the last active class is refused, not warned',
  /otherActive\s*\?\?\s*0\)\s*===\s*0/.test(classActions),
  'it silently drops the account to legacy scope, which a dialog cannot fairly describe')

// The rename must not let the name and the grade drift: the grade resolves the
// score template, the name does not.
check('the new name is regenerated from the class\'s own grade',
  /generatedClassName\(gradeNumber,\s*input\.section\)/.test(classActions))
check('the section is validated against the closed list',
  /CLASS_SECTIONS[\s\S]{0,80}\.includes\(input\.section\)/.test(classActions))
// Asserted as the shape of the payload, not the absence of two words nearby:
// the first attempt scanned a window of source and matched the comment naming
// `UNIQUE (grade_id, academic_year_id, name)`. Prose is not code.
check('neither grade nor academic year is writable',
  /from\('classes'\)\s*\n?\s*\.update\(\{ name \}\)/.test(classActions),
  'the only column a rename may touch is `name`')

// ★ The trap. PostgREST does not error when RLS rejects an UPDATE — it matches
// no rows and returns 200. Only checking `error` shows a success toast over a
// class that did not change.
console.log('\na write the policy rejects is reported, not celebrated:')
check('both actions gate on the permission the RLS mirrors',
  (classActions.match(/requirePermission\('classes:update'\)/g) ?? []).length >= 2,
  'classes/teacher_assignments carry admin-only write policies (00003)')
check('rename treats zero rows as a refusal',
  /!updated \|\| updated\.length === 0/.test(classActions))
check('archive treats zero rows as a refusal',
  /!archived \|\| archived\.length === 0/.test(classActions))
check('both writes select rows back, so there is something to count',
  (classActions.match(/\.select\('id'\)/g) ?? []).length >= 2)

check('the card hides what the server would refuse',
  client.includes("can('classes:update')"),
  'convenience only — requirePermission is the enforcement')

if (failures > 0) {
  console.error(`\n${failures} failure(s).`)
  process.exit(1)
}
console.log('\n✓ /classroom groups the existing screens, lists only live classes, and creates them through the one action that backfills.')
