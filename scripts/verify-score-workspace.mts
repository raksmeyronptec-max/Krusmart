/**
 * The score workspace: one vocabulary, one set of doors, one arithmetic.
 *
 *     node scripts/verify-score-workspace.mts
 *
 * Marking a class is one job spread over seven screens. Three things kept them
 * from behaving like one, and each of them regresses quietly — the page renders
 * and the numbers look plausible:
 *
 *   1. THE WORDS.    `/score/enter` said ពិន្ទុប្រចាំខែ, `/score/total` said
 *                    ប្រចាំខែ, `/ranking` said `yearly` for what the schema, the
 *                    shared layer and the report all call `annual`. A teacher
 *                    crossing between them had to re-map the vocabulary.
 *
 *   2. THE SCOPE.    The score-fetching actions resolved the caller's *default*
 *                    class whenever they were not told which one, while the
 *                    pages resolved `?class=`. A teacher with two classes saw
 *                    one class's pupils beside the other class's marks.
 *
 *   3. THE DOORS.    Tabs must carry the period only where the destination
 *                    reads one; carrying it elsewhere puts a claim in the
 *                    address bar the page does not honour.
 *
 * The pure half is imported and run. The screens are `.tsx`, which this node
 * harness cannot import, so those are asserted by reading the source — which is
 * the right tool anyway: what needs guarding is that a file does not grow a
 * private copy of a shared rule, and that is a statement about the text.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readFileSync } from 'node:fs'

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

const {
  SCORE_SCOPES, SCORE_WORKSPACE_TABS, isScoreScope, periodLabel, scopeLabel, workspaceTabHref,
} = await import('../lib/scores/workspace.ts')
const { deriveSemesterAverages } = await import('../lib/scores/annual.ts')
const { monthIdFromPeriod, monthlyAveragesByStudent, numericColumnKeys, FALLBACK_NUMERIC_KEYS } =
  await import('../lib/scores/aggregate.ts')
const { resolveTemplate, SYSTEM_PRIMARY_TEMPLATE } = await import('../lib/scores/template.ts')
const { DEFAULT_SCHEME_CONFIG } = await import('../lib/grading/scheme.ts')
const { subjectProgress, rosterProgress, completionSummary } = await import('../lib/scores/completion.ts')

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
 * A file with its comments removed.
 *
 * Several checks below are absences — "this screen no longer calls X" — and a
 * file that *explains why it no longer calls X* mentions X. Matching the raw
 * source there fails on its own documentation, which would train the next
 * person to delete the explanation rather than keep the property. So the
 * absence checks read code only.
 *
 * Deliberately crude: it does not understand a `//` inside a string literal.
 * That is fine for what it is used for — the alternative is a parser, and the
 * assertions are about whether a call appears at all, not about where.
 */
// The `/*` must follow a delimiter or start a line: a naive pattern also
// matches the one inside `accept="image/*"` and then runs to the next real
// `*/`, swallowing the code a check was looking for and passing it silently.
const code = (p: string) =>
  read(p)
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const enter = read('app/(main)/score/enter/ScoreEnterClient.tsx')
const total = read('app/(main)/score/total/ScoreTotalClient.tsx')
const ranking = read('app/(main)/ranking/RankingClient.tsx')
const totalActions = read('app/(main)/score/total/actions.ts')

// ------------------------------------------------------------- 1. the words
console.log('\n1. one vocabulary for the period ladder:')

check('the three rungs are named as `scores.score_type` names them',
  SCORE_SCOPES.map((s) => s.id).join(',') === 'monthly,semester,annual')
check('scopeLabel answers for each', SCORE_SCOPES.every((s) => scopeLabel(s.id).length > 0))
check('isScoreScope rejects the old `yearly` spelling',
  isScoreScope('annual') && !isScoreScope('yearly'))

check('a month reads as its own calendar label',
  periodLabel({ scope: 'monthly', monthLabel: 'មីនា-មេសា' }) === 'ខែមីនា-មេសា')
check('a semester reads through the shared semesterLabel',
  periodLabel({ scope: 'semester', semester: 'sem2' }) === 'ឆមាសទី២')
check('a year reads as ប្រចាំឆ្នាំ', periodLabel({ scope: 'annual' }) === 'ប្រចាំឆ្នាំ')

/**
 * The screens must not restate the ladder. Checked as an absence, because that
 * is the shape the drift took: three files each holding their own ternary over
 * the same three cases.
 */
