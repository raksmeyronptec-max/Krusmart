/**
 * The dashboard answers for one class, one period, with nobody else's numbers.
 *
 *     node scripts/verify-dashboard.mts
 *
 * The dashboard is the only screen that summarises every other one, which makes
 * it the easiest place in the product to end up with a private arithmetic: it
 * has the rows in hand, the figure is one loop away, and nothing visibly breaks
 * when that loop answers a slightly different question from the screen the
 * teacher opens next. It had two of those:
 *
 *   THE MONTH THAT WAS A YEAR   the tile read "មធ្យមភាគប្រចាំខែ" and folded the
 *                               whole academic year into one bucket per pupil
 *                               keyed by subject, so a later month silently
 *                               overwrote an earlier one — over a query with no
 *                               ORDER BY, which made the figure unstable between
 *                               two refreshes with no data changing.
 *
 *   THE PASS MARK THAT WAS 5    the attention line said "ក្រោម ៥" whatever the
 *                               class's scheme was, so a secondary class marked
 *                               out of 50 was described by the primary rule.
 *
 * Both are now sourced. This pins them, and pins the completion figure to the
 * same `subjectProgress` `/score/collect` counts with — one question, one
 * answer, on two screens.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

const { completionSummary, isMarked, subjectProgress } =
  await import('../lib/scores/completion.ts')

const root = fileURLToPath(new URL('../', import.meta.url))

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const read = (p: string) => readFileSync(join(root, p), 'utf8')
/** Comments stripped — several checks below are absences, and a file that
 *  explains why it no longer does a thing mentions the thing. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const queries = 'app/(main)/dashboard/queries.ts'
const page = 'app/(main)/dashboard/page.tsx'

// ------------------------------------------------- 1. the month is a month
console.log('\n1. the monthly figure is one period, resolved from the calendar:')

check('the average is bucketed by month before it is read out',
  read(queries).includes('monthlyAveragesByStudent(') && read(queries).includes('monthIdFromPeriod('),
  'the same shared mean /score/total and /ranking compose their semesters from')
check('the current period comes from the class calendar, not from `new Date().getMonth()`',
  read(queries).includes('periodForDate(calendar') && read(queries).includes('fetchScoreCalendar('))
check('a merged period contributes every month it covers',
  read(queries).includes('currentPeriod?.members'),
  'a school grading មីនា–មេសា as one period must be averaged over both')

// The exact shape of the old private arithmetic: one flat bucket per pupil,
// keyed by subject, filled from every row the year-wide read returned.
check('the year-wide rows are no longer folded into one bucket per pupil',
  !/bucket\[row\.subject\] = v/.test(code(queries)),
  'that let December overwrite November, in an order the query never fixed')

check('the tile names the period it is showing',
  read(page).includes('stats.periodLabel'),
  'a figure labelled ប្រចាំខែ must say which month')

// ------------------------------------------------ 2. nothing is hard-coded
console.log('\n2. the thresholds are the class’s, not literals:')

check('the struggling count uses the scheme’s pass mark',
  read(queries).includes('grading.scheme.passMark'))
check('and the sentence quotes it rather than saying ៥',
  !/មធ្យមភាគក្រោម ៥/.test(code(queries)),
  'a /50 secondary class passes at 25')

// -------------------------------------------- 3. completion is not re-derived
console.log('\n3. marking progress is counted once, for two screens:')

check('the dashboard counts with subjectProgress',
  read(queries).includes('subjectProgress(') && read(queries).includes('completionSummary('))
check('and so does /score/collect',
  read('app/(main)/score/collect/actions.ts').includes('subjectProgress('))
check('/score/collect no longer indexes marks itself',
  !/const byColumn = new Map/.test(code('app/(main)/score/collect/actions.ts')),
  'the counting rules moved to lib/scores/completion.ts')

/*
 * ...and both count the subjects the class TEACHES.
 *
 * Both surfaces fed `subjectProgress` the unnarrowed template. For a class
 * teaching three subjects out of a thirty-five-subject curriculum, the
 * attention list read "៣៥ មុខវិជ្ជា មិនទាន់បញ្ចូលពិន្ទុគ្រប់" and the bar was
 * pinned at ៩% — it could not reach 100% because `/score/enter`'s grid narrows
 * by `class_template_subjects` and the other thirty-two cannot be marked at
 * all. The same shape as the `/ranking` divergence Phase 1 closed.
 *
 * Progress and averages are two questions: `taughtSubjects` answers the first,
 * `subjects` still answers the second, and the split lives in
 * `ServerGradingContext` so neither screen decides it alone.
 */
