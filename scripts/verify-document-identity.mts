/**
 * A document says which class it is about, or says why it cannot.
 *
 *     node scripts/verify-document-identity.mts
 *
 * Two contracts, both from the Phase 14 audit, both of which regress silently —
 * the page renders, the paper prints, and the wrong thing is on it.
 *
 *   1. THE CLASS.  Nineteen screens printed `settings.class_name` in their
 *      letterhead. That is the legacy per-TEACHER row — one value for the whole
 *      account — so a teacher holding three classes printed every sheet under
 *      whichever name happened to be stored there. Observed before the fix:
 *      `/ranking` with ៤ខ តេស្ត selected produced a sheet headed **ថ្នាក់ទី៣**,
 *      carrying ៤ខ តេស្ត's marks, above a signature line for the នាយកសាលា.
 *      The reporting ENGINE already had the right rule, so the product printed
 *      the right answer and the wrong answer depending on which route you took.
 *
 *   2. THE EMPTINESS.  `/ranking` had no guard at all: a class with no pupils
 *      rendered the complete ministry sheet — letterhead, title, `0 នាក់ ស្រី 0
 *      នាក់ 0.00%`, signature lines — with print and Excel live. A teacher could
 *      hand in a signed empty document. `/certificate` showed "please wait,
 *      loading…" for ever for the same class.
 *
 * The pure halves are imported and RUN; the screens are `.tsx` this node
 * harness cannot import, so those are asserted by reading the source — which is
 * the right tool anyway, since what needs guarding is whether a file still
 * reaches for a value it should not.
 *
 * Exits non-zero on any failure.
 */

import * as nodeModule from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

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

const rootUrl = new URL('../', import.meta.url)
const root = fileURLToPath(rootUrl)