check('the totals screen takes its labels from the shared vocabulary',
  total.includes("from '@/lib/scores/workspace'")
  && !/const modeLabel = currentMode === 'monthly' \? 'ប្រចាំខែ'/.test(
    code('app/(main)/score/total/ScoreTotalClient.tsx')))
check('no score screen still says `yearly`',
  ['app/(main)/ranking/RankingClient.tsx',
   'app/(main)/score/total/ScoreTotalClient.tsx',
   'app/(main)/score/enter/ScoreEnterClient.tsx',
  ].every((f) => !/'yearly'/.test(code(f))))

// ------------------------------------------------------------- 2. the scope
console.log('\n2. every score fetch names the class it is about:')

for (const fn of ['getAllScoresByPeriod', 'getAnnualAverages', 'getMonthlyScoresForYear']) {
  const sig = new RegExp(`export async function ${fn}\\([^)]*classId\\?: string\\)`)
  check(`${fn} accepts a classId`, sig.test(totalActions))
}
check('and none of them resolves the scope without one',
  !/resolveServerScope\(user\.id\)/.test(code('app/(main)/score/total/actions.ts')),
  'a bare resolveServerScope(user.id) silently falls back to the default class')

/**
 * Every client that reads marks must pass it. Listed explicitly rather than
 * derived: the point is that adding a *new* score screen is a deliberate act
 * that shows up here as a failing check rather than as a silent omission.
 */
const FETCHERS = [
  'app/(main)/score/enter/ScoreEnterClient.tsx',
  'app/(main)/score/total/ScoreTotalClient.tsx',
  'app/(main)/ranking/RankingClient.tsx',
  'app/(main)/certificate/CertificateClient.tsx',
  'app/(main)/honor-roll/HonorRollClient.tsx',
  'app/(main)/score/print/ScorePrintClient.tsx',
  // Moved out of `/score-analysis/subject` when that route became a redirect
  // and its screen became a view of `/score-analyse` — same component, same
  // fetches, so it stays on this list under its new home.
  'app/(main)/score-analyse/SubjectAnalysisView.tsx',
  'app/(main)/yearly-report/subject-results/SubjectResultsClient.tsx',
  'app/(main)/homework/enter/HomeworkEnterClient.tsx',
]
for (const file of FETCHERS) {
  const src = read(file)
  const calls = [...src.matchAll(/get(?:Scores|AllScoresByPeriod|MonthlyScoresForYear|AnnualAverages)\([^)]*\)/g)]
    .map((m) => m[0])
  const unscoped = calls.filter((c) => !/(scopeClassId|classId|previous)/.test(c))
  check(`${file.replace('app/(main)/', '')} scopes every fetch`,
    calls.length > 0 && unscoped.length === 0,
    unscoped.join('\n      '))
}

// ------------------------------------------------------------- 3. the doors
console.log('\n3. the tabs carry what they claim to carry:')

const withPeriod = { classId: 'c1', academicYear: '2026-2027', selection: { scope: 'semester' as const, semester: 'sem2' as const }, monthId: 'nov' }

for (const tab of SCORE_WORKSPACE_TABS) {
  const href = workspaceTabHref(tab, withPeriod)
  check(`${tab.id} carries the class`, href.includes('class=c1'))
  check(`${tab.id} ${tab.carriesPeriod ? 'carries' : 'omits'} the period`,
    tab.carriesPeriod === href.includes('mode='), href)
}

check('the entry grid has no annual rung, so a year arrives there as monthly',
  workspaceTabHref(SCORE_WORKSPACE_TABS[0], { classId: 'c1', selection: { scope: 'annual' }, monthId: 'nov' })
    .includes('mode=monthly'))

/**
 * A tab declaring `carriesPeriod` must actually be read by its destination,
 * and one declaring the opposite must not silently start reading it — either
 * way the address bar and the page would be making different claims.
 */
const PAGE_FOR: Record<string, string> = {
  '/score/enter': 'app/(main)/score/enter/ScoreEnterClient.tsx',
  '/score/total': 'app/(main)/score/total/ScoreTotalClient.tsx',
  '/score/collect': 'app/(main)/score/collect/ScoreCollectClient.tsx',
  '/ranking': 'app/(main)/ranking/RankingClient.tsx',
  '/score-analyse': 'app/(main)/score-analyse/ScoreAnalyseClient.tsx',
}
for (const tab of SCORE_WORKSPACE_TABS) {
  const src = read(PAGE_FOR[tab.href])
  const readsMode = src.includes("searchParams.get('mode')")
  check(`${tab.id}'s page ${tab.carriesPeriod ? 'reads' : 'does not read'} ?mode=`,
    readsMode === tab.carriesPeriod)
}

