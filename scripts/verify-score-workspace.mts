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
const { monthIdFromPeriod, monthlyAveragesByStudent } = await import('../lib/scores/aggregate.ts')
const { DEFAULT_SCHEME_CONFIG } = await import('../lib/grading/scheme.ts')

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
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
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
  'app/(main)/score-analysis/subject/SubjectAnalysisClient.tsx',
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

console.log(
  failures === 0
    ? '\n✓ the score workspace is one vocabulary, one scope and one arithmetic.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
