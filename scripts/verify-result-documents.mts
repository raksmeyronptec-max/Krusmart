/**
 * RESULTS → DOCUMENTS: the arrow, and the four things that make it honest.
 *
 *     node scripts/verify-result-documents.mts
 *
 * Phase 12's headline finding was that this arrow did not exist. `/ranking`,
 * `/honor-roll`, `/score/total` and `/yearly-report` referenced `/print-center`
 * zero times between them, so the moment a teacher had the thing they came for
 * — a ranked class — the product had no answer to "how do I print this?" other
 * than the sidebar. Four related defects sat around it: the honour roll could
 * not be left at all, the ranking sheet had two production paths that
 * referenced each other nowhere, two class-card/dashboard controls sent a
 * teacher to a read-only sheet when they meant to mark a register, and the
 * year's results were filed under the module named for reports rather than the
 * one named for results.
 *
 * Every one of those regresses SILENTLY — a link that still goes somewhere
 * plausible, a screen that still renders. So the properties are checked rather
 * than trusted:
 *
 *   1. THE MAPPING.    Every result surface, on every rung, names a report that
 *                      exists in the catalogue — and the rung decides which.
 *   2. THE HONESTY.    A link only offers to GENERATE what `reportAvailability`
 *                      says can be generated, and only carries a period in the
 *                      shape the report itself declares.
 *   3. THE CONTEXT.    The class, the year and the period travel, through the
 *                      app's own `withClassParam` and the centre's own
 *                      parameter names — never a second scheme.
 *   4. THE DOORS.      No screen is a dead end, and no document has two equally
 *                      prominent front doors.
 *
 * The pure half is imported and run; the screens are `.tsx` this node harness
 * cannot import, so those are asserted by reading the source — which is the
 * right tool anyway, since what needs guarding is that a screen has not grown a
 * private copy of a shared rule.
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

const root = new URL('../', import.meta.url)

registerHooks({
  resolve(specifier, context, nextResolve) {
    const base = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), root)
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

const { documentForResult, resultDocument } = await import('../lib/reporting/result-documents.ts')
const { REPORT_DEFINITIONS, reportDefinition } = await import('../lib/reporting/report-types.ts')
const { reportAvailability } = await import('../lib/reporting/report-template.ts')
const { SCORE_WORKSPACE_TABS } = await import('../lib/scores/workspace.ts')
const { NAV_MODULES, moduleForPath, searchEntries, sectionsForRoles } =
  await import('../lib/navigation.ts')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const read = (p: string) => readFileSync(new URL(p, root), 'utf8')

/**
 * A file with its comments removed.
 *
 * Several checks below are absences — "this screen no longer points at X" — and
 * a file that *explains why it no longer points at X* mentions X. Matching raw
 * source there fails on its own documentation, which would train the next
 * person to delete the explanation rather than keep the property.
 */
const code = (p: string) =>
  read(p)
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^[ \t]*\/\/.*$/gm, '')

const SCOPES = ['monthly', 'semester', 'annual'] as const
const SURFACES = ['score_total', 'ranking', 'honor', 'annual'] as const

// ------------------------------------------------------------- 1. the mapping
console.log('\n1. every result names a report that exists:')

for (const surface of SURFACES) {
  for (const scope of SCOPES) {
    const type = documentForResult(surface, scope)
    check(`${surface} · ${scope} → ${type}`, Boolean(reportDefinition(type)),
      'the mapping must read the catalogue, never invent a type')
  }
}

/** The rung decides the report; a link that ignored it would print the wrong period. */
check('the ranking rungs are three different documents',
  new Set(SCOPES.map((s) => documentForResult('ranking', s))).size === 3)
check('and so are the score sheets',
  new Set(SCOPES.map((s) => documentForResult('score_total', s))).size === 3)

/**
 * `/score/total`'s ឆ្នាំ rung is the one entry that is not the obvious name.
 * `score_annual` carries `resolver: false` and no template — its only offer is
 * its own legacy screen, which IS `/score/total` — so the year resolves to
 * `annual_summary`, which CLAUDE.md already records as its engine equivalent.
 */
