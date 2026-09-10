/**
 * The pupil is one subject, not six screens — and every document about them is
 * findable in one place.
 *
 *     node scripts/verify-students.mts
 *
 * Two properties, both of which regress by omission rather than by breakage:
 *
 *   1. DISCOVERY.  Every printable screen in the teacher app must be catalogued
 *                  in the Print Center, or explicitly excluded here. Four
 *                  student documents and two class-administration ones were
 *                  reachable *only* as items in a navigation module — which is
 *                  the competing document menu §8 forbids, and which meant a
 *                  teacher who opened the one place documents are supposed to
 *                  live found six families and none of them held the ID cards.
 *                  A new printable screen must show up here as a failure, not
 *                  as a page nobody can find.
 *
 *   2. AGGREGATION. `/students/[id]` must answer identity, enrolment,
 *                  attendance, marks, homework and performance in one place,
 *                  and take the pupil's class from their *enrolment* rather
 *                  than from `students.grade` — a free-text column that goes
 *                  stale the moment a pupil is promoted.
 *
 * Source is parsed, not imported: these are `.tsx` screens, and what needs
 * guarding is whether a file still does a thing at all.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

type ResolveResult = { url: string; shortCircuit?: boolean }
type NextResolve = (specifier: string, context: unknown) => ResolveResult
const registerHooks = (
  nodeModule as unknown as {
    registerHooks?: (hooks: {
      resolve: (specifier: string, context: unknown, next: NextResolve) => ResolveResult
    }) => void
  }
).registerHooks

if (!registerHooks) {
  console.error('needs node 22.15+ for module.registerHooks')
  process.exit(1)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const base = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), new URL('../', import.meta.url))
      : specifier.startsWith('.')
        ? new URL(specifier, (context as { parentURL?: string }).parentURL ?? import.meta.url)
        : null
    if (base && !existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const candidate = new URL(base.href + ext)
        if (existsSync(candidate)) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
})

const { REPORT_CATEGORIES, REPORT_DEFINITIONS, reportsByCategory } =
  await import('../lib/reporting/report-types.ts')
const { NAV_MODULES, moduleForPath } = await import('../lib/navigation.ts')

const root = fileURLToPath(new URL('../', import.meta.url))
const MAIN = join(root, 'app', '(main)')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const read = (p: string) => readFileSync(p, 'utf8')

/**
 * Executable code only — comments explain the rules, they cannot break them.
 *
 * The `/*` must follow a delimiter or start a line: a naive pattern also
 * matches the one inside `accept="image/*"` and then runs to the next real
 * `*\/`, swallowing whatever the check was looking for. See
 * scripts/verify-page-frame.mts.
 */
const code = (p: string) =>
  read(p)
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^[ \t]*\/\/.*$/gm, '')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const files = walk(MAIN)

/** `app/(main)/id-student/IdStudentClient.tsx` → `/id-student`. */
function routeOfFile(file: string): string {
  const rel = relative(MAIN, file).replace(/\\/g, '/')
  const dir = rel.slice(0, rel.lastIndexOf('/'))
  const segments = dir.split('/').filter((sg) => sg && !sg.startsWith('[') && !sg.startsWith('('))
  return '/' + segments.join('/')
}

// ----------------------------------------------------------- 1. discovery
console.log('\n1. every printable screen is findable in the Print Center:')

/**
 * Printable screens that are deliberately NOT reports.
 *
 * Recorded here rather than left implicit, because "it is not a report" is a
 * product judgement and the next person deserves to see it was made:
 *
 *   the room, not the class   the cleaning rota and the equipment inventory are
 *                             about the physical classroom. The Print Center
 *                             indexes documents about pupils and their results.
 *   an entry grid that prints  `/homework/enter` and `/score-analyse` print
 *                             what is on screen as a convenience; neither is a
 *                             document a teacher goes looking for by name.
 *   already catalogued elsewhere `/score/total` prints through `ScoreTotalPrint`
 *                             and is catalogued as `score_monthly`/`_semester`.
 *
 * To add a screen here you have to state which of those it is.
 */