check('the dashboard counts progress over taughtSubjects',
  read(queries).includes('subjectProgress(grading.taughtSubjects'),
  'grading.subjects is the whole curriculum — the bar would never reach 100%')
check('...and still averages over the whole curriculum',
  !/monthlyAveragesByStudent\([^)]*taughtSubjects/.test(code(queries)),
  'narrowing a template must never narrow an average')
check('/score/collect narrows by the class selection too',
  code('app/(main)/score/collect/actions.ts').includes('applySelection(resolveTemplate('),
  'the two completion surfaces must count the same subjects')
check('ServerGradingContext carries both lists, so neither screen decides alone',
  read('lib/utils/serverScope.ts').includes('taughtSubjects: applySelection(subjects, selection)'))

const subjects = [
  { subjectKey: 'khmer_all', labelKm: 'ភាសាខ្មែរ', columns: [{ id: 'kh_read' }, { id: 'kh_write' }] },
  { subjectKey: 'math_general', labelKm: 'គណិត', columns: [{ id: 'math_num' }] },
  { subjectKey: 'sci', labelKm: 'វិទ្យា', columns: [{ id: 'sci' }] },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
] as any

const progress = subjectProgress(subjects, [
  { student_id: 'a', subject: 'kh_read', score_value: 8 },
  { student_id: 'a', subject: 'kh_write', score_value: 7 },
  { student_id: 'b', subject: 'kh_read', score_value: 6 },
  // A Khmer word, not a number — the `sem_eval_*` shape.
  { student_id: 'a', subject: 'math_num', score_value: null, score_text: 'ល្អ' },
], 2)

check('a multi-column subject counts a pupil once',
  progress[0].entered === 2 && progress[0].status === 'complete')
check('a Khmer-word mark counts as a mark',
  progress[1].entered === 1 && progress[1].status === 'partial')
check('an untouched subject is 0 of the ROSTER, not 0 of 0',
  progress[2].entered === 0 && progress[2].total === 2 && progress[2].status === 'empty')
check('an empty cell is not a mark',
  !isMarked({ student_id: 'a', subject: 'x', score_value: null, score_text: '' }))

const summary = completionSummary(progress)
check('the percentage is cells entered over cells expected', summary.percent === 50)
check('and the three states add up to the subject count',
  summary.complete + summary.partial + summary.empty === summary.subjects)
check('no roster and no subjects is 0%, never NaN',
  completionSummary([]).percent === 0)

// A subject can exceed its roster when a pupil leaves mid-period.
const over = completionSummary([
  { subjectKey: 'k', label: 'k', entered: 43, total: 42, status: 'complete', contributorIds: [] },
])
check('a subject over its roster cannot push the bar past 100%', over.percent === 100)

// ------------------------------------------------------- 4. it is one class
console.log('\n4. every figure and every link is about the same class:')

check('the figures are scoped by the resolved class',
  read(queries).includes('resolveServerScope(user.id, requestedClassId)'))
check('the page names that class before any number',
  read(page).includes('stats.className'))
check('and every link inherits it',
  read(page).includes('withClassParam(target, stats.classId)'))

// ------------------------------------------------------ 5. recent activity
console.log('\n5. the activity feed is readable and legible:')

check('a teacher may read their own audit rows',
  read('supabase/migrations/00030_audit_logs_select_own.sql').includes('actor_id = auth.uid()'),
  'the only SELECT policy before 00030 was is_school_admin — the feed would be empty for every teacher')
check('the migration adds no UPDATE or DELETE policy',
  !/FOR\s+(UPDATE|DELETE)/i.test(read('supabase/migrations/00030_audit_logs_select_own.sql')),
  'the trail must stay append-only')
check('the read is also filtered by actor, not left to the policy alone',
  read(queries).includes("eq('actor_id', user.id)"))
check('consecutive identical actions are folded',
  read(queries).includes('run.action === row.action'),
  'saving the same grid eight times must not push yesterday off the screen')
check('the number said comes from metadata.count, not from counting rows',
  read(queries).includes('metadata?.count'),
  'auditLogBatch writes ONE row carrying count: 40 — counting rows reports "1 cell" for a class of forty')
check('every label maps an action the code actually writes',
  ['score.updated', 'attendance.updated', 'student.imported', 'report.generated',
   'class_template.selection_applied', 'profile.section_saved.personal',
  ].every((a) => read(queries).includes(`'${a}'`)),
  'the AuditAction union ends in (string & {}) and so documents nothing — these came from call sites')
check('an unmapped action is dropped rather than printed raw',
  read(queries).includes('if (label) out.push('))

console.log(
  failures === 0
    ? '\n✓ the dashboard reports one class, one period, and no arithmetic of its own.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