check('the year of the totals table resolves to the sheet that can be produced',
  documentForResult('score_total', 'annual') === 'annual_summary')
check('...because score_annual genuinely cannot be',
  reportAvailability(reportDefinition('score_annual')!).action !== 'generate',
  'if score_annual ever gains a resolver and a template, point the year at it')
check('...and annual_summary genuinely can',
  reportAvailability(reportDefinition('annual_summary')!).action === 'generate')

// ------------------------------------------------------------- 2. the honesty
console.log('\n2. a link offers only what the catalogue says it can:')

const target = (surface: (typeof SURFACES)[number], scope: (typeof SCOPES)[number], extra = {}) =>
  resultDocument({
    surface,
    period: { scope, monthId: 'dec', semester: 'sem2', ...extra },
    classId: 'c1',
    academicYear: '2025-2026',
  })

for (const surface of SURFACES) {
  for (const scope of SCOPES) {
    const t = target(surface, scope)
    const definition = reportDefinition(t.reportType)!
    const generates = reportAvailability(definition).action === 'generate'
    check(`${surface} · ${scope} claims generation only when it can`, t.generates === generates)
    check(`${surface} · ${scope} names the report only when it opens the flow`,
      t.href.includes(`report=${t.reportType}`) === generates, t.href)
    check(`${surface} · ${scope} says what it does`,
      t.label === (generates ? 'បង្កើតរបាយការណ៍' : 'មើលរបាយការណ៍'), t.label)
  }
}

/**
 * The period travels only in the shape the report declares. `honor` is
 * `period: 'month'`, so a semester's honour roll must carry no `semester=` —
 * a parameter the flow would ignore is a claim the address bar makes and the
 * page does not honour, and it gets copied into shared links.
 */
check('a month report carries a month', target('ranking', 'monthly').href.includes('month=dec'))
check('...and never a semester', !target('ranking', 'monthly').href.includes('semester='))
check('a semester report carries a semester',
  target('ranking', 'semester').href.includes('semester=sem2'))
check('...and never a month', !target('ranking', 'semester').href.includes('month='))
check('a year report carries neither',
  !/[?&](month|semester)=/.test(target('ranking', 'annual').href),
  target('ranking', 'annual').href)
check('the honour roll on a semester carries no period it cannot use',
  !/[?&](month|semester)=/.test(target('honor', 'semester').href),
  `honor declares period '${reportDefinition('honor')!.period}'`)

// ------------------------------------------------------------- 3. the context
console.log('\n3. the class, the year and the period all travel:')

const full = target('ranking', 'monthly')
check('the destination is the Print Center', full.href.startsWith('/print-center?'))
check('the class travels', full.href.includes('class=c1'))
check('the year travels', full.href.includes('year=2025-2026'))
check('the family travels', full.href.includes('category=ranking'))

/**
 * Through the shared `withClassParam`, not a hand-appended `?class=` — the rule
 * about which routes may carry one has to stay in a single place.
 */
check('the class rides the shared helper, not a local append',
  code('lib/reporting/result-documents.ts').includes('withClassParam('))
check('a pre-V2 account gets no empty promise',
  !resultDocument({ surface: 'ranking', period: { scope: 'annual' }, classId: null })
    .href.includes('class='))

/** ...and the centre actually reads back every parameter the link sends. */
const centre = code('app/(main)/print-center/page.tsx')
for (const param of ['report', 'category', 'year', 'month', 'semester']) {
  check(`the Print Center reads ?${param}=`, centre.includes(`one('${param}')`), param)
}
check('...and validates the report against the catalogue',
  centre.includes('isReportType(requestedReport)'),
  'a forged type must degrade to the family, never open a dialog over nothing')
check('...and hands the period to the generation flow',
  code('app/(main)/print-center/PrintCenterClient.tsx').includes('initialPeriod={handoff') &&
  code('app/(main)/print-center/GenerateReportDialog.tsx').includes("setPeriod(initialPeriod ?? 'nov')"))