check('the workspace header is worn by entry, totals and ranking',
  [enter, total, ranking].every((s) => s.includes('<ScoreWorkspaceHeader')))

// ----------------------------------------------------- 4. one configuration
console.log('\n4. subjects are configured in exactly one place:')

check('the entry screen no longer mints a subject',
  !code('app/(main)/score/enter/ScoreEnterClient.tsx').includes('addClassSubject'),
  '/score/subjects is the single configuration surface — see CLAUDE.md')
check('and it links there instead',
  enter.includes("classHref(\"/score/subjects\")"))
check('the configuration screen still owns the create action',
  read('app/(main)/score/subjects/ScoreSubjectsClient.tsx').includes('addClassSubject('))

// ------------------------------------------------- 5. one annual arithmetic
console.log('\n5. the shared derivation behaves:')

/*
 * The real primary scheme, not a stub: /10 with `weighting` absent, which is
 * the `simple` path where every subject weighs 1. A hand-written config would
 * be a second definition of the thing under test.
 */
const scheme = DEFAULT_SCHEME_CONFIG

const derived = deriveSemesterAverages({
  studentIds: ['a', 'b'],
  sem1Exams: [{ studentId: 'a', score: 9, maxScore: 10 }],
  sem2Exams: [{ studentId: 'a', score: 8, maxScore: 10 }],
  monthlyAverages: { a: { nov: 9, dec: 9, apr: 6, may: 6 } },
  sem1Months: ['nov', 'dec'],
  sem2Months: ['apr', 'may'],
  scheme,
})
check('exam 9 + coursework 9 -> 9', derived.a.sem1 === 9)
check('exam 8 + coursework 6 -> 7', derived.a.sem2 === 7)
check('a pupil with no marks at all is null, never 0',
  derived.b.sem1 === null && derived.b.sem2 === null)

const halfOnly = deriveSemesterAverages({
  studentIds: ['a'],
  sem1Exams: [{ studentId: 'a', score: 8, maxScore: 10 }],
  sem2Exams: [],
  monthlyAverages: {},
  sem1Months: ['nov'],
  sem2Months: ['apr'],
  scheme,
})
check('a missing HALF still counts as zero — the product rule, not re-decided here',
  halfOnly.a.sem1 === 4)

check('an unmarked month is absent, not zero',
  monthlyAveragesByStudent(
    [{ studentId: 'a', monthId: 'nov', score: 8, maxScore: 10 }], scheme,
  ).a.dec === undefined)
check('a month average is the mean of that month',
  monthlyAveragesByStudent([
    { studentId: 'a', monthId: 'nov', score: 8, maxScore: 10 },
    { studentId: 'a', monthId: 'nov', score: 10, maxScore: 10 },
  ], scheme).a.nov === 9)

check('the month id is sliced by the year, not by the first hyphen',
  monthIdFromPeriod('nov-2025-2026', '2025-2026') === 'nov')
check('and a homework period never parses as a month',
  monthIdFromPeriod('2025-2026_nov', '2025-2026') === null)

// ------------------------------------------- 6. the three league tables agree
console.log('\n6. ranking, honour and certificate are one question, one answer:')

/**
 * `/ranking`, `/honor-roll` and `/certificate` are three presentations of "how
 * did this class do in this period, and in what order". Each used to carry its
 * own copy of the answer, and all three copies had the same defect — two
 * `parseFloat`s off the always-empty `sem1_avg`/`sem2_avg` and a hand-counted
 * divisor. One bug written three times is one missing module.
 */
const LEAGUE = {
  ranking: 'app/(main)/ranking/RankingClient.tsx',
  honour: 'app/(main)/honor-roll/HonorRollClient.tsx',
  certificate: 'app/(main)/certificate/CertificateClient.tsx',
}
for (const [name, file] of Object.entries(LEAGUE)) {
  check(`${name} composes its period through buildPeriodResults`,
    read(file).includes('buildPeriodResults('))
  check(`${name} computes no average of its own`,
    !code(file).includes('studentAverage('),
    'the builder owns the arithmetic; the screen owns the layout')
}