const NOT_DOCUMENTS: Record<string, string> = {
  '/cleaning-schedule': 'the room, not the class',
  '/inventory': 'the room, not the class',
  '/homework/enter': 'an entry grid that prints',
  '/score-analyse': 'an entry grid that prints',
  '/score/total': 'catalogued as the monthly/semester score sheets',
}

const printable = new Set(
  files.filter((f) => read(f).includes('window.print()')).map(routeOfFile),
)
const catalogued = new Set(
  REPORT_DEFINITIONS.map((r) => r.legacyHref).filter((h): h is string => h !== null),
)

const missing = [...printable]
  .filter((r) => !catalogued.has(r) && !(r in NOT_DOCUMENTS))
  .sort()
check(
  'no printable screen is missing from the catalogue',
  missing.length === 0,
  missing.length
    ? `catalogue these, or record why they are not documents in NOT_DOCUMENTS:\n      ${missing.join('\n      ')}`
    : '',
)

const staleExclusions = Object.keys(NOT_DOCUMENTS).filter((r) => !printable.has(r)).sort()
check(
  'and no exclusion outlives the screen it excused',
  staleExclusions.length === 0,
  staleExclusions.join(', '),
)

check(
  'every catalogued legacy screen actually exists',
  [...catalogued].every((href) => existsSync(join(MAIN, href.replace(/^\//, ''), 'page.tsx'))),
  [...catalogued].filter((h) => !existsSync(join(MAIN, h.replace(/^\//, ''), 'page.tsx'))).join(', '),
)

check(
  'no category is empty — an empty family is a dead end',
  REPORT_CATEGORIES.every((c) => reportsByCategory(c.id).length > 0),
)

/**
 * A `legacy_only` entry must not claim a resolver, and an entry with no
 * resolver must have a screen — otherwise `reportAvailability` lands on
 * `not_implemented` and the card offers nothing at all.
 */
const emptyPromises = REPORT_DEFINITIONS.filter((r) => !r.resolver && !r.legacyHref)
check(
  'no catalogued report is both resolver-less and screen-less',
  emptyPromises.length === 0,
  emptyPromises.map((r) => r.type).join(', '),
)

// ---------------------------------------------------- 2. the students module
console.log('\n2. the students module lists management, not paperwork:')

const students = NAV_MODULES.find((m) => m.id === 'students')
check('the students module exists', Boolean(students))

const visible = (students?.children ?? []).filter((c) => !c.hidden)
check(
  'it shows four entries, not eight',
  visible.length === 4,
  visible.map((c) => c.href).join(', '),
)
check(
  'and one of them is the Print Center’s student family',
  visible.some((c) => c.href === '/print-center?category=student'),
)

/**
 * The four document routes moved out of the visible list must still resolve —
 * `hidden`, not deleted. `/student-list`'s own toolbar links `/print-list`, and
 * a route the navigation cannot resolve blanks the breadcrumb on arrival.
 */
for (const href of ['/id-student', '/print-student-codes', '/print-student-age', '/print-list', '/students']) {
  check(`${href} still resolves to a module`, moduleForPath(href)?.id === 'students')
}

check(
  'the Print Center validates ?category= against the catalogue',
  read(join(MAIN, 'print-center/page.tsx')).includes('REPORT_CATEGORIES.some('),
  'an unknown category must open the index, never an empty screen',
)

// ------------------------------------------------------- 3. the pupil, whole
console.log('\n3. /students/[id] is the pupil whole:')

const profile = read(join(MAIN, 'students/[id]/page.tsx'))
const profileQueries = read(join(MAIN, 'students/[id]/queries.ts'))

for (const [what, needle] of [
  ['identity', 'name_kh'],
  ['enrolment', 'enrolments'],
  ['attendance', 'attendance'],
  ['marks', 'subjects'],
  ['homework', 'homework'],
  ['performance', 'overallAverage'],
] as const) {
  check(`it shows ${what}`, profile.includes(needle))
}

check(
  'the class comes from the enrolment, with students.grade only as a fallback',
  profile.includes('current ? <> · ថ្នាក់ {current.className}</>'),
  'students.grade is free text and goes stale the moment a pupil is promoted',
)
check(
  'the enrolment history is resolved through the shared scope helper',
  profileQueries.includes("enrolmentHistory") &&
    read(join(root, 'lib/utils/serverScope.ts')).includes('export async function enrolmentHistory'),
)
check(
  'and currentEnrolment is derived from that same history, not a second query',
  /export async function currentEnrolment[\s\S]{0,400}?await enrolmentHistory\(/.test(
    read(join(root, 'lib/utils/serverScope.ts')),
  ),
  'two queries with the same intent drift; the page would link to one class and grade against another',
)
check(
  'its links carry the pupil’s own class, not the ambient one',
  profile.includes('withClassParam(target, classId)'),
)

// ---------------------------------------------------------- 4. enrolling
console.log('\n4. enrolling a pupil says which class receives them:')

const enrollment = read(join(MAIN, 'enrollment/page.tsx'))
check(
  'the form names the target class',
  enrollment.includes('សិស្សនឹងចូលក្នុងថ្នាក់'),
  'a misplaced pupil is corrected by a transfer, not by an edit',
)
check(
  'and every redirect out of it keeps that class',
  !/router\.push\("\/student-list"\)/.test(enrollment)
    && enrollment.includes('classHref("/student-list")'),
)
check(
  'the class it writes into is still the URL param first, context second',
  enrollment.includes('urlSearchParams.get(CLASS_PARAM) ?? contextClassId'),
  'onboarding links here as /enrollment?class=<id> before TeacherContext hydrates',
)

// ------------------------------------------------------------ 5. correcting
console.log('\n5. a pupil can be corrected without being destroyed:')

/**
 * Until `updateStudent` existed, NO surface in the product could change a
 * pupil's record — not the teacher app, not the admin console, not the parent
 * portal. The only `students` update anywhere was `order_index`, for dragging
 * the roster into order.
 *
 * So a typo in a name had exactly one remedy: delete the pupil and enter them
 * again. That mints a new `students.id` and orphans every score, attendance row
 * and enrolment attached to the old one. Meanwhile `/student-list` had shown a
 * pencil on every row since it was built, pushing `?edit=true` — a parameter
 * `/students/[id]` has never read.
 */
const enrolActions = read(join(MAIN, 'enrollment/actions.ts'))

check('an update path exists at all',
  enrolActions.includes('export async function updateStudent('),
  'without one, correcting a name means deleting the pupil and their whole history')
check('it is owner-guarded, like every other write in the file',
  /\.update\(fields\)[\s\S]{0,160}?\.eq\('teacher_id', user\.id\)/.test(enrolActions),
  'a subject teacher may READ a colleague\'s pupils (00006); editing one is not reading it')
check('and it reads the result back, so a blocked update is not a success toast',
  /\.select\('id'\)[\s\S]{0,400}?updated\.length === 0/.test(enrolActions),
  'Postgres reports a policy-blocked UPDATE as zero rows affected, never as an error')

/**
 * An edit is not a transfer. This product's rule is that a misplaced pupil is
 * corrected by moving them, which is a different operation with its own
 * history — so the update must not touch a class, an enrolment or the owner.
 */
const updateBody = enrolActions.slice(enrolActions.indexOf('export async function updateStudent('))
for (const [what, needle] of [
  ['a class', 'class_id'],
  ['an enrolment row', 'student_enrollments'],
  ['the owning teacher', 'teacher_id: user.id'],
] as const) {
  check(`it writes ${what}: no`, !updateBody.includes(needle),
    'an edit that could do this would be a transfer, or a hand-over, in disguise')
}

check('create and update share one field mapper',
  (enrolActions.match(/studentFieldsFromForm\(formData\)/g) ?? []).length === 2,
  'thirty columns extracted twice by hand is how one path stops saving a field the other writes')
check('and the mapper cannot set the ownership guard',
  /function studentFieldsFromForm[\s\S]{0,2600}?^}/m.test(enrolActions) &&
    !/function studentFieldsFromForm[\s\S]{0,2600}?teacher_id/m.test(enrolActions))

/** The dead affordance that started this. */
const roster = read(join(MAIN, 'student-list/StudentTableClient.tsx'))
const rosterCode = code(join(MAIN, 'student-list/StudentTableClient.tsx'))
check('the roster pencil opens the editor, not a parameter nobody reads',
  rosterCode.includes('/enrollment?student=') && !rosterCode.includes('?edit=true'))
check('and the pupil page offers the same edit',
  read(join(MAIN, 'students/[id]/page.tsx')).includes('/enrollment?student='))

/**
 * The draft is a half-finished NEW pupil. Restoring it over a real record would
 * overwrite thirty fields with another child's details, one Save from being
 * persisted; writing an edit INTO it would offer this pupil's record back to
 * whoever next enrols someone.
 */
const enrolForm = read(join(MAIN, 'enrollment/page.tsx'))
check('a draft is never offered while editing',
  enrolForm.includes('dirty || isEditing ? null : storedDraft'))
check('and an edit is never written into one',
  enrolForm.includes('if (!dirty || isEditing) return'))
check('the form loads a record with `load`, not by faking a draft',
  enrolForm.includes("dispatch({ type: 'load'") &&
    read(join(MAIN, 'enrollment/formState.ts')).includes("case 'load':"))
check('and says it will not move the pupil',
  enrolForm.includes('ការកែនេះមិនប្តូរថ្នាក់របស់សិស្សទេ'))

/** Bulk import, from where a teacher looking at an empty roster actually is. */
check('import is reachable from the roster, not only from the add-one form',
  roster.includes('/enrollment?import=1'),
  'it existed only inside the form for adding a single pupil')

// ------------------------------------------------------------- 6. moving
console.log('\n6. a pupil can be moved, by one write with two doors:')

/**
 * The lifecycle actions existed the whole time — in `app/admin/enrollments/`,
 * behind `requirePermission('enrollments:update')` and the console's
 * `isSchoolAdmin` gate. A teacher who JOINED a school holds exactly `teacher`
 * (00022: "approval never grants admin"), so for them that was not a longer
 * route to the feature; it was a closed door. They could create classes (00031)
 * and enrol pupils, and then not undo a misplacement.
 */
const sharedMove = read(join(root, 'lib/enrolment/move.ts'))
const adminEnrol = read(join(root, 'app/admin/enrollments/actions.ts'))
const teacherEnrol = read(join(MAIN, 'students/[id]/actions.ts'))

check('the close-then-open sequence lives in one module',
  sharedMove.includes('export async function moveEnrolment('))
for (const [who, src] of [['the admin console', adminEnrol], ['the teacher app', teacherEnrol]] as const) {
  check(`${who} calls it rather than repeating it`, src.includes('moveEnrolment('))
}
check('and neither re-implements the close',
  ![adminEnrol, teacherEnrol].some((src) => src.includes("status: closingStatus")),
  'two paths that mean the same thing drift — one forgets to close, or to audit')

/**
 * The shared write authorises NOBODY. That is the point: a shared write that
 * quietly applied one caller's rule would silently widen or narrow the other.
 */
const sharedMoveCode = code(join(root, 'lib/enrolment/move.ts'))
check('the shared write performs no authorisation of its own',
  !sharedMoveCode.includes('requirePermission') && !sharedMoveCode.includes('is_school_admin'),
  'every caller checks first; RLS remains the boundary underneath both')
check('the admin door is the permission',
  adminEnrol.includes("requirePermission('enrollments:update')"))
check('the teacher door is homeroom of BOTH ends',
  (teacherEnrol.match(/isHomeroomOf\(/g) ?? []).length >= 3,
  'leaving requires the source class, joining requires the destination')
check('and ownership stands in when there is no enrolment to leave',
  teacherEnrol.includes(".eq('teacher_id', user.id)"),
  'otherwise "transfer a pupil with no enrolment into my class" acquires one')

/** Append-only: the row being left is history, never deleted. */
check('the old enrolment is closed, not deleted',
  sharedMove.includes("left_at: new Date().toISOString()") && !sharedMove.includes(".delete()"))
check('and a policy-blocked close is not reported as success',
  sharedMove.includes('closed.length === 0'),
  'zero rows affected is how Postgres refuses an UPDATE — the pupil would end up enrolled twice')
check('a teacher transfer never stamps `promoted`',
  teacherEnrol.includes("closingStatus: 'transferred'") && !teacherEnrol.includes("'promoted'"),
  'promotion is a year-end decision made across a class, not a side effect of fixing a typo')

console.log(
  failures === 0
    ? '\n✓ pupils: one profile, one enrolment rule, one document index.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