registerHooks({
  resolve(specifier, context, nextResolve) {
    const base = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), rootUrl)
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

const { documentClassName } = await import('../lib/reporting/document-identity.ts')
const { resultAvailability, RESULT_EMPTY_COPY } = await import('../lib/scores/resultAvailability.ts')

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

const read = (p: string) => readFileSync(join(root, p), 'utf8')
/** Comments explain the rules; only executable code can break them. */
const code = (p: string) =>
  read(p)
    .replace(/(^|[\s{;,()=>])\/\*[\s\S]*?\*\//g, '$1')
    .replace(/^[ \t]*\/\/.*$/gm, '')

// ---------------------------------------------------------- 1. the class name
console.log('\n1. a document names the class its data belongs to:')

check('the active class wins', documentClassName('៤ខ តេស្ត', 'ថ្នាក់ទី៣') === '៤ខ តេស្ត',
  'this is the exact pair observed printing the wrong name')
check('settings is the FALLBACK, not the preference',
  documentClassName(null, 'ថ្នាក់ទី៣') === 'ថ្នាក់ទី៣',
  'a pre-V2 account has no class row, and this is the only name it has')
check('...and an empty active name is not a name',
  documentClassName('   ', 'ថ្នាក់ទី៣') === 'ថ្នាក់ទី៣')
check('neither resolves -> empty, never an invented placeholder',
  documentClassName(null, null) === '',
  "a sheet's own 'ថ្នាក់៖ ......' blank belongs to the sheet, not to this rule")

/** One rule, not two — the defect was the engine and the screens disagreeing. */
check('the engine composes the header through the shared rule',
  code('lib/reporting/report-data.ts').includes('documentClassName('),
  'report-data.ts had its own copy; that copy IS this function now')
check('the client half reads the active class, not a prop',
  code('lib/hooks/useDocumentClassName.ts').includes('useActiveClass()'),
  'the same selection ?class= carries to the server')

/**
 * The screens. A file may still MENTION `settings.class_name` — it is the
 * fallback argument every one of them passes to the hook — but it must not read
 * it as the value. Stripping the hook call is what separates the two.
 */
const PRINT_SCREENS = [
  'certificate/CertificateClient', 'class-admin/[book]/BookClient',
  'homework/enter/HomeworkPrintSheet', 'honor-roll/HonorRollClient',
  'id-student/IdStudentClient', 'parent-report/ParentReportClient',
  'print-list/PrintListClient', 'print-student-age/PrintStudentAgeClient',
  'ranking/RankingClient', 'record-book/RecordBookClient',
  'score-analyse/CognitivePanel', 'score/print/ScorePrintClient',
  'score/total/ScoreTotalPrint', 'student-tracking/StudentTrackingClient',
  'yearly-report/ReportFrame',
]
for (const screen of PRINT_SCREENS) {
  const src = code(`app/(main)/${screen}.tsx`)
    .replace(/useDocumentClassName\(settings\?\.class_name\)/g, '')
  check(`${screen} reads the shared rule, not settings`,
    !src.includes('settings?.class_name') && !src.includes('settings.class_name'))
}

/**
 * Two screens legitimately still read it, and are named so the exception is a
 * checked fact rather than an oversight. Attendance is absent from this list on
 * purpose: its screens were excluded from the Phase 14 audit because the
 * register was being rewritten at the time, so they are a KNOWN gap.
 */
const SETTINGS_BY_DESIGN: Record<string, string> = {
  'app/(main)/inventory/InventoryClient.tsx': 'the room, not the class — /inventory is not class-scoped',
  'app/(main)/print-center/page.tsx': 'resolved server-side as the legacy label for ClassContextBar, only when the account has no class row',
}
for (const [file, why] of Object.entries(SETTINGS_BY_DESIGN)) {
  check(`${file.split('/').pop()} still reads settings — ${why}`,
    code(file.replace(/^/, '')).includes('class_name'),
    'if this stopped being true, delete the exception rather than leaving it')
}

// --------------------------------------------------------- 2. the pupil number
console.log('\n2. a sheet prints the pupil\'s number, not a database id:')

const ranking = code('app/(main)/ranking/RankingClient.tsx')
check('the ranking sheet prints student_id',
  ranking.includes('toKhmerNumber(stu.student_id'),
  'it printed `stu.id` — 36 characters of uuid in the អត្តលេខ column')
check('...and no longer prints the row id',
  !/>\{stu\.id\}</.test(ranking))
check('the record book agrees, as it always did',
  code('app/(main)/record-book/RecordBookClient.tsx').includes('student.student_id'))

// ------------------------------------------------------------ 3. the emptiness
console.log('\n3. a results screen has a result, or says why not:')

check('an empty class is an empty CLASS, not missing marks',
  resultAvailability(0, 0) === 'no-roster',
  'telling a teacher with no pupils to enter marks sends them to a grid with no rows')
check('pupils but nothing marked -> no marks', resultAvailability(30, 0) === 'no-marks')
check('one marked pupil is enough to draw a sheet', resultAvailability(30, 1) === 'ready')
check('every empty state carries the action that resolves it',
  (['no-roster', 'no-marks'] as const).every(
    (s) => RESULT_EMPTY_COPY[s].action.label.length > 0 && RESULT_EMPTY_COPY[s].action.href.startsWith('/')),
  'a screen that says "nothing here" and offers no way out is a dead end with manners')

/**
 * ELIGIBILITY IS NOT EMPTINESS. A class can be fully marked and honour nobody;
 * that is a result. `/honor-roll` owns that third answer and this module must
 * not grow it, or the honour rule would have two homes.
 */
check('the shared rule does not decide eligibility',
  !code('lib/scores/resultAvailability.ts').includes('evaluateHonor') &&
  !JSON.stringify(RESULT_EMPTY_COPY).includes('លក្ខខណ្ឌ'),
  'lib/scores/honor.ts is where a criterion lives')
check('...and the honour roll still keeps its own third state',
  code('app/(main)/honor-roll/HonorRollClient.tsx').includes("'none-eligible'"))

check('the ranking screen refuses to draw a sheet it has nothing for',
  ranking.includes('resultAvailability(') && /if \(availability !== 'ready'\)/.test(ranking),
  'it used to fall straight through to setShowPreview(true)')
check('...and says so on the screen, not in a toast that leaves',
  ranking.includes('<ResultEmptyState'))

for (const screen of ['ranking/RankingClient', 'honor-roll/HonorRollClient', 'certificate/CertificateClient']) {
  check(`${screen} renders the shared empty state`,
    code(`app/(main)/${screen}.tsx`).includes('<ResultEmptyState'))
}
check('the certificate no longer calls an empty class "loading"',
  code('app/(main)/certificate/CertificateClient.tsx').includes('initialStudents.length === 0'),
  'it showed "សូមរង់ចាំបន្តិច ទិន្នន័យកំពុងទាញយក..." for ever for a class with no pupils')

console.log(
  failures === 0
    ? '\n✓ documents name their class, and empty screens explain themselves.\n'
    : `\n✗ ${failures} failure(s)\n`,
)
process.exit(failures === 0 ? 0 : 1)