/**
 * Eligibility, which §11 puts alongside score and ranking calculation in the
 * list of things a report and its source screen may NOT differ on.
 *
 * `/honor-roll` selected `.slice(0, 5)` after ranking — a property of the
 * podium's five cards, not a criterion. So a class where everybody failed still
 * produced five honourees, and the printed `honor` report (which has always
 * used `evaluateHonor`) named a different set of pupils from the screen it was
 * generated beside.
 */
const honourScreen = read(LEAGUE.honour)
check('the honour roll decides eligibility with evaluateHonor',
  honourScreen.includes('evaluateHonor(') && honourScreen.includes('defaultHonorCriteria('))
check('and no longer takes the top five as though that were a rule',
  !code(LEAGUE.honour).includes('const top5'))
check('the podium still holds five, with the rest listed rather than dropped',
  honourScreen.includes('alsoEligible'),
  'a layout that silently discards qualifying pupils has become a policy')
check('the rule is printed on the sheet, with its provenance',
  honourScreen.includes('criteriaLabel') && honourScreen.includes('HONOR_CRITERIA_PROVENANCE'),
  'the product has no official honour criterion — the sheet must not imply one')

// ------------------------------------ 7. the screens and the sheets agree on
//                                          WHICH SUBJECTS, not just on the sum
console.log('\n7. ranking ranks the subjects the class actually teaches:')

/**
 * §6 proves the three league tables share one *arithmetic*. This proves they
 * share one *input*, which is a separate property and was separately broken.
 *
 * `/ranking` resolved `templateRows` and stopped there, while `/score/total`
 * reads the hook's `classSubjects` and the engine's `resolveMonthlyClass` —
 * which backs `ranking_monthly`, `ranking_semester` and `ranking_annual` —
 * composes `applySelection(resolveTemplate(…))`. Same class, same period, same
 * builder, **different subject set**: a class holding a mark under a subject it
 * has since de-selected ranked on that mark on screen and not on the sheet
 * printed from it. Averages and order could both differ, which is exactly the
 * screen-vs-report disagreement §11 calls a P0.
 *
 * Asserted on all three surfaces together, because the property is a relation
 * between them and pinning any one alone would let the others drift.
 */
const NARROWING = {
  'the ranking screen': 'app/(main)/ranking/RankingClient.tsx',
  'the report engine': 'lib/reporting/report-data.ts',
}
for (const [name, file] of Object.entries(NARROWING)) {
  check(`${name} narrows the template with applySelection`,
    code(file).includes('applySelection('),
    'the class\'s curriculum is not the same list as the subjects it teaches')
}
check('/score/total reads the hook\'s already-narrowed classSubjects',
  code('app/(main)/score/total/ScoreTotalClient.tsx').includes('classSubjects:'))

const rankingSrc = code('app/(main)/ranking/RankingClient.tsx')
const engineSrc = code('lib/reporting/report-data.ts')

