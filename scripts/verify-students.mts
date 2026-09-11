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

// ---------------------------------------------------------------------------
// The pupil a teacher just created is on the screen they are returned to
// ---------------------------------------------------------------------------
/**
 * Phase 12 F1. `/enrollment` pushes to `/student-list` after a save; the roster
 * sorts oldest-first and pages at twenty, so on a class of thirty-five the
 * pupil a teacher had just spent forty fields creating was the last row of PAGE
 * TWO — present, correct, and off the screen. The toast said it had worked; the
 * screen showed a list the pupil was not in.
 *
 * Every link in that chain fails silently on its own: an action that stops
 * returning the id, a redirect that drops the parameter, a roster that reads it
 * and does nothing. So all three are checked.
 */
console.log('\nthe pupil you just created is findable:')

const createAction = code(join(root, 'app/(main)/enrollment/actions.ts'))
check('createStudent hands back the id it minted',
  /return \{ success: true, studentId: createdId \}/.test(createAction),
  'without an id the roster has nothing to look for')
check('...on the legacy path too, not only under v2',
  (createAction.match(/\.insert\(row\)\s*\n?\s*\.select\('id'\)/g) ?? []).length >= 1 &&
  createAction.includes('createdId = created?.id ?? null'),
  'a pre-V2 account creates pupils through the same form and deserves the same answer')

const enrolClient = code(join(root, 'app/(main)/enrollment/page.tsx'))
check('the redirect names the new pupil',
  /\/student-list\?new=\$\{encodeURIComponent\(createdId\)\}/.test(enrolClient),
  'the parameter is what tells the roster which page to open')