// --------------------------------------------------------------- 4. the doors
console.log('\n4. every results screen has a way on to its document:')

const SCREENS: Record<string, string> = {
  '/score/total': 'app/(main)/score/total/ScoreTotalClient.tsx',
  '/ranking': 'app/(main)/ranking/RankingClient.tsx',
  '/honor-roll': 'app/(main)/honor-roll/HonorRollClient.tsx',
  '/yearly-report': 'app/(main)/yearly-report/YearlyReportClient.tsx',
}
for (const [route, file] of Object.entries(SCREENS)) {
  check(`${route} offers the document action`, code(file).includes('<ResultDocumentLink'))
  check(`${route} does not build the destination itself`,
    !/['"`]\/print-center/.test(code(file)),
    'the mapping and the availability check live in lib/reporting/result-documents.ts')
}

/**
 * `/score-analyse` deliberately gets NO document action: the catalogue holds no
 * analysis report, and a button that opened the index on nothing in particular
 * is the meaningless control §13 of the brief forbids. Asserted as a property
 * of the catalogue rather than left as a comment, so the day an analysis report
 * is added this check tells someone to wire the screen up.
 */
check('there is still no analysis report to offer',
  !REPORT_DEFINITIONS.some((r: { legacyHref: string | null }) => r.legacyHref === '/score-analyse'),
  'add one and /score-analyse should gain a ResultDocumentLink')
check('so the analysis screen offers none',
  !code('app/(main)/score-analyse/ScoreAnalyseClient.tsx').includes('<ResultDocumentLink'))

/** The honour roll's dead end (F7): it had no header, no hook and no href. */
console.log('\n   the honour roll is no longer a dead end:')
const honour = code('app/(main)/honor-roll/HonorRollClient.tsx')
check('it is a door in the workspace strip',
  SCORE_WORKSPACE_TABS.some((t: { href: string }) => t.href === '/honor-roll'))
check('it wears the header that renders the strip', honour.includes('<ScoreWorkspaceHeader'))
check('so it carries links out of itself', honour.includes('<ResultDocumentLink'))
check('and it is offered by the results module, not hidden in one',
  moduleForPath('/honor-roll')?.id === 'results')

/**
 * The two ranking productions (F6). Neither was deleted — the screen's print
 * and Excel still work, and the engine's three ranking reports still generate —
 * but they are no longer two equal claims to "the ranking document": the
 * screen's own controls are named for the screen.
 */
console.log('\n   the two ranking print paths are no longer equals:')
const ranking = code('app/(main)/ranking/RankingClient.tsx')
check('the engine path is offered on the screen', ranking.includes('<ResultDocumentLink'))
check('the screen keeps its own quick print', ranking.includes('window.print()'))
check('...but names it as the screen, not as the document',
  ranking.includes('បោះពុម្ពអេក្រង់នេះ') && ranking.includes('ទាញយកអេក្រង់នេះជា Excel'))
check('and the engine still holds all three ranking sheets',
  (['ranking_monthly', 'ranking_semester', 'ranking_annual'] as const).every(
    (t) => reportAvailability(reportDefinition(t)!).action === 'generate'))

/** The misspelling, on the two surfaces this phase touched. */
for (const file of [
  'app/(main)/ranking/RankingClient.tsx',
  'app/(main)/honor-roll/HonorRollClient.tsx',
]) {
  check(`${file.split('/').pop()} spells it បោះពុម្ព`, !read(file).includes('បោះពុម្ភ'))
}

// ------------------------------------------------------ 5. the attendance rider
console.log('\n5. វត្តមាន leads to the register, not to a sheet:')

/**
 * `/attendance/monthly` reads a month and prints it — its `actions.ts` exports
 * `getMonthlyAttendance` and `getTeacherSettings` and no write of any kind. Two
 * controls sent a teacher there when they meant to mark a register.
 */
const monthlyActions = read('app/(main)/attendance/monthly/actions.ts')
check('the monthly sheet is still read-only, which is why this matters',
  !/export async function (save|upsert|set|mark|delete)/i.test(monthlyActions))

const classroom = code('app/(main)/classroom/ClassroomClient.tsx')
check("the class card's វត្តមាន tool opens the register",
  /label: 'វត្តមាន', href: '\/attendance\/layout'/.test(classroom), 'ClassroomClient CLASS_TOOLS')
check('...and no class tool points at the monthly sheet',
  !classroom.includes("'/attendance/monthly'"))

const dashboard = code('app/(main)/dashboard/page.tsx')
check('the dashboard tile that says ថ្ងៃនេះ opens today\'s register',
  dashboard.includes("href={href('/attendance/layout')}"))
check('...and the dashboard no longer sends anyone to the monthly sheet',
  !dashboard.includes("'/attendance/monthly'"))

// -------------------------------------------------------- 6. one front door
console.log('\n6. no document has two equally prominent front doors:')

const visible = searchEntries(sectionsForRoles(['teacher'] as never))
type Entry = { href: string; label: string }

/**
 * វិញ្ញាបនបត្រ was reachable two ways with different affordances: an ឯកសារ menu
 * item opening `/certificate`'s browser print, and a Print Center row
 * generating a Word file from a versioned template (F13). Two correct answers
 * to "where are my documents?" is one too many.
 */
const certificateDoors = visible.filter((e: Entry) => /certificate/.test(e.href))
check('exactly one certificate destination is offered',
  certificateDoors.length === 1,
  certificateDoors.map((e: Entry) => e.href).join(', '))
check('...and it is the Print Center family',
  certificateDoors[0]?.href === '/print-center?category=certificate')
check('the certificate screen keeps its route, declared so paths still resolve',
  moduleForPath('/certificate') !== undefined)
check('...and is hidden rather than deleted',
  NAV_MODULES.flatMap((m: { children?: { href: string; hidden?: boolean }[] }) => m.children ?? [])
    .some((c: { href: string; hidden?: boolean }) => c.href === '/certificate' && c.hidden === true))

/**
 * The annual RESULT is what a teacher learns and belongs under លទ្ធផល; the
 * annual REPORT is what they print and stays a row in the Print Center (F14).
 * No route moved — this is a regrouping.
 */
console.log('\n   the year\'s results are filed with the results:')
for (const path of [
  '/yearly-report',
  '/yearly-report/promoted',
  '/yearly-report/repeated',
  '/yearly-report/subject-results',
]) {
  check(`${path} → លទ្ធផល`, moduleForPath(path)?.id === 'results', `got ${moduleForPath(path)?.id}`)
}
check('and the year is actually offered there, not hidden',
  visible.some((e: Entry) => e.href === '/yearly-report'))
check('the Print Center is still the single document index',
  moduleForPath('/print-center')?.id === 'reports')

/**
 * One href, one module — the property `PATH_INDEX`'s longest-match sort depends
 * on. Two entries for one path would make the sidebar highlight whichever the
 * sort happened to reach first.
 */
const allHrefs = NAV_MODULES.flatMap(
  (m: { href: string; children?: { href: string }[] }) => [m.href, ...(m.children ?? []).map((c) => c.href)],
)
const owners = (h: string) =>
  new Set(
    NAV_MODULES.filter(
      (m: { href: string; children?: { href: string }[] }) =>
        m.href === h || (m.children ?? []).some((c) => c.href === h),
    ).map((m: { id: string }) => m.id),
  )
const crossModule = [...new Set<string>(allHrefs)].filter((h) => !h.includes('?') && owners(h).size > 1)
check('no href is claimed by two modules', crossModule.length === 0, crossModule.join(', '))

console.log(
  failures === 0
    ? '\n✓ results lead to documents, with the class, the year and the period intact.'
    : `\n✗ ${failures} check(s) failed`,
)
process.exit(failures === 0 ? 0 : 1)