check('the ranking screen resolves its subjects in exactly one place',
  (rankingSrc.match(/resolveTemplate\(/g) ?? []).length === 1,
  'two resolutions in one screen is how the denominator and the maxima drift apart')
check('and its full marks come from that same narrowed resolution',
  rankingSrc.includes('maxScoreByColumn(narrowedTemplateFor('),
  'a narrowed subject list weighted by unnarrowed maxima is still two answers')

// -------------------------------- 7b. and the denominator is the SAME RULE
/**
 * §7 above proves the two surfaces narrow to the same subjects. This proves
 * they then count the same COLUMNS — which is a second property, and was
 * separately broken.
 *
 * There are two curriculum worlds. `FALLBACK_NUMERIC_KEYS` carries 29 monthly
 * and 13 semester primary columns; the compiled-in `SYSTEM_PRIMARY_TEMPLATE`
 * resolves 16 and 2. The screens gated on `levelCurriculum` and used the legacy
 * list for the untagged world; `resolveMonthlyClass` did not, and averaged a
 * legacy class over sixteen columns while the screen beside it used
 * twenty-nine — dropping every `sci_*`, `soc_*`, `pe_sport`, `health_hygiene`,
 * `life_skill` and `foreign` mark from the printed sheet.
 *
 * The rule is `periodDenominator` now. The strong property is not that both
 * call it — it is that NEITHER may express the gate itself, because a second
 * copy of a two-world rule is how the worlds come to disagree again.
 */
const fallbackMonthly = numericColumnKeys(resolveTemplate(SYSTEM_PRIMARY_TEMPLATE, 'monthly', null))
check('the compiled-in template really is narrower than the legacy denominator',
  fallbackMonthly.length < FALLBACK_NUMERIC_KEYS.monthly.length,
  `template ${fallbackMonthly.length} vs fallback ${FALLBACK_NUMERIC_KEYS.monthly.length}`)

check('the ranking screen takes its denominator from the shared rule',
  rankingSrc.includes('periodDenominator('))
check('and so does the report engine',
  engineSrc.includes('periodDenominator('))

for (const [name, src] of [['the ranking screen', rankingSrc], ['the report engine', engineSrc]] as const) {
  check(`${name} does not re-express the two-world gate`,
    !src.includes('FALLBACK_NUMERIC_KEYS') && !src.includes('numericColumnKeys('),
    'the gate belongs to periodDenominator alone — a second copy is a second answer')
}

check('and the rule itself still carries the gate',
  code('lib/scores/aggregate.ts').includes(
    'return levelCurriculum ? numericColumnKeys(subjects) : FALLBACK_NUMERIC_KEYS[mode]'),
  'without it a legacy account\'s denominator shrinks from 29 columns to 16, silently')

/**
 * The same asymmetry, in the other two things the engine derived from
 * `context.levelKey` while the screens derived them from what actually
 * resolved: the grading SCHEME, and whether there is a template at all.
 */
check('the report engine gates its scheme on the resolved curriculum, as the screens do',
  engineSrc.includes('levelCurriculum ? schemeForLevel(context?.levelKey) : schemeForLevel(null)'),
  'a class with a level but no seeded rows graded /50 on paper and /10 on screen')
check('and falls back to the compiled-in template when the seeds have not run',
  engineSrc.includes('templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE'),
  'without it every report printed a blank sheet while the screens rendered normally')

// ---------------------------- 8. one progress figure, for all three screens
console.log('\n8. marking progress is counted once, not once per screen:')

/**
 * `lib/scores/completion.ts` says progress is "counted once for two screens".
 * There were three: `/score/enter` carried its own copy, and the copy used a
 * different rule — a pupil was entered when a NUMERIC cell in a NON-`select`
 * column had a value. `isMarked` counts `score_text` too, because the
 * `sem_eval_*` columns are Khmer words (00012).
 *
 * So a pupil carrying only a rating read as DONE on `/score/collect` and the
 * dashboard, and as NOT STARTED on the screen the teacher was typing into.
 */
const PROGRESS_CONSUMERS = {
  'the entry grid': 'app/(main)/score/enter/ScoreEnterClient.tsx',
  'the collection view': 'app/(main)/score/collect/actions.ts',
  'the dashboard': 'app/(main)/dashboard/queries.ts',
}
for (const [name, file] of Object.entries(PROGRESS_CONSUMERS)) {
  check(`${name} reads lib/scores/completion`,
    code(file).includes("from '@/lib/scores/completion'"))
}
check('the entry grid counts no pupils of its own',
  !/if \(entries\.some\(e => e\.score !== null\)\) entered \+= 1/.test(
    code('app/(main)/score/enter/ScoreEnterClient.tsx')),
  'the private loop is what disagreed with the other two screens')

/**
 * The two figures must agree where they overlap. Run, not read: the module is
 * pure and node-loadable, so this exercises the real rule rather than asserting
 * that a call appears in a file.
 */
const col = (id: string, type?: string) => ({ id, label: id, ...(type ? { type } : {}) })
const subj = (key: string, columns: ReturnType<typeof col>[]) => ({
  subjectKey: key, labelKm: key, groupLabel: null, maxScore: 10,
  columns, valueKind: 'numeric' as const, sortOrder: 0, origin: 'system' as const,
})

const khmer = subj('khmer_all', [col('kh_read'), col('kh_write')])
const maths = subj('math_general', [col('math_num')])
const rated = subj('sem_eval', [col('sem_eval_effort', 'select')])

const rows = [
  { student_id: 'a', subject: 'kh_read', score_value: 8, score_text: null },
  { student_id: 'b', subject: 'kh_write', score_value: 5, score_text: null },
  // Marked with a Khmer WORD, not a number — the case the private loop dropped.
  { student_id: 'c', subject: 'sem_eval_effort', score_value: null, score_text: 'ល្អ' },
  // Same pupil, second subject: a union counts them once, a sum twice.
  { student_id: 'a', subject: 'math_num', score_value: 7, score_text: null },
]

check('a pupil marked only with a Khmer rating counts as entered',
  rosterProgress([rated], rows, 3).entered === 1,
  `got ${rosterProgress([rated], rows, 3).entered}`)

check('for one subject, rosterProgress equals that subject\'s subjectProgress',
  rosterProgress([khmer], rows, 3).entered === subjectProgress([khmer], rows, 3)[0].entered,
  `${rosterProgress([khmer], rows, 3).entered} vs ${subjectProgress([khmer], rows, 3)[0].entered}`)

check('across subjects it unions rather than sums',
  rosterProgress([khmer, maths], rows, 3).entered === 2,
  `pupil a is marked in both; got ${rosterProgress([khmer, maths], rows, 3).entered}`)

check('and never reports more pupils than the roster holds',
  rosterProgress([khmer, maths, rated], rows, 2).entered === 2 &&
  rosterProgress([khmer, maths, rated], rows, 2).percent === 100,
  'a pupil who left mid-period still carries a mark; the bar must not pass 100%')

check('an empty roster is 0%, never NaN',
  rosterProgress([khmer], [], 0).percent === 0)

check('completionSummary still reads the same rows',
  completionSummary(subjectProgress([khmer, maths, rated], rows, 3)).subjects === 3)

// -------------------------- 9. the boundary is the action, not the keystroke
console.log('\n9. a mark is validated where it is written:')

/**
 * §13 of the brief: "Never accept a score that violates the subject template,
 * the maximum score, a locked period, class scope or teacher assignment
 * permissions. UI validation is not enough."
 *
 * Four of those five were already server-side. The fifth — assignment
 * permissions — was UI-only: `/score/enter`'s picker offers `mySubjects` and
 * nothing checked the payload, and RLS cannot close it, because 00011 makes a
 * writer prove a relationship to the STUDENT and a subject teacher of the class
 * genuinely has one.
 */
const saveSrc = code('app/(main)/score/enter/actions.ts')

check('the write path re-resolves the class rather than trusting the caller',
  saveSrc.includes('resolveServerScope(user.id, classId)'))
check('it refuses a locked period by MEMBERSHIP, not by key',
  saveSrc.includes('p.members.includes(monthId)'),
  'a direct write to an absorbed month inside a locked merged period must fail too')
check('it clamps to the template maximum server-side',
  saveSrc.includes('clampScoreCell(String(s.score_value), max)'))
check('it splits number from Khmer word, so a rating is not written as NULL',
  saveSrc.includes('splitScoreCell('))
check('and it now refuses a subject the caller is not assigned to',
  saveSrc.includes('resolveClassTeachingRole(') && saveSrc.includes('role.coversWholeClass'))

/**
 * The three bounds that keep that last check from locking anyone out. Each is a
 * property of the code, not a promise in a comment.
 */
check('...only when the caller does not cover the whole class',
  /if \(!role\.coversWholeClass\)/.test(saveSrc),
  'homeroom, primary and every legacy account must be untouched')
check('...only for columns the class template defines',
  saveSrc.includes('definedByClass.has(s.subject)'),
  'homework saves through here too, and `hw_5` is in no template')
check('...and the role resolver fails OPEN',
  code('lib/utils/serverScope.ts').includes(
    "const wholeClass: ClassTeachingRole = { isHomeroom: false, subjectKeys: [], coversWholeClass: true }"),
  'a failed read must never stop a teacher entering marks')

/**
 * And the UI must not offer what the boundary will refuse. `/score/total`
 * deliberately SHOWS the class's whole curriculum to a subject teacher — that
 * is the right call for reading — but its cells are editable, so without this
 * it would take the keystroke and fail on save.
 */
check('the totals grid marks a foreign column read-only for a subject teacher',
  code('app/(main)/score/total/ScoreTotalClient.tsx').includes('writableColumns'),
  'the grid and the action must draw the same line')
check('and still shows every subject, narrowing only what may be written',
  code('app/(main)/score/total/ScoreTotalClient.tsx').includes('classSubjects: templateSubjects'),
  'narrowing the READ would divide a subject teacher\'s ranking by their own subject alone')

console.log(
  failures === 0
    ? '\n✓ the score workspace is one vocabulary, one scope and one arithmetic.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