check('...through classHref, so the class travels with it',
  /classHref\(`\/student-list\?new=/.test(enrolClient),
  'a hand-built query string here would drop ?class= and land on another roster')
check('...and falls back to the plain roster when there is no id',
  enrolClient.includes('classHref("/student-list")'),
  'never the string "null" in the address bar')

const rosterClient = code(join(root, 'app/(main)/student-list/StudentTableClient.tsx'))
check('the roster reads the parameter', rosterClient.includes("searchParams.get('new')"))
check('...pages to the pupil rather than leaving them off-screen',
  rosterClient.includes('setCurrentPage(Math.floor(index / pageSize) + 1)'))
/**
 * THE SUBTLE ONE. `visible` is the sorted, filtered list actually rendered;
 * `students` is the raw roster. They differ by sort, by search and by every
 * filter in the sidebar, so a page number derived from the raw array is the
 * right index of the wrong list — and lands a teacher one page away from the
 * pupil while looking like it worked.
 */
check('...computed against the list it RENDERS, not the raw roster',
  /const index = visible\.findIndex\(/.test(rosterClient),
  'students.findIndex here would be correct on an unsorted, unfiltered class only')
check('...and consumes the parameter, so a refresh does not re-announce it',
  rosterClient.includes("params.delete('new')"))
/**
 * And exactly one effect writes the query string. A second one deleting `new`
 * beside the search-sync effect does not work: both read `searchParams` from
 * the same render, so the search sync rebuilds the query from a value that
 * still contains `new` and puts it straight back. Observed, not theorised.
 */
check('...from the ONE effect that owns the query string',
  (rosterClient.match(/router\.replace\(/g) ?? []).length === 1,
  'two effects writing one URL is a race the last one declared wins')

/** Never colour alone, on either view — and the grid is the phone default. */
check('the announcement is a live region, not only a toast',
  rosterClient.includes('role="status"') && rosterClient.includes('បានបញ្ចូល'),
  'a toast is gone in four seconds and is announced to nobody')
check('the table row carries the word as well as the tint',
  code(join(root, 'components/ui/views/StudentCompactTable.tsx')).includes('ទើបបញ្ចូល'))
check('and so does the card, which is the default view on a phone',
  code(join(root, 'components/ui/views/StudentCard.tsx')).includes('ទើបបញ្ចូល'))
check('the mark is distinct from the pupil\'s own សិស្សថ្មី flag',
  code(join(root, 'components/ui/views/StudentCard.tsx')).includes('is_new_student') &&
  code(join(root, 'components/ui/views/StudentCard.tsx')).includes("label: 'ទើបបញ្ចូល'"),
  'one is a fact about the year, the other about the last few seconds')

// ---------------------------------------------------------------------------
// Enrolling a pupil asks for what the pupil needs
// ---------------------------------------------------------------------------
/**
 * Phase 15. The form used to gate saving on the child's birth VILLAGE: a
 * teacher who had filled every column `students` declares `NOT NULL` pressed
 * save, was refused, and was sent to four dependent dropdowns. Measured on a
 * phone: ៥/៩ required, four errors, 7.2 screens of form.
 *
 * The requirement was the form's own — all four birth columns are nullable —
 * and the repository's own fixture inserts pupils with no address at all.
 */
console.log('\nenrolling a pupil asks for what the pupil needs:')

const formState = await import('../app/(main)/enrollment/formState.ts')
const sections = formState.SECTIONS as { id: string; required: string[]; optional: string[] }[]
const requiredFields = formState.REQUIRED_FIELDS as string[]

/**
 * The five the DATABASE requires. Kept as a literal on purpose: if a migration
 * makes another column NOT NULL, this check should fail and be updated
 * deliberately rather than tracking the form.
 */
const DB_REQUIRED = ['studentId', 'grade', 'studentName', 'gender', 'dob']
check('the form requires exactly what the database does',
  requiredFields.length === DB_REQUIRED.length &&
  DB_REQUIRED.every((f) => requiredFields.includes(f)),
  `required: ${requiredFields.join(', ')}`)

const addresses = sections.find((sec) => sec.id === 'addresses')
check('the birthplace does not gate a pupil\'s record',
  addresses?.required.length === 0,
  'birth_province/district/commune/village are all is_nullable = YES')
check('...and none of those fields was deleted to achieve that',
  (['birthProvince', 'birthDistrict', 'birthCommune', 'birthVillage'] as const)
    .every((f) => addresses?.optional.includes(f)),
  'a teacher who has the information must still be able to enter it')

check('and the four fields no longer render a required marker',
  !/LocationField label="[^"]+" required error=\{errors\.birth/.test(enrolClient),
  'the asterisk and the rule have to agree')

/** The class is known; re-keying it is how `students.grade` drifts from the enrolment. */
check('a new pupil\'s class is prefilled, not typed',
  enrolClient.includes('setClassPrefilled(true)') && enrolClient.includes('set("grade", className)'))
check('...only for a NEW pupil — an edit shows the stored value',
  /if \(!editingId && !classPrefilled/.test(enrolClient))
check('...and never over something already typed or restored from a draft',
  /!classPrefilled && contextMatchesTarget && className && !values\.grade/.test(enrolClient),
  'the enrollmentDraft restore must survive this')
/**
 * The trap this walked into once. `className` is TeacherContext's, and `?class=`
 * reaches that context through `ClassParamSync` — an effect, one render later.
 * Prefilling on the first render with a name writes the teacher's DEFAULT class:
 * arriving at `/enrollment?class=<៤ខ តេស្ត>` filled the box with ៤ក.
 */
check('...and waits for the context to catch up with ?class=',
  enrolClient.includes('contextClassId === activeClassId'),
  'prefilling before ClassParamSync runs writes the default class, not the requested one')

/** Edit is not transfer, and the sentence that says so now has a door. */
check('edit mode still says it does not move the pupil',
  enrolClient.includes('ការកែនេះមិនប្តូរថ្នាក់របស់សិស្សទេ'))
check('...and points at where a transfer actually happens',
  /href=\{`\/students\/\$\{editingId\}`\}/.test(enrolClient),
  'naming "the transfer" without saying where it is leaves the teacher to hunt')
check('the two paths are still genuinely separate',
  enrolClient.includes('updateStudent(editingId') && enrolClient.includes('createStudent('),
  'they must not be merged into one write — see the transfer panel')

/** A teacher is never shown the database's own words. */
check('the save fallback does not print the raw error',
  !/មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ \$\{error\.message\}/
    .test(code(join(root, 'app/(main)/enrollment/actions.ts'))))
check('...and logs it instead',
  code(join(root, 'app/(main)/enrollment/actions.ts')).includes("logger.error('enrollment save:'"))

console.log(
  failures === 0
    ? '\n✓ pupils: one profile, one enrolment rule, one document index.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
